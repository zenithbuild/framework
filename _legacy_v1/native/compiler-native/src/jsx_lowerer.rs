//! JSX/Script Lowering for Zenith Compiler

use oxc_allocator::{Allocator, Box as oxc_box, CloneIn};
use oxc_ast::ast::*;
use oxc_ast::AstBuilder;
use oxc_ast_visit::{walk_mut, VisitMut};
use oxc_codegen::Codegen;
use oxc_span::SPAN;
use std::collections::HashSet;

// ═══════════════════════════════════════════════════════════════════════════════
// JSX LOWERER
// Transforms JSX elements into __zenith.h() calls
// ═══════════════════════════════════════════════════════════════════════════════

pub struct JsxLowerer<'a> {
    pub ast: AstBuilder<'a>,
}

impl<'a> JsxLowerer<'a> {
    pub fn new(allocator: &'a Allocator) -> Self {
        Self {
            ast: AstBuilder::new(allocator),
        }
    }

    fn lower_jsx_element(&mut self, element: &JSXElement<'a>) -> Expression<'a> {
        let tag_name = self.get_tag_name(&element.opening_element.name);
        let tag_atom = self.ast.allocator.alloc_str(&tag_name);

        let mut current_obj_props = self.ast.vec();

        for item in &element.opening_element.attributes {
            match item {
                JSXAttributeItem::Attribute(attr) => {
                    let name = match &attr.name {
                        JSXAttributeName::Identifier(id) => PropertyKey::StaticIdentifier(
                            self.ast
                                .alloc(self.ast.identifier_name(SPAN, id.name.clone())),
                        ),
                        JSXAttributeName::NamespacedName(ns) => {
                            let ns_name = format!("{}:{}", ns.namespace.name, ns.name.name);
                            let ns_atom = self.ast.allocator.alloc_str(&ns_name);
                            PropertyKey::StaticIdentifier(
                                self.ast.alloc(self.ast.identifier_name(SPAN, ns_atom)),
                            )
                        }
                    };

                    let value = match &attr.value {
                        Some(JSXAttributeValue::StringLiteral(s)) => {
                            Expression::StringLiteral(self.ast.alloc((**s).clone()))
                        }
                        Some(JSXAttributeValue::Element(el)) => self.lower_jsx_element(el),
                        Some(JSXAttributeValue::ExpressionContainer(container)) => {
                            let jsx_expr = &container.expression;
                            // Convert JSXExpression to Expression using as_expression() hint from compiler
                            // If it's not a direct expression, we'll get None (e.g. EmptyExpression)
                            if let Some(mut e) = jsx_expr
                                .as_expression()
                                .map(|e| e.clone_in(self.ast.allocator))
                            {
                                self.visit_expression(&mut e);
                                e
                            } else {
                                self.ast.expression_identifier(SPAN, "undefined")
                            }
                        }
                        Some(JSXAttributeValue::Fragment(frag)) => self.lower_jsx_fragment(frag),
                        None => self.ast.expression_boolean_literal(SPAN, true),
                    };

                    current_obj_props.push(self.ast.object_property_kind_object_property(
                        SPAN,
                        PropertyKind::Init,
                        name,
                        value,
                        false,
                        false,
                        false,
                    ));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let mut spread_expr = spread.argument.clone_in(self.ast.allocator);
                    self.visit_expression(&mut spread_expr);
                    current_obj_props.push(
                        self.ast
                            .object_property_kind_spread_property(SPAN, spread_expr),
                    );
                }
            }
        }

        let props_expr = if current_obj_props.is_empty() {
            self.ast.expression_identifier(SPAN, "null")
        } else {
            self.ast.expression_object(SPAN, current_obj_props)
        };

        // Children -> Array or Null
        let mut children_vec = self.ast.vec();
        for child in &element.children {
            match child {
                JSXChild::Text(t) => {
                    let text = t.value.trim();
                    if !text.is_empty() {
                        let text_atom = self.ast.allocator.alloc_str(text);
                        children_vec.push(ArrayExpressionElement::from(
                            self.ast.expression_string_literal(SPAN, text_atom, None),
                        ));
                    }
                }
                JSXChild::Element(el) => {
                    children_vec.push(ArrayExpressionElement::from(self.lower_jsx_element(el)));
                }
                JSXChild::Fragment(frag) => {
                    children_vec.push(ArrayExpressionElement::from(self.lower_jsx_fragment(frag)));
                }
                JSXChild::ExpressionContainer(container) => {
                    children_vec.push(ArrayExpressionElement::from(
                        self.lower_jsx_expression(&container.expression),
                    ));
                }
                JSXChild::Spread(spread) => {
                    let mut arg = spread.expression.clone_in(self.ast.allocator);
                    self.visit_expression(&mut arg);
                    children_vec.push(ArrayExpressionElement::from(arg));
                }
            }
        }

        let children_expr = if children_vec.is_empty() {
            self.ast.expression_identifier(SPAN, "null")
        } else {
            self.ast.expression_array(SPAN, children_vec)
        };

        let mut args = self.ast.vec();
        args.push(Argument::from(
            self.ast.expression_string_literal(SPAN, tag_atom, None),
        ));
        args.push(Argument::from(props_expr));
        args.push(Argument::from(children_expr));

        let callee = Expression::from(
            self.ast.member_expression_static(
                SPAN,
                self.ast
                    .member_expression_static(
                        SPAN,
                        self.ast.expression_identifier(SPAN, "window"),
                        self.ast.identifier_name(SPAN, "__zenith"),
                        false,
                    )
                    .into(),
                self.ast.identifier_name(SPAN, "h"),
                false,
            ),
        );

        self.ast.expression_call(
            SPAN,
            callee,
            None::<oxc_box<TSTypeParameterInstantiation>>,
            args,
            false,
        )
    }

    fn lower_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) -> Expression<'a> {
        let mut children_vec = self.ast.vec();
        for child in &fragment.children {
            match child {
                JSXChild::Text(t) => {
                    let text = t.value.trim();
                    if !text.is_empty() {
                        let text_atom = self.ast.allocator.alloc_str(text);
                        children_vec.push(ArrayExpressionElement::from(
                            self.ast.expression_string_literal(SPAN, text_atom, None),
                        ));
                    }
                }
                JSXChild::Element(el) => {
                    children_vec.push(ArrayExpressionElement::from(self.lower_jsx_element(el)));
                }
                JSXChild::Fragment(frag) => {
                    children_vec.push(ArrayExpressionElement::from(self.lower_jsx_fragment(frag)));
                }
                JSXChild::ExpressionContainer(container) => {
                    children_vec.push(ArrayExpressionElement::from(
                        self.lower_jsx_expression(&container.expression),
                    ));
                }
                JSXChild::Spread(spread) => {
                    let mut arg = spread.expression.clone_in(self.ast.allocator);
                    self.visit_expression(&mut arg);
                    children_vec.push(ArrayExpressionElement::from(arg));
                }
            }
        }

        let children_expr = if children_vec.is_empty() {
            self.ast.expression_identifier(SPAN, "null")
        } else {
            self.ast.expression_array(SPAN, children_vec)
        };

        let mut args = self.ast.vec();
        args.push(Argument::from(children_expr));

        let callee = Expression::from(
            self.ast.member_expression_static(
                SPAN,
                self.ast
                    .member_expression_static(
                        SPAN,
                        self.ast.expression_identifier(SPAN, "window"),
                        self.ast.identifier_name(SPAN, "__zenith"),
                        false,
                    )
                    .into(),
                self.ast.identifier_name(SPAN, "fragment"),
                false,
            ),
        );

        self.ast.expression_call(
            SPAN,
            callee,
            None::<oxc_box<TSTypeParameterInstantiation>>,
            args,
            false,
        )
    }

    fn get_tag_name(&self, name: &JSXElementName<'a>) -> String {
        match name {
            JSXElementName::Identifier(id) => id.name.to_string(),
            JSXElementName::IdentifierReference(id) => id.name.to_string(),
            JSXElementName::NamespacedName(ns) => format!("{}:{}", ns.namespace.name, ns.name.name),
            JSXElementName::MemberExpression(me) => self.get_member_name(me),
            JSXElementName::ThisExpression(_) => "this".to_string(),
        }
    }

    fn get_member_name(&self, me: &JSXMemberExpression<'a>) -> String {
        let object = match &me.object {
            JSXMemberExpressionObject::IdentifierReference(id) => id.name.to_string(),
            JSXMemberExpressionObject::MemberExpression(inner) => self.get_member_name(inner),
            _ => "unknown".to_string(),
        };
        format!("{}.{}", object, me.property.name)
    }

    fn lower_jsx_expression(&mut self, jsx_expr: &JSXExpression<'a>) -> Expression<'a> {
        if let Some(mut e) = jsx_expr
            .as_expression()
            .map(|e| e.clone_in(self.ast.allocator))
        {
            self.visit_expression(&mut e);
            e
        } else {
            self.ast.expression_identifier(SPAN, "undefined")
        }
    }
}

impl<'a> VisitMut<'a> for JsxLowerer<'a> {
    fn visit_expression(&mut self, expr: &mut Expression<'a>) {
        match expr {
            Expression::JSXElement(element) => {
                let lowered = self.lower_jsx_element(element);
                *expr = lowered;
            }
            Expression::JSXFragment(fragment) => {
                let lowered = self.lower_jsx_fragment(fragment);
                *expr = lowered;
            }
            Expression::ConditionalExpression(cond) => {
                self.visit_expression(&mut cond.test);
                self.visit_expression(&mut cond.consequent);
                self.visit_expression(&mut cond.alternate);
            }
            Expression::LogicalExpression(logical) => {
                self.visit_expression(&mut logical.left);
                self.visit_expression(&mut logical.right);
            }
            _ => {
                walk_mut::walk_expression(self, expr);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IDENTIFIER CLASSIFICATION (Phase 2: Expression Intent Classification)
// ═══════════════════════════════════════════════════════════════════════════════

/// Classified identifier reference for compile-time resolution.
/// This determines how an identifier is rewritten in the final output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentifierRef {
    /// State variable: `count` → `scope.state.count`
    StateRef(String),
    /// Prop variable: `title` → `scope.props.title`
    PropRef(String),
    /// Local variable (script-defined or stack): `helper` → `helper` (bare)
    LocalRef(String),
    /// External local (runtime-provided): `loaderData` → `scope.locals.loaderData`
    ExternalLocalRef(String),
    /// Global/built-in: left as-is (window, Math, console, etc.)
    GlobalRef(String),
    /// Unresolved: compile error Z-ERR-SCOPE-002
    UnresolvedRef(String),
}

pub struct ScriptRenamer<'a> {
    pub allocator: &'a Allocator,
    pub ast: AstBuilder<'a>,
    pub state_bindings: HashSet<String>,
    pub prop_bindings: HashSet<String>,
    pub local_bindings: HashSet<String>,
    pub external_locals: HashSet<String>,
    pub scope_stack: Vec<HashSet<String>>,
    pub errors: Vec<String>,
    /// Phase 5: Directly tracked state dependencies (Enhancement 3)
    pub state_deps: HashSet<String>,
    /// Phase 5: Directly tracked prop dependencies (Enhancement 3)
    pub prop_deps: HashSet<String>,
    /// Enhancement 1: Disallow scope.state.* or scope.props.* access (for __run())
    pub disallow_reactive_access: bool,
    /// Enhancement 2: Mark if we are inside an event handler context
    pub is_event_handler: bool,
    /// Phase A10: TRACK MODULE SCOPE (Imports, etc.)
    pub module_bindings: HashSet<String>,
    /// Collected import statements to be hoisted
    pub collected_imports: Vec<String>,
    /// Phase 6: Track which state keys are MODIFIED in this expression
    pub mutated_state_deps: HashSet<String>,
    /// Phase 2: Allow prop fallback for unresolved identifiers (ONLY in template root context)
    pub allow_prop_fallback: bool,
}

lazy_static::lazy_static! {
    static ref GLOBALS: HashSet<&'static str> = {
        let mut s = HashSet::new();
        s.extend([
            "window", "console", "Math", "JSON", "Map", "Set", "URL", "Array", "Object",
            "Boolean", "Number", "String", "Error", "ReferenceError", "TypeError", "SyntaxError",
            "Date", "RegExp", "Promise", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
            "fetch", "document", "location", "navigator", "localStorage", "sessionStorage",
            "Intl", "Uint8Array", "Uint16Array", "Uint32Array", "Int8Array", "Int16Array", "Int32Array",
            "Float32Array", "Float64Array", "BigUint64Array", "BigInt64Array", "DataView",
            "ArrayBuffer", "SharedArrayBuffer", "WebAssembly", "Proxy", "Reflect", "Symbol",
            "NaN", "Infinity", "undefined", "encodeURI", "encodeURIComponent", "decodeURI",
            "decodeURIComponent", "parseInt", "parseFloat", "isNaN", "isFinite", "globalThis",
            "zenRoute", "zenLink", "scope", "state", "props", "locals", "__zenith",
            "zenOnMount", "zenOnUnmount", "zenEffect", "zenComputed", "zenWatch", "zenWatchEffect",
            "requestAnimationFrame", "cancelAnimationFrame", "Element", "Node", "Event",
            "MouseEvent", "KeyboardEvent", "URLSearchParams", "__ZENITH_STATE__", "__ZENITH_SCOPES__",
            "ref", "zenFixSVGNamespace"
        ]);
        s
    };
}

impl<'a> ScriptRenamer<'a> {
    pub fn with_categories(
        allocator: &'a Allocator,
        state_bindings: HashSet<String>,
        prop_bindings: HashSet<String>,
        local_bindings: HashSet<String>,
        external_locals: HashSet<String>,
    ) -> Self {
        Self {
            allocator,
            ast: AstBuilder::new(allocator),
            state_bindings,
            prop_bindings,
            local_bindings,
            external_locals,
            scope_stack: vec![HashSet::new()],
            errors: Vec::new(),
            state_deps: HashSet::new(),
            prop_deps: HashSet::new(),
            disallow_reactive_access: false,
            is_event_handler: false,
            module_bindings: HashSet::new(),
            collected_imports: Vec::new(),
            mutated_state_deps: HashSet::new(),
            allow_prop_fallback: false,
        }
    }

    pub fn add_local(&mut self, name: String) {
        if let Some(scope) = self.scope_stack.last_mut() {
            scope.insert(name);
        }
    }

    fn push_scope(&mut self) {
        self.scope_stack.push(HashSet::new());
    }

    fn pop_scope(&mut self) {
        self.scope_stack.pop();
    }

    fn is_local(&self, name: &str) -> bool {
        self.scope_stack.iter().rev().any(|s| s.contains(name))
    }

    fn is_global(&self, name: &str) -> bool {
        GLOBALS.contains(name)
    }

    /// Phase 2: Classify an identifier and return its reference type.
    ///
    /// Classification priority (as defined in lib.rs ground truth):
    /// 1. Protected identifiers (scope, state, props, locals) → GlobalRef (never shadowable)
    /// 2. Scope stack locals (function params, loop vars) → LocalRef (leave as-is)
    /// 3. Component locals (let/const/function declarations) → LocalRef
    /// 4. State bindings → StateRef
    /// 5. Prop bindings → PropRef
    /// 6. Globals whitelist → GlobalRef
    /// 7. Unresolved → UnresolvedRef (compile error)
    pub fn classify_identifier(&self, name: &str) -> IdentifierRef {
        // Enhancement 1: scope root protection
        // scope, state, props, locals are NEVER shadowable
        if name == "scope" || name == "state" || name == "props" || name == "locals" {
            return IdentifierRef::GlobalRef(name.to_string());
        }

        // Priority 1: Scope stack locals (function params, loop vars, catch params)
        if self.is_local(name) {
            return IdentifierRef::LocalRef(name.to_string());
        }

        // Priority 2: Component local bindings (script-defined)
        if self.local_bindings.contains(name) {
            return IdentifierRef::ExternalLocalRef(name.to_string());
        }

        // Priority 2.5: External locals (runtime-provided)
        if self.external_locals.contains(name) {
            return IdentifierRef::ExternalLocalRef(name.to_string());
        }

        // Priority 3: State bindings
        if self.state_bindings.contains(name) {
            return IdentifierRef::StateRef(name.to_string());
        }

        // Priority 4: Prop bindings
        if self.prop_bindings.contains(name) {
            return IdentifierRef::PropRef(name.to_string());
        }

        // Priority 5: Module-level bindings (Imports)
        if self.module_bindings.contains(name) {
            return IdentifierRef::GlobalRef(name.to_string());
        }

        // Priority 6: Globals whitelist
        if self.is_global(name) {
            return IdentifierRef::GlobalRef(name.to_string());
        }

        // Priority 7: Fallback

        // Z-ERR-UNRESOLVED-IDENT: Unresolved identifier fallback
        // GUARD: Fallback is ONLY allowed if:
        // 1. allow_prop_fallback is TRUE (we are in a template expression)
        // 2. We are at scope depth 1 (root of the expression, not inside a closure/handler)
        if self.allow_prop_fallback && self.scope_stack.len() == 1 {
            return IdentifierRef::PropRef(name.to_string());
        }

        // Otherwise error
        IdentifierRef::UnresolvedRef(name.to_string())
    }

    fn create_member_access(&self, category: &str, prop_name: &str) -> MemberExpression<'a> {
        let scope_atom = self.allocator.alloc_str("scope");
        let category_atom = self.allocator.alloc_str(category);
        let prop_atom = self.allocator.alloc_str(prop_name);

        let scope_category = self.ast.member_expression_static(
            SPAN,
            self.ast.expression_identifier(SPAN, scope_atom),
            self.ast.identifier_name(SPAN, category_atom),
            false,
        );

        self.ast.member_expression_static(
            SPAN,
            Expression::from(scope_category),
            self.ast.identifier_name(SPAN, prop_atom),
            false,
        )
    }

    fn create_state_member(&self, prop_name: &str) -> MemberExpression<'a> {
        if self.prop_bindings.contains(prop_name) {
            return self.create_member_access("props", prop_name);
        }
        if self.local_bindings.contains(prop_name) {
            return self.create_member_access("locals", prop_name);
        }
        self.create_member_access("state", prop_name)
    }

    fn is_ts_node(stmt: &Statement<'a>) -> bool {
        match stmt {
            Statement::TSTypeAliasDeclaration(_)
            | Statement::TSInterfaceDeclaration(_)
            | Statement::TSEnumDeclaration(_)
            | Statement::TSModuleDeclaration(_)
            | Statement::TSImportEqualsDeclaration(_) => true,
            _ => false,
        }
    }

    /// Collect binding names from a pattern and register them in local_bindings.
    /// Unlike `collect_binding_names` which only adds to scope_stack,
    /// this function ensures destructured identifiers are tracked for scope.locals rewriting.
    fn collect_and_register_binding_names(&mut self, pattern: &BindingPattern<'a>) -> Vec<String> {
        let mut names = Vec::new();
        self.collect_binding_names_into(pattern, &mut names);
        for name in &names {
            self.local_bindings.insert(name.clone());
        }
        names
    }

    /// Helper to recursively collect binding names into a vec without side effects.
    fn collect_binding_names_into(&self, pattern: &BindingPattern<'a>, names: &mut Vec<String>) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                names.push(id.name.to_string());
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    self.collect_binding_names_into(&prop.value, names);
                }
                if let Some(rest) = &obj.rest {
                    self.collect_binding_names_into(&rest.argument, names);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for elem in &arr.elements {
                    if let Some(p) = elem {
                        self.collect_binding_names_into(p, names);
                    }
                }
                if let Some(rest) = &arr.rest {
                    self.collect_binding_names_into(&rest.argument, names);
                }
            }
            _ => {}
        }
    }

    fn collect_binding_names(&mut self, pattern: &BindingPattern<'a>) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                self.add_local(id.name.to_string());
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    self.collect_binding_names(&prop.value);
                }
                if let Some(rest) = &obj.rest {
                    self.collect_binding_names(&rest.argument);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for elem in &arr.elements {
                    if let Some(p) = elem {
                        self.collect_binding_names(p);
                    }
                }
                if let Some(rest) = &arr.rest {
                    self.collect_binding_names(&rest.argument);
                }
            }
            _ => {}
        }
    }

    /// Recursively expand a destructuring pattern into explicit assignments to scope.locals.
    fn expand_destructuring_to_assignments(
        &mut self,
        pattern: &BindingPattern<'a>,
        source: Expression<'a>,
        assignments: &mut oxc_allocator::Vec<'a, Expression<'a>>,
    ) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                let name = id.name.to_string();
                // CRITICAL: Use locals explicitly, not create_state_member which may pick wrong category
                let left = SimpleAssignmentTarget::from(self.create_member_access("locals", &name));
                assignments.push(self.ast.expression_assignment(
                    SPAN,
                    AssignmentOperator::Assign,
                    AssignmentTarget::from(left),
                    source,
                ));
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    // Get the key (the property we are destructuring from the source)
                    let key_name = match &prop.key {
                        PropertyKey::StaticIdentifier(id) => Some(id.name.to_string()),
                        _ => None, // Complex keys (computed) not handled yet for simple expansion
                    };

                    if let Some(key) = key_name {
                        // Create a member access: source.key
                        let next_source = Expression::from(
                            self.ast.member_expression_static(
                                SPAN,
                                source.clone_in(self.allocator),
                                self.ast
                                    .identifier_name(SPAN, self.allocator.alloc_str(&key)),
                                false,
                            ),
                        );
                        self.expand_destructuring_to_assignments(
                            &prop.value,
                            next_source,
                            assignments,
                        );
                    }
                }
                if let Some(_rest) = &obj.rest {
                    // Rest pattern: ...rest - Not implemented for simple expansion
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for (i, elem) in arr.elements.iter().enumerate() {
                    if let Some(p) = elem {
                        // Create a member access: source[i]
                        let next_source = Expression::from(self.ast.member_expression_computed(
                            SPAN,
                            source.clone_in(self.allocator),
                            self.ast.expression_numeric_literal(
                                SPAN,
                                i as f64,
                                None,
                                oxc_ast::ast::NumberBase::Decimal,
                            ),
                            false,
                        ));
                        self.expand_destructuring_to_assignments(p, next_source, assignments);
                    }
                }
            }
            _ => {}
        }
    }
}

impl<'a> VisitMut<'a> for ScriptRenamer<'a> {
    fn visit_program(&mut self, program: &mut Program<'a>) {
        program.body.retain(|stmt| !Self::is_ts_node(stmt));
        walk_mut::walk_program(self, program);
        // Remove extracted imports (replaced with EmptyStatement)
        program
            .body
            .retain(|stmt| !matches!(stmt, Statement::EmptyStatement(_)));
    }

    fn visit_statement(&mut self, stmt: &mut Statement<'a>) {
        match stmt {
            Statement::BlockStatement(block) => {
                block.body.retain(|s| !Self::is_ts_node(s));
                self.push_scope();
                for s in &mut block.body {
                    self.visit_statement(s);
                }
                self.pop_scope();
            }
            Statement::ImportDeclaration(decl) => {
                // 1. Visit (renames .zen -> .js)
                self.visit_import_declaration(decl);

                // 2. Stringify using Codegen on a temp program
                let program = Program {
                    span: SPAN,
                    source_type: SourceType::default().with_module(true),
                    source_text: "",
                    body: self.ast.vec1(Statement::ImportDeclaration(
                        self.ast.alloc(decl.as_ref().clone_in(self.allocator)),
                    )),
                    comments: self.ast.vec(),
                    directives: self.ast.vec(),
                    hashbang: None,
                    scope_id: Default::default(),
                };

                let code = Codegen::new().build(&program).code;
                self.collected_imports.push(code);

                // 3. Remove from tree (replace with Empty)
                *stmt = self.ast.statement_empty(SPAN);
            }
            Statement::VariableDeclaration(var_decl) => {
                // Phase R5: Scope Binding Hoisting
                // At top-level (scope depth 1), ALL const/let declarations must be hoisted
                // onto scope.locals so expressions can resolve them.
                // Inner declarations (inside functions, callbacks, etc.) are left unchanged.

                let is_top_level = self.scope_stack.len() == 1;
                let mut assignments = self.ast.vec();
                let mut all_hoisted = true;

                for decl in &mut var_decl.declarations {
                    if let BindingPattern::BindingIdentifier(id) = &decl.id {
                        let name = id.name.to_string();

                        let is_state = self.state_bindings.contains(&name);
                        let is_prop = self.prop_bindings.contains(&name);
                        let is_explicit_local = self.local_bindings.contains(&name);

                        // Determine if this should be hoisted
                        let should_hoist = is_top_level || is_state || is_prop || is_explicit_local;

                        if should_hoist {
                            if let Some(init) = &mut decl.init {
                                self.visit_expression(init);

                                // Register AFTER visit_expression to avoid self-shadowing
                                if is_top_level && !is_state && !is_prop && !is_explicit_local {
                                    self.local_bindings.insert(name.clone());
                                }

                                let left =
                                    SimpleAssignmentTarget::from(self.create_state_member(&name));
                                assignments.push(self.ast.expression_assignment(
                                    SPAN,
                                    AssignmentOperator::Assign,
                                    AssignmentTarget::from(left),
                                    init.clone_in(self.allocator),
                                ));
                            } else {
                                // Register even if no init
                                if is_top_level && !is_state && !is_prop && !is_explicit_local {
                                    self.local_bindings.insert(name.clone());
                                }
                                // Declaration without initializer - assign undefined
                                let left =
                                    SimpleAssignmentTarget::from(self.create_state_member(&name));
                                let undefined = self.ast.expression_identifier(
                                    SPAN,
                                    self.allocator.alloc_str("undefined"),
                                );
                                assignments.push(self.ast.expression_assignment(
                                    SPAN,
                                    AssignmentOperator::Assign,
                                    AssignmentTarget::from(left),
                                    undefined,
                                ));
                            }
                        } else {
                            // Not top-level and not in binding sets - leave as normal local
                            all_hoisted = false;
                            self.add_local(name);
                            if let Some(init) = &mut decl.init {
                                self.visit_expression(init);
                            }
                        }
                    } else {
                        // Handle patterns (destructuring) at top-level
                        // Phase 2: Register destructured identifiers in local_bindings
                        // so they can be qualified as scope.locals.xxx in expressions
                        if is_top_level {
                            if let Some(init) = &mut decl.init {
                                self.visit_expression(init);
                                // Register AFTER visit_expression to avoid self-shadowing
                                let _names = self.collect_and_register_binding_names(&decl.id);
                                let source = init.clone_in(self.allocator);
                                self.expand_destructuring_to_assignments(
                                    &decl.id,
                                    source,
                                    &mut assignments,
                                );
                                all_hoisted = true;
                            } else {
                                // Register even if no init
                                self.collect_and_register_binding_names(&decl.id);
                            }
                        } else {
                            // Non-top-level: just add to scope stack
                            self.collect_binding_names(&decl.id);
                            all_hoisted = false;
                            if let Some(init) = &mut decl.init {
                                self.visit_expression(init);
                            }
                        }
                    }
                }

                if all_hoisted && !assignments.is_empty() {
                    // All declarations were hoisted, replace with assignment expression(s)
                    if assignments.len() == 1 {
                        *stmt = self
                            .ast
                            .statement_expression(SPAN, assignments.pop().unwrap());
                    } else {
                        *stmt = self.ast.statement_expression(
                            SPAN,
                            self.ast.expression_sequence(SPAN, assignments),
                        );
                    }
                } else if !assignments.is_empty() {
                    // Mixed - some hoisted, some not. This shouldn't happen at top-level.
                    // For safety, just do the assignments and leave the rest as-is.
                    // (In practice, this branch won't execute for well-formed code)
                }
            }
            Statement::FunctionDeclaration(func) => {
                let mut name_to_qualify = None;
                if self.scope_stack.len() == 1 {
                    if let Some(id) = &func.id {
                        let name = id.name.to_string();
                        if self.local_bindings.contains(&name) {
                            name_to_qualify = Some(name);
                        }
                    }
                }

                let prev_disallow = self.disallow_reactive_access;
                self.disallow_reactive_access = false;
                self.push_scope();

                // Clone params and body for reuse if we transform
                // (Actually Oxc allows moving parts if we take ownership)

                for param in &mut func.params.items {
                    self.collect_binding_names(&param.pattern);
                }

                if let Some(body) = &mut func.body {
                    for s in &mut body.statements {
                        self.visit_statement(s);
                    }
                }

                self.pop_scope();
                self.disallow_reactive_access = prev_disallow;

                if let Some(name) = name_to_qualify {
                    // Transform to: scope.locals.name = function name(...) { ... }
                    let member = self.create_member_access("locals", &name);

                    // Convert FunctionDeclaration to FunctionExpression
                    // We need to take the parts out of func
                    let mut id = None::<BindingIdentifier<'a>>;
                    if let Some(func_id) = &func.id {
                        id = Some(
                            self.ast
                                .binding_identifier(SPAN, self.allocator.alloc_str(&func_id.name)),
                        );
                    }

                    // Create function expression
                    let func_expr = Expression::FunctionExpression(
                        self.ast.alloc(Function {
                            span: SPAN,
                            r#type: func.r#type,
                            id,
                            generator: func.generator,
                            r#async: func.r#async,
                            declare: false,
                            this_param: None,
                            type_parameters: None,
                            params: self.ast.alloc_formal_parameters(
                                SPAN,
                                FormalParameterKind::FormalParameter,
                                self.ast.vec_from_iter(
                                    func.params
                                        .items
                                        .iter()
                                        .map(|it| it.clone_in(self.allocator)),
                                ),
                                None::<oxc_box<FormalParameterRest<'a>>>,
                            ),
                            return_type: None,
                            body: func.body.as_ref().map(|b| b.clone_in(self.allocator)),
                            pure: false,
                            pife: false,
                            scope_id: Default::default(),
                        }),
                    );

                    let assignment = self.ast.expression_assignment(
                        SPAN,
                        AssignmentOperator::Assign,
                        AssignmentTarget::from(member),
                        func_expr,
                    );

                    *stmt = self.ast.statement_expression(SPAN, assignment);
                }
            }
            _ => walk_mut::walk_statement(self, stmt),
        }
    }

    fn visit_expression(&mut self, expr: &mut Expression<'a>) {
        // Strip TS specific expressions
        if let Expression::TSAsExpression(as_expr) = expr {
            let inner = as_expr.expression.clone_in(self.allocator);
            *expr = inner;
            self.visit_expression(expr);
            return;
        }
        if let Expression::TSNonNullExpression(nn_expr) = expr {
            let inner = nn_expr.expression.clone_in(self.allocator);
            *expr = inner;
            self.visit_expression(expr);
            return;
        }
        if let Expression::TSSatisfiesExpression(sat_expr) = expr {
            let inner = sat_expr.expression.clone_in(self.allocator);
            *expr = inner;
            self.visit_expression(expr);
            return;
        }

        if let Expression::Identifier(id) = expr {
            let name = id.name.to_string();
            match self.classify_identifier(&name) {
                IdentifierRef::StateRef(n) => {
                    // Z-ERR-RUN-REACTIVE: Disallow state reads in non-reactive blocks (__run())
                    if self.disallow_reactive_access {
                        self.errors.push(format!(
                            "Z-ERR-RUN-REACTIVE: Component script read reactive state `{}` in __run(). Use effects or expressions instead.",
                            n
                        ));
                    }

                    // Track dependency for Phase 5
                    self.state_deps.insert(n.clone());
                    let member = self.create_member_access("state", &n);
                    *expr = Expression::from(member);
                    return;
                }
                IdentifierRef::PropRef(n) => {
                    // Z-ERR-RUN-REACTIVE: Disallow prop reads in non-reactive blocks (__run())
                    if self.disallow_reactive_access {
                        self.errors.push(format!(
                            "Z-ERR-RUN-REACTIVE: Component script read reactive prop `{}` in __run(). Use initial values or props in expressions.",
                            n
                        ));
                    }

                    // Track dependency for Phase 5
                    self.prop_deps.insert(n.clone());
                    let member = self.create_member_access("props", &n);
                    *expr = Expression::from(member);
                    return;
                }
                IdentifierRef::ExternalLocalRef(n) => {
                    let member = self.create_member_access("locals", &n);
                    *expr = Expression::from(member);
                    return;
                }
                IdentifierRef::LocalRef(_) => {
                    // Leave as bare identifier (closure will handle script locals)
                }
                IdentifierRef::GlobalRef(n) => {
                    // CRITICAL: state, props, locals MUST be qualified as scope.state, etc.
                    // to resolve correctly in hoisted expression functions _expr_xxx(scope).
                    if n == "state" || n == "props" || n == "locals" {
                        let scope_atom = self.allocator.alloc_str("scope");
                        let prop_atom = self.allocator.alloc_str(&n);
                        let member = self.ast.member_expression_static(
                            SPAN,
                            self.ast.expression_identifier(SPAN, scope_atom),
                            self.ast.identifier_name(SPAN, prop_atom),
                            false,
                        );
                        *expr = Expression::from(member);
                    }
                }
                IdentifierRef::UnresolvedRef(n) => {
                    // Z-ERR-SCOPE-002: Unresolved identifier compile error
                    self.errors.push(format!(
                        "Z-ERR-SCOPE-002: Identifier `{}` is not declared in state, props, or locals",
                        n
                    ));
                }
            }
        }

        if let Expression::ArrowFunctionExpression(arrow) = expr {
            let prev_disallow = self.disallow_reactive_access;
            self.disallow_reactive_access = false;
            self.push_scope();
            for param in &arrow.params.items {
                self.collect_binding_names(&param.pattern);
            }
            for stmt in &mut arrow.body.statements {
                self.visit_statement(stmt);
            }
            self.pop_scope();
            self.disallow_reactive_access = prev_disallow;
            return;
        }

        if let Expression::FunctionExpression(func) = expr {
            let prev_disallow = self.disallow_reactive_access;
            self.disallow_reactive_access = false;
            self.push_scope();
            for param in &func.params.items {
                self.collect_binding_names(&param.pattern);
            }
            if let Some(body) = &mut func.body {
                for s in &mut body.statements {
                    self.visit_statement(s);
                }
            }
            self.pop_scope();
            self.disallow_reactive_access = prev_disallow;
            return;
        }

        walk_mut::walk_expression(self, expr);
    }

    fn visit_assignment_target(&mut self, target: &mut AssignmentTarget<'a>) {
        walk_mut::walk_assignment_target(self, target);
    }

    fn visit_simple_assignment_target(&mut self, target: &mut SimpleAssignmentTarget<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = target {
            let name = id.name.to_string();
            match self.classify_identifier(&name) {
                IdentifierRef::StateRef(n) => {
                    // Z-ERR-RUN-REACTIVE: Disallow state writes in non-reactive blocks (__run())
                    if self.disallow_reactive_access {
                        self.errors.push(format!(
                            "Z-ERR-RUN-REACTIVE: Component script modified reactive state `{}` in __run(). Use event handlers for state mutation.",
                            n
                        ));
                    } else if !self.is_event_handler && self.allow_prop_fallback {
                        // Only flag mutations in EXPRESSION contexts (template), not in script body
                        self.errors.push(format!(
                            "Z-ERR-REACTIVITY-BOUNDARY: State `{}` modified in an expression. State mutation is only allowed in event handlers.",
                            n
                        ));
                    }

                    // Track dependency for Phase 5
                    self.state_deps.insert(n.clone());
                    // Track mutation for Phase 6
                    self.mutated_state_deps.insert(n.clone());
                    let member = self.create_member_access("state", &n);
                    *target = SimpleAssignmentTarget::from(member);
                    return;
                }
                IdentifierRef::PropRef(n) => {
                    // Z-ERR-RUN-REACTIVE: Disallow prop writes in non-reactive blocks (__run())
                    if self.disallow_reactive_access {
                        self.errors.push(format!(
                            "Z-ERR-RUN-REACTIVE: Component script attempt to modify reactive prop `{}` in __run(). Props are read-only.",
                            n
                        ));
                    } else if !self.is_event_handler && self.allow_prop_fallback {
                        // Only flag mutations in EXPRESSION contexts (template), not in script body
                        self.errors.push(format!(
                            "Z-ERR-REACTIVITY-BOUNDARY: Prop `{}` modified in an expression. Props are read-only.",
                            n
                        ));
                    }

                    // Track dependency for Phase 5
                    self.prop_deps.insert(n.clone());
                    let member = self.create_member_access("props", &n);
                    *target = SimpleAssignmentTarget::from(member);
                    return;
                }
                IdentifierRef::ExternalLocalRef(n) => {
                    let member = self.create_member_access("locals", &n);
                    *target = SimpleAssignmentTarget::from(member);
                    return;
                }
                IdentifierRef::LocalRef(_)
                | IdentifierRef::GlobalRef(_)
                | IdentifierRef::UnresolvedRef(_) => {
                    // Leave as is
                }
            }
        }
        walk_mut::walk_simple_assignment_target(self, target);
    }

    fn visit_for_of_statement(&mut self, stmt: &mut ForOfStatement<'a>) {
        self.push_scope();
        if let ForStatementLeft::VariableDeclaration(var_decl) = &stmt.left {
            for decl in &var_decl.declarations {
                self.collect_binding_names(&decl.id);
            }
        }
        self.visit_expression(&mut stmt.right);
        self.visit_statement(&mut stmt.body);
        self.pop_scope();
    }

    fn visit_for_in_statement(&mut self, stmt: &mut ForInStatement<'a>) {
        self.push_scope();
        if let ForStatementLeft::VariableDeclaration(var_decl) = &stmt.left {
            for decl in &var_decl.declarations {
                self.collect_binding_names(&decl.id);
            }
        }
        self.visit_expression(&mut stmt.right);
        self.visit_statement(&mut stmt.body);
        self.pop_scope();
    }

    fn visit_for_statement(&mut self, stmt: &mut ForStatement<'a>) {
        self.push_scope();
        if let Some(ForStatementInit::VariableDeclaration(var_decl)) = &stmt.init {
            for decl in &var_decl.declarations {
                self.collect_binding_names(&decl.id);
            }
        }
        if let Some(test) = &mut stmt.test {
            self.visit_expression(test);
        }
        if let Some(update) = &mut stmt.update {
            self.visit_expression(update);
        }
        self.visit_statement(&mut stmt.body);
        self.pop_scope();
    }

    fn visit_catch_clause(&mut self, clause: &mut CatchClause<'a>) {
        self.push_scope();
        if let Some(param) = &clause.param {
            self.collect_binding_names(&param.pattern);
        }
        for stmt in &mut clause.body.body {
            self.visit_statement(stmt);
        }
        self.pop_scope();
    }

    fn visit_import_declaration(&mut self, decl: &mut ImportDeclaration<'a>) {
        if let Some(specifiers) = &decl.specifiers {
            for specifier in specifiers {
                match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(s) => {
                        self.module_bindings.insert(s.local.name.to_string());
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                        self.module_bindings.insert(s.local.name.to_string());
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
                        self.module_bindings.insert(s.local.name.to_string());
                    }
                }
            }
        }
        let source = decl.source.value.to_string();
        if source.ends_with(".zen") {
            let new_source = source.replace(".zen", ".js");
            decl.source.value = self.allocator.alloc_str(&new_source).into();
        }
    }

    fn visit_formal_parameter(&mut self, it: &mut FormalParameter<'a>) {
        walk_mut::walk_formal_parameter(self, it);
    }

    fn visit_variable_declarator(&mut self, it: &mut VariableDeclarator<'a>) {
        walk_mut::walk_variable_declarator(self, it);
    }

    fn visit_function(&mut self, it: &mut Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        it.return_type = None;
        it.type_parameters = None;
        walk_mut::walk_function(self, it, flags);
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        it.return_type = None;
        it.type_parameters = None;
        walk_mut::walk_arrow_function_expression(self, it);
    }
}
