use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use tree_sitter::{Node, Parser, Tree};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ScopedExpressionAnalysis {
    pub rewritten: String,
    pub free_identifiers: BTreeSet<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ReplacementEdit {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) text: String,
}

fn typescript_language() -> tree_sitter::Language {
    tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
}

pub(crate) fn typescript_parser() -> Parser {
    let mut parser = Parser::new();
    parser
        .set_language(_language_once())
        .expect("tree-sitter TypeScript grammar");
    parser
}

pub(crate) fn parse_typescript(source: &str) -> Option<Tree> {
    let mut parser = typescript_parser();
    parser.parse(source, None)
}

fn parse_expression_root(expr: &str) -> Option<(String, Tree)> {
    let wrapped = format!("const __zenith_expr__ = ({expr});");
    let tree = parse_typescript(&wrapped)?;
    Some((wrapped, tree))
}

fn find_expression_node(tree: &Tree) -> Option<Node<'_>> {
    let root = tree.root_node();
    let declaration = root.named_child(0)?;
    let declarator = declaration.named_child(0)?;
    let initializer = declarator.named_child(1)?;
    if initializer.kind() == "parenthesized_expression" {
        initializer.named_child(0)
    } else {
        Some(initializer)
    }
}

pub(crate) fn apply_rewrites(source: &str, edits: &[ReplacementEdit]) -> String {
    let mut rewritten = source.to_string();
    let mut ordered = edits.to_vec();
    ordered.sort_by(|a, b| b.start.cmp(&a.start).then_with(|| b.end.cmp(&a.end)));
    for edit in ordered {
        rewritten.replace_range(edit.start..edit.end, &edit.text);
    }
    rewritten
}

pub(crate) fn node_text<'a>(node: Node<'a>, source: &'a str) -> &'a str {
    node.utf8_text(source.as_bytes()).unwrap_or("")
}

pub(crate) fn is_function_like(node: Node<'_>) -> bool {
    matches!(
        node.kind(),
        "arrow_function" | "function_expression" | "function_declaration"
    )
}

fn push_unique_identifier(target: &mut BTreeSet<String>, node: Node<'_>, source: &str) {
    let text = node_text(node, source);
    if !text.is_empty() {
        target.insert(text.to_string());
    }
}

pub(crate) fn collect_pattern_bindings(
    node: Node<'_>,
    source: &str,
    bindings: &mut BTreeSet<String>,
) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            push_unique_identifier(bindings, node, source);
        }
        "rest_pattern" | "assignment_pattern" | "required_parameter" | "optional_parameter" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_pattern_bindings(child, source, bindings);
            }
        }
        "object_pattern" | "array_pattern" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_pattern_bindings(child, source, bindings);
            }
        }
        "pair_pattern" => {
            let mut cursor = node.walk();
            let named = node.named_children(&mut cursor).collect::<Vec<_>>();
            if let Some(value) = named.last().copied() {
                if value.kind() != "property_identifier" {
                    collect_pattern_bindings(value, source, bindings);
                }
            }
        }
        _ => {}
    }
}

pub(crate) fn collect_parameter_bindings(node: Node<'_>, source: &str) -> BTreeSet<String> {
    let mut bindings = BTreeSet::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_pattern_bindings(child, source, &mut bindings);
    }
    bindings
}

pub(crate) fn collect_function_scope_bindings(
    node: Node<'_>,
    source: &str,
    bindings: &mut BTreeSet<String>,
) {
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if is_function_like(child) {
            continue;
        }

        match child.kind() {
            "variable_declaration" => {
                collect_variable_declaration_bindings(child, source, bindings)
            }
            "function_declaration" | "class_declaration" => {
                if let Some(name) = child.named_child(0) {
                    collect_pattern_bindings(name, source, bindings);
                }
            }
            _ => collect_function_scope_bindings(child, source, bindings),
        }
    }
}

pub(crate) fn collect_variable_declaration_bindings(
    node: Node<'_>,
    source: &str,
    bindings: &mut BTreeSet<String>,
) {
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() == "variable_declarator" {
            if let Some(name) = child.named_child(0) {
                collect_pattern_bindings(name, source, bindings);
            }
        }
    }
}

pub(crate) fn collect_block_scope_bindings(node: Node<'_>, source: &str) -> BTreeSet<String> {
    let mut bindings = BTreeSet::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "lexical_declaration" => {
                collect_variable_declaration_bindings(child, source, &mut bindings)
            }
            "function_declaration" | "class_declaration" => {
                if let Some(name) = child.named_child(0) {
                    collect_pattern_bindings(name, source, &mut bindings);
                }
            }
            _ => {}
        }
    }
    bindings
}

pub(crate) fn scope_contains(scopes: &[BTreeSet<String>], ident: &str) -> bool {
    scopes.iter().rev().any(|scope| scope.contains(ident))
}

struct Analyzer<'a> {
    source: &'a str,
    expr_start: usize,
    replacements: &'a BTreeMap<String, String>,
    edits: Vec<ReplacementEdit>,
    free_identifiers: BTreeSet<String>,
}

impl<'a> Analyzer<'a> {
    fn new(source: &'a str, expr_start: usize, replacements: &'a BTreeMap<String, String>) -> Self {
        Self {
            source,
            expr_start,
            replacements,
            edits: Vec::new(),
            free_identifiers: BTreeSet::new(),
        }
    }

    fn relative_range(&self, node: Node<'_>) -> (usize, usize) {
        (
            node.start_byte().saturating_sub(self.expr_start),
            node.end_byte().saturating_sub(self.expr_start),
        )
    }

    fn rewrite_reference(&mut self, node: Node<'_>, source_ident: &str, shorthand: bool) {
        self.free_identifiers.insert(source_ident.to_string());
        let Some(replacement) = self.replacements.get(source_ident) else {
            return;
        };
        if replacement == source_ident {
            return;
        }
        let (start, end) = self.relative_range(node);
        let text = if shorthand {
            format!("{source_ident}: {replacement}")
        } else {
            replacement.clone()
        };
        self.edits.push(ReplacementEdit { start, end, text });
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
                let mut cursor = node.walk();
                let named = node.named_children(&mut cursor).collect::<Vec<_>>();
                if named.len() > 1 {
                    self.visit_node(named[1], scopes);
                }
            }
            "required_parameter" | "optional_parameter" | "rest_pattern" | "object_pattern"
            | "array_pattern" | "pair_pattern" => {
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    self.visit_parameter_node(child, scopes);
                }
            }
            _ => self.visit_node(node, scopes),
        }
    }

    fn visit_function_like(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let mut function_scope = BTreeSet::new();
        if node.kind() != "arrow_function" {
            if let Some(name) = node.child_by_field_name("name") {
                collect_pattern_bindings(name, self.source, &mut function_scope);
            }
        }

        if let Some(parameters) = node.child_by_field_name("parameters") {
            function_scope.extend(collect_parameter_bindings(parameters, self.source));
        }
        if let Some(body) = node.child_by_field_name("body") {
            collect_function_scope_bindings(body, self.source, &mut function_scope);
        }

        scopes.push(function_scope);
        if let Some(parameters) = node.child_by_field_name("parameters") {
            self.visit_parameter_defaults(parameters, scopes);
        }
        if let Some(body) = node.child_by_field_name("body") {
            self.visit_node(body, scopes);
        }
        scopes.pop();
    }

    fn visit_statement_block(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let block_scope = collect_block_scope_bindings(node, self.source);
        scopes.push(block_scope);
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            self.visit_node(child, scopes);
        }
        scopes.pop();
    }

    fn visit_declaration(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            if child.kind() != "variable_declarator" {
                continue;
            }
            if let Some(initializer) = child.named_child(1) {
                self.visit_node(initializer, scopes);
            }
        }
    }

    fn visit_node(&mut self, node: Node<'_>, scopes: &mut Vec<BTreeSet<String>>) {
        match node.kind() {
            "arrow_function" | "function_expression" | "function_declaration" => {
                self.visit_function_like(node, scopes);
            }
            "statement_block" => {
                self.visit_statement_block(node, scopes);
            }
            "lexical_declaration" | "variable_declaration" => {
                self.visit_declaration(node, scopes);
            }
            "identifier" => {
                let ident = node_text(node, self.source);
                if !scope_contains(scopes, ident) {
                    self.rewrite_reference(node, ident, false);
                }
            }
            "shorthand_property_identifier" => {
                let ident = node_text(node, self.source);
                if !scope_contains(scopes, ident) {
                    self.rewrite_reference(node, ident, true);
                }
            }
            "property_identifier" | "shorthand_property_identifier_pattern" => {}
            _ => {
                let mut cursor = node.walk();
                for child in node.named_children(&mut cursor) {
                    self.visit_node(child, scopes);
                }
            }
        }
    }
}

pub fn analyze_scoped_expression(
    expr: &str,
    replacements: &BTreeMap<String, String>,
) -> ScopedExpressionAnalysis {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return ScopedExpressionAnalysis {
            rewritten: trimmed.to_string(),
            free_identifiers: BTreeSet::new(),
        };
    }

    let Some((wrapped, tree)) = parse_expression_root(trimmed) else {
        return ScopedExpressionAnalysis {
            rewritten: trimmed.to_string(),
            free_identifiers: BTreeSet::new(),
        };
    };
    let Some(expression) = find_expression_node(&tree) else {
        return ScopedExpressionAnalysis {
            rewritten: trimmed.to_string(),
            free_identifiers: BTreeSet::new(),
        };
    };

    let mut analyzer = Analyzer::new(&wrapped, expression.start_byte(), replacements);
    analyzer.visit_node(expression, &mut Vec::new());

    let original = &wrapped[expression.start_byte()..expression.end_byte()];
    let rewritten = if analyzer.edits.is_empty() {
        original.to_string()
    } else {
        apply_rewrites(original, &analyzer.edits)
    };

    ScopedExpressionAnalysis {
        rewritten,
        free_identifiers: analyzer.free_identifiers,
    }
}

fn _language_once() -> &'static tree_sitter::Language {
    static LANGUAGE: OnceLock<tree_sitter::Language> = OnceLock::new();
    LANGUAGE.get_or_init(typescript_language)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::analyze_scoped_expression;

    #[test]
    fn preserves_shadowed_callback_params() {
        let mut replacements = BTreeMap::new();
        replacements.insert("count".to_string(), "__count".to_string());
        replacements.insert("items".to_string(), "__items".to_string());

        let analyzed = analyze_scoped_expression("items.map((count) => count + 1)", &replacements);

        assert_eq!(analyzed.rewritten, "__items.map((count) => count + 1)");
        assert!(analyzed.free_identifiers.contains("items"));
        assert!(!analyzed.free_identifiers.contains("count"));
    }

    #[test]
    fn rewrites_shorthand_properties_without_corrupting_keys() {
        let mut replacements = BTreeMap::new();
        replacements.insert("count".to_string(), "__count".to_string());

        let analyzed =
            analyze_scoped_expression("({ count, value: count + total })", &replacements);

        assert!(analyzed
            .rewritten
            .contains("{ count: __count, value: __count + total }"));
        assert!(analyzed.free_identifiers.contains("count"));
    }
}
