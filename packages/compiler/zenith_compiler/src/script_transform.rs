use std::collections::{BTreeMap, BTreeSet};

use tree_sitter::Node;

use crate::expression_scope::{
    apply_rewrites, collect_block_scope_bindings, collect_function_parameter_bindings,
    collect_function_scope_bindings, collect_pattern_bindings,
    collect_variable_declaration_bindings, node_text, scope_contains, ReplacementEdit,
};
use crate::expression_syntax::parse_valid_typescript;
use crate::script::{HoistedBinding, HoistedBindingKind};
use crate::script_patterns::{
    classify_binding_kind, collect_binding_declarations_from_pattern,
    collect_binding_pattern_renames, PatternBindingDeclaration,
};
use crate::script_sections::{
    collect_import_ranges, collect_top_level_declarations, dedupe_preserve_order, remove_ranges,
};
use crate::script_state::{normalize_state_declarations, StateDeclaration};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StructuredScriptAnalysis {
    pub(crate) imports: Vec<String>,
    pub(crate) source_without_imports: String,
    pub(crate) renamed_source: String,
    pub(crate) declarations: Vec<String>,
    pub(crate) bindings: Vec<HoistedBinding>,
}

type BindingDeclaration = PatternBindingDeclaration;

pub(crate) fn analyze_component_script_structure(
    source: &str,
    _component_path: &str,
    rename_prefix: &str,
) -> Result<StructuredScriptAnalysis, String> {
    let (normalized_source, state_declarations) = normalize_state_declarations(source);
    let tree = parse_valid_typescript(&normalized_source)
        .map_err(|_| "invalid TypeScript syntax in component script".to_string())?;
    let root = tree.root_node();

    let import_ranges = collect_import_ranges(root);
    let imports = dedupe_preserve_order(
        import_ranges
            .iter()
            .map(|(start, end)| source[*start..*end].trim().to_string())
            .filter(|entry| !entry.is_empty())
            .collect(),
    );
    let source_without_imports = remove_ranges(source, &import_ranges);

    let state_by_start = state_declarations
        .iter()
        .map(|decl| (decl.statement_start, decl.clone()))
        .collect::<BTreeMap<_, _>>();
    let binding_declarations =
        collect_top_level_bindings(root, &normalized_source, &state_by_start)?;
    let bindings = build_bindings(binding_declarations, rename_prefix)?;

    let mut transformer = ScriptTransformer::new(&normalized_source, &bindings, &state_by_start);
    transformer.visit_program(root, &mut Vec::new());
    let renamed_source = apply_rewrites(source, &transformer.edits)
        .trim()
        .to_string();

    let declarations = collect_top_level_declarations(&renamed_source);

    Ok(StructuredScriptAnalysis {
        imports,
        source_without_imports,
        renamed_source,
        declarations,
        bindings,
    })
}

fn build_bindings(
    declared: Vec<BindingDeclaration>,
    rename_prefix: &str,
) -> Result<Vec<HoistedBinding>, String> {
    let mut bindings = Vec::new();
    for declaration in declared {
        if bindings
            .iter()
            .any(|existing: &HoistedBinding| existing.original == declaration.original)
        {
            return Err(format!(
                "component script declaration collision: `{}` declared multiple times",
                declaration.original
            ));
        }
        bindings.push(HoistedBinding {
            original: declaration.original.clone(),
            renamed: format!("{rename_prefix}{}", declaration.original),
            kind: declaration.kind,
        });
    }
    Ok(bindings)
}

fn collect_top_level_bindings(
    root: Node<'_>,
    source: &str,
    state_by_start: &BTreeMap<usize, StateDeclaration>,
) -> Result<Vec<BindingDeclaration>, String> {
    let mut declared = Vec::new();
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        match child.kind() {
            "function_declaration" => {
                let Some(name) = child.child_by_field_name("name") else {
                    continue;
                };
                let ident = node_text(name, source).to_string();
                if ident.is_empty() {
                    continue;
                }
                declared.push(BindingDeclaration {
                    identifier_start: name.start_byte(),
                    original: ident,
                    kind: HoistedBindingKind::Function,
                });
            }
            "lexical_declaration" | "variable_declaration" => {
                let kind_override = state_by_start.get(&child.start_byte());
                let mut decl_cursor = child.walk();
                for declarator in child.named_children(&mut decl_cursor) {
                    if declarator.kind() != "variable_declarator" {
                        continue;
                    }
                    let Some(name) = declarator.child_by_field_name("name") else {
                        continue;
                    };
                    let kind = if matches!(kind_override, Some(state) if node_text(name, source) == state.name)
                    {
                        HoistedBindingKind::State
                    } else {
                        classify_binding_kind(declarator, source)
                    };
                    collect_binding_declarations_from_pattern(name, source, kind, &mut declared);
                }
            }
            _ => {}
        }
    }
    declared.sort_by(|left, right| left.identifier_start.cmp(&right.identifier_start));
    Ok(declared)
}

struct ScriptTransformer<'a> {
    normalized_source: &'a str,
    bindings_by_name: BTreeMap<String, HoistedBinding>,
    state_by_start: &'a BTreeMap<usize, StateDeclaration>,
    edits: Vec<ReplacementEdit>,
}

impl<'a> ScriptTransformer<'a> {
    fn new(
        normalized_source: &'a str,
        bindings: &[HoistedBinding],
        state_by_start: &'a BTreeMap<usize, StateDeclaration>,
    ) -> Self {
        Self {
            normalized_source,
            bindings_by_name: bindings
                .iter()
                .cloned()
                .map(|binding| (binding.original.clone(), binding))
                .collect(),
            state_by_start,
            edits: Vec::new(),
        }
    }

    fn replace(&mut self, start: usize, end: usize, text: impl Into<String>) {
        self.edits.push(ReplacementEdit {
            start,
            end,
            text: text.into(),
        });
    }

    fn visit_program(&mut self, root: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let mut cursor = root.walk();
        for child in root.named_children(&mut cursor) {
            self.visit_node(child, scopes, true);
        }
    }

    fn visit_node(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>, top_level: bool) {
        match node.kind() {
            "function_declaration" => self.visit_function_declaration(node, scopes, top_level),
            "arrow_function" | "function_expression" => {
                self.visit_function_like(node, scopes, false)
            }
            "statement_block" => self.visit_statement_block(node, scopes),
            "catch_clause" => self.visit_catch_clause(node, scopes),
            "lexical_declaration" | "variable_declaration" => {
                self.visit_variable_declaration(node, scopes, top_level)
            }
            "assignment_expression" if self.try_rewrite_state_assignment(node, scopes) => {}
            "identifier" => self.visit_identifier(node, scopes),
            "shorthand_property_identifier" => {
                self.visit_shorthand_property_identifier(node, scopes)
            }
            "property_identifier" | "shorthand_property_identifier_pattern" => {}
            _ => {
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    self.visit_node(child, scopes, false);
                }
            }
        }
    }

    fn visit_function_declaration(
        &mut self,
        node: Node<'_>,
        scopes: &mut Vec<BTreeSet<String>>,
        top_level: bool,
    ) {
        if top_level {
            if let Some(name) = node.child_by_field_name("name") {
                self.rename_binding_identifier(name);
            }
        }
        self.visit_function_like(node, scopes, top_level);
    }

    fn visit_function_like(
        &mut self,
        node: Node<'_>,
        scopes: &mut Vec<BTreeSet<String>>,
        top_level: bool,
    ) {
        let mut function_scope = BTreeSet::new();
        if !top_level && node.kind() != "arrow_function" {
            if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_bindings(name, self.normalized_source, &mut function_scope);
            }
        }
        function_scope.extend(collect_function_parameter_bindings(
            node,
            self.normalized_source,
        ));
        if let Some(body) = node.child_by_field_name("body") {
            collect_function_scope_bindings(body, self.normalized_source, &mut function_scope);
        }
        scopes.push(function_scope);
        if let Some(parameters) = node.child_by_field_name("parameters") {
            self.visit_parameter_defaults(parameters, scopes);
        }
        if let Some(body) = node.child_by_field_name("body") {
            self.visit_node(body, scopes, false);
        }
        scopes.pop();
    }

    fn visit_parameter_defaults(&mut self, params: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let mut cursor = params.walk();
        for param in params.named_children(&mut cursor) {
            self.visit_parameter_node(param, scopes);
        }
    }

    fn visit_parameter_node(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        match node.kind() {
            "identifier" | "shorthand_property_identifier_pattern" => {}
            "assignment_pattern" => {
                if let Some(value) = node.named_child(1) {
                    self.visit_node(value, scopes, false);
                }
            }
            "required_parameter" | "optional_parameter" | "rest_pattern" | "object_pattern"
            | "array_pattern" | "pair_pattern" => {
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    self.visit_parameter_node(child, scopes);
                }
            }
            _ => self.visit_node(node, scopes, false),
        }
    }

    fn visit_statement_block(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        scopes.push(collect_block_scope_bindings(node, self.normalized_source));
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.visit_node(child, scopes, false);
        }
        scopes.pop();
    }

    fn visit_catch_clause(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let mut catch_scope = BTreeSet::new();
        if let Some(parameter) = node.child_by_field_name("parameter") {
            collect_pattern_bindings(parameter, self.normalized_source, &mut catch_scope);
        }
        scopes.push(catch_scope);
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if node.child_by_field_name("parameter") == Some(child) {
                continue;
            }
            self.visit_node(child, scopes, false);
        }
        scopes.pop();
    }

    fn visit_variable_declaration(
        &mut self,
        node: Node<'_>,
        scopes: &mut Vec<BTreeSet<String>>,
        top_level: bool,
    ) {
        if top_level {
            if let Some(state_decl) = self.state_by_start.get(&node.start_byte()) {
                self.replace(state_decl.keyword_start, state_decl.keyword_end, "var");
            }
            let mut cursor = node.walk();
            for declarator in node.named_children(&mut cursor) {
                if declarator.kind() != "variable_declarator" {
                    continue;
                }
                let Some(name) = declarator.child_by_field_name("name") else {
                    continue;
                };
                self.rename_binding_pattern(name);
                let initializer = declarator
                    .child_by_field_name("value")
                    .or_else(|| declarator.named_child(1));
                if let Some(value) = initializer {
                    if self.is_state_declarator(node, name) {
                        self.replace(value.start_byte(), value.start_byte(), "signal(");
                        self.replace(value.end_byte(), value.end_byte(), ")");
                    }
                    self.visit_node(value, scopes, false);
                }
            }
            return;
        }

        if let Some(scope) = scopes.last_mut() {
            collect_variable_declaration_bindings(node, self.normalized_source, scope);
        }
        let mut cursor = node.walk();
        for declarator in node.named_children(&mut cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }
            if let Some(value) = declarator
                .child_by_field_name("value")
                .or_else(|| declarator.named_child(1))
            {
                self.visit_node(value, scopes, false);
            }
        }
    }

    fn is_state_declarator(&self, declaration: Node<'_>, name: Node<'_>) -> bool {
        matches!(
            self.state_by_start.get(&declaration.start_byte()),
            Some(state) if state.name == node_text(name, self.normalized_source)
        )
    }

    fn rename_binding_identifier(&mut self, node: Node<'_>) {
        let ident = node_text(node, self.normalized_source);
        let Some(binding) = self.bindings_by_name.get(ident) else {
            return;
        };
        let renamed = binding.renamed.clone();
        self.replace(node.start_byte(), node.end_byte(), renamed);
    }

    fn rename_binding_pattern(&mut self, node: Node<'_>) {
        collect_binding_pattern_renames(
            node,
            self.normalized_source,
            &self.bindings_by_name,
            false,
            &mut self.edits,
        );
    }

    fn try_rewrite_state_assignment(
        &mut self,
        node: Node<'_>,
        scopes: &mut Vec<BTreeSet<String>>,
    ) -> bool {
        let Some(left) = node
            .child_by_field_name("left")
            .or_else(|| node.named_child(0))
        else {
            return false;
        };
        let Some(operator) = node
            .child_by_field_name("operator")
            .or_else(|| node.child(1))
        else {
            return false;
        };
        let Some(right) = node
            .child_by_field_name("right")
            .or_else(|| node.named_child(1))
        else {
            return false;
        };
        if left.kind() != "identifier" || node_text(operator, self.normalized_source) != "=" {
            return false;
        }
        let ident = node_text(left, self.normalized_source);
        let Some(binding) = self.bindings_by_name.get(ident) else {
            return false;
        };
        if !matches!(binding.kind, HoistedBindingKind::State) || scope_contains(scopes, ident) {
            return false;
        }
        self.replace(
            left.start_byte(),
            right.start_byte(),
            format!("{}.set(", binding.renamed),
        );
        self.replace(node.end_byte(), node.end_byte(), ")");
        self.visit_node(right, scopes, false);
        true
    }

    fn visit_identifier(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let ident = node_text(node, self.normalized_source);
        if scope_contains(scopes, ident) {
            return;
        }
        let Some(binding) = self.bindings_by_name.get(ident) else {
            return;
        };

        let replacement = if matches!(binding.kind, HoistedBindingKind::State)
            && !self.is_signal_method_reference(node)
        {
            format!("{}.get()", binding.renamed)
        } else {
            binding.renamed.clone()
        };
        self.replace(node.start_byte(), node.end_byte(), replacement);
    }

    fn visit_shorthand_property_identifier(
        &mut self,
        node: Node<'_>,
        scopes: &mut Vec<BTreeSet<String>>,
    ) {
        let ident = node_text(node, self.normalized_source);
        if scope_contains(scopes, ident) {
            return;
        }
        let Some(binding) = self.bindings_by_name.get(ident) else {
            return;
        };
        let value = if matches!(binding.kind, HoistedBindingKind::State) {
            format!("{ident}: {}.get()", binding.renamed)
        } else {
            format!("{ident}: {}", binding.renamed)
        };
        self.replace(node.start_byte(), node.end_byte(), value);
    }

    fn is_signal_method_reference(&self, node: Node<'_>) -> bool {
        let Some(parent) = node.parent() else {
            return false;
        };
        if parent.kind() != "member_expression" {
            return false;
        }
        if parent.child_by_field_name("object") != Some(node) {
            return false;
        }
        matches!(
            parent.child_by_field_name("property"),
            Some(property) if matches!(node_text(property, self.normalized_source), "get" | "set")
        )
    }
}
