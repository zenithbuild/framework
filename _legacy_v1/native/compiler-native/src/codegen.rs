//! Codegen module for Zenith compiler
//!
//! Generates runtime JavaScript code from ZenIR input.
//! This is the Rust authority for all compilation - no TypeScript fallback.

use crate::jsx_lowerer::{JsxLowerer, ScriptRenamer};
use crate::validate::{AttributeValue, ElementNode, ExpressionInput, StyleIR, TemplateNode};
#[cfg(feature = "napi")]
use napi_derive::napi;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::{ast::*, AstBuilder};
use oxc_ast_visit::VisitMut;
use oxc_codegen::Codegen;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, SPAN};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodegenInput {
    pub file_path: String,
    pub script_content: String,
    pub expressions: Vec<ExpressionInput>,
    pub styles: Vec<StyleIR>,
    pub template_bindings: Vec<String>,
    pub location: String,
    pub nodes: Vec<TemplateNode>,
    #[serde(default)]
    pub page_bindings: Vec<String>, // Page-level state bindings
    #[serde(default)]
    pub page_props: Vec<String>, // Page-level prop bindings
    #[serde(default)]
    pub all_states: HashMap<String, String>,
    #[serde(default)]
    pub locals: Vec<String>, // Component-level local variables (const, let, var, function)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDeclaration {
    pub name: String,
    pub initial_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCode {
    pub expressions: String,
    pub render: String,
    pub hydration: String,
    pub styles: String,
    pub script: String,
    pub state_init: String,
    pub bundle: String,
    pub npm_imports: Vec<ScriptImport>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
#[serde(rename_all = "camelCase")]
pub struct ScriptImport {
    pub source: String,
    pub specifiers: String,
    pub type_only: bool,
    pub side_effect: bool,
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAPI EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(feature = "napi")]
#[napi]
pub fn generate_codegen_intent() -> String {
    "Rust Codegen Authority".to_string()
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

pub fn generate_runtime_code_internal(input: CodegenInput) -> RuntimeCode {
    let allocator = Allocator::default();
    let mut source_type = SourceType::default();
    source_type = source_type.with_typescript(true);
    source_type = source_type.with_jsx(true);
    source_type = source_type.with_module(true);

    // FIX: Use word boundary \b and limit to same-line whitespace (no newlines)
    // to prevent cross-line match overlap where 'state' in a comment consumes
    // the first char of the actual 'state' keyword on the next line.
    let state_re = Regex::new(r"\bstate([ \t]+)([a-zA-Z_$])").unwrap();
    // 2. Extract state and prop bindings using Regex
    let mut state_bindings = HashSet::new();
    let mut prop_bindings = HashSet::new();

    // ...

    for pb in &input.page_bindings {
        state_bindings.insert(pb.clone());
    }
    for pp in &input.page_props {
        prop_bindings.insert(pp.clone());
    }

    let prop_re = Regex::new(r"prop(\s+)").unwrap();
    let parsable_script = state_re
        .replace_all(&input.script_content, "let${1}${2}")
        .to_string();
    let parsable_script = prop_re.replace_all(&parsable_script, "let$1").to_string();

    let mut state_decls = Vec::new();
    let parser = Parser::new(&allocator, &parsable_script, source_type);
    let ret = parser.parse();

    if !ret.errors.is_empty() {
        // eprintln!("[Zenith CODEGEN] Oxc Parse Errors: {:?}", ret.errors);
    }

    // 3. Extract default values from AST (where possible)
    let mut found_bindings = HashSet::new();
    for stmt in &ret.program.body {
        if let Statement::VariableDeclaration(var_decl) = stmt {
            for decl in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(id) = &decl.id {
                    let name = id.name.to_string();
                    if state_bindings.contains(&name) {
                        found_bindings.insert(name.clone());
                        let init_code = if let Some(init) = &decl.init {
                            // Extract initialization expression
                            // This gives us "10" from "let count = 10"
                            let span = init.span();
                            parsable_script[span.start as usize..span.end as usize].to_string()
                        } else {
                            "undefined".to_string()
                        };
                        state_decls.push(StateDeclaration {
                            name,
                            initial_value: init_code,
                        });
                    }
                }
            }
        }
    }

    // 4. Fallback for uninitialized bindings or failed AST extraction
    for binding in &state_bindings {
        if !found_bindings.contains(binding) && binding != "state" {
            // Priority 1: Use pre-collected value from all_states
            if let Some(val) = input.all_states.get(binding) {
                state_decls.push(StateDeclaration {
                    name: binding.clone(),
                    initial_value: val.clone(),
                });
                found_bindings.insert(binding.clone());
                continue;
            }

            // Priority 2: Try to find 'state BINDING = VALUE' or 'let BINDING = VALUE' in original/parsable script
            // Using Regex as backup if Oxc failed (e.g. syntax errors elsewhere)
            let pattern = format!(r"(?:state|let)\s+{}\s*=\s*([^;]+)", regex::escape(binding));
            if let Ok(re) = Regex::new(&pattern) {
                if let Some(cap) = re.captures(&input.script_content) {
                    let val = cap[1].trim().to_string();
                    state_decls.push(StateDeclaration {
                        name: binding.clone(),
                        initial_value: val,
                    });
                    found_bindings.insert(binding.clone());
                    continue;
                }
            }

            // Final: undefined
            if !found_bindings.contains(binding) {
                state_decls.push(StateDeclaration {
                    name: binding.clone(),
                    initial_value: "undefined".to_string(),
                });
            }
        }
    }

    // 3. Transform script with identifier renaming and HOIST IMPORTS
    // CRITICAL: Use a FRESH allocator for the second parse.
    // Reusing the first parse's allocator causes the second parse to produce
    // an empty program body (0 statements), which breaks function detection.
    let allocator2 = Allocator::default();
    let parser = Parser::new(&allocator2, &parsable_script, source_type);
    let parser_ret = parser.parse();

    let mut program = parser_ret.program;

    let ast = AstBuilder::new(&allocator2);

    // Separate imports from body
    let mut body = ast.vec();
    let mut import_lines = Vec::new();
    let mut seen_imports = HashSet::new();
    let mut script_imports = Vec::new();
    let mut imported_identifiers = HashSet::new();
    let mut script_locals = HashSet::new();

    // Merge component-level locals from input (e.g., pageTitle from layout)
    // These are extracted by discovery.rs and passed through from TypeScript
    for local in &input.locals {
        script_locals.insert(local.clone());
    }

    for stmt in program.body.into_iter() {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            let source = import_decl.source.value.to_string();
            if source.ends_with(".zen") {
                // Allow .zen imports to pass through to the bundler
                // Zenith Loader will handle resolution to .tsx
                // continue; // Logic Removed
            }

            // Collect imported identifiers to prevent renaming them as state
            if let Some(specifiers) = &import_decl.specifiers {
                for specifier in specifiers {
                    match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => {
                            imported_identifiers.insert(s.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                            imported_identifiers.insert(s.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
                            imported_identifiers.insert(s.local.name.to_string());
                        }
                    }
                }
            }

            // Capture info BEFORE moving import_decl
            let is_type = import_decl.import_kind.is_type();
            let is_side_effect = import_decl.specifiers.is_none();
            let source_for_struct = source.clone();

            let import_code = Codegen::new()
                .build(&Program {
                    span: SPAN,
                    source_type,
                    hashbang: None,
                    directives: ast.vec(),
                    body: {
                        let mut b = ast.vec();
                        b.push(Statement::ImportDeclaration(import_decl));
                        b
                    },
                    source_text: "",
                    comments: ast.vec(),
                    scope_id: std::cell::Cell::new(None),
                })
                .code;

            let trimmed_import = import_code.trim().to_string();
            if !seen_imports.contains(&trimmed_import) {
                seen_imports.insert(trimmed_import.clone());
                import_lines.push(import_code);

                // Extract specifiers using regex from the generated import_code
                let spec_re = Regex::new(r"import\s+(.*?)\s+from").unwrap();
                let specifiers = if let Some(cap) = spec_re.captures(&trimmed_import) {
                    cap.get(1)
                        .map_or("".to_string(), |m| m.as_str().to_string())
                } else {
                    "".to_string()
                };

                script_imports.push(ScriptImport {
                    source: source_for_struct,
                    specifiers,
                    type_only: is_type,
                    side_effect: is_side_effect,
                });
            }
        } else {
            if let Statement::VariableDeclaration(decl) = &stmt {
                for d in &decl.declarations {
                    if let BindingPattern::BindingIdentifier(id) = &d.id {
                        let name = id.name.to_string();
                        // Only add to locals if NOT a state or prop binding
                        if !state_bindings.contains(&name) && !prop_bindings.contains(&name) {
                            script_locals.insert(name);
                        }
                    }
                }
            } else if let Statement::FunctionDeclaration(decl) = &stmt {
                if let Some(id) = &decl.id {
                    script_locals.insert(id.name.to_string());
                }
            }
            body.push(stmt);
        }
    }
    program.body = body;

    // --- ZENITH LAW: ENVIRONMENT RESOLUTION ---
    // Scan for zenRoute() calls and hoist them into a Prelude.
    // Enforce ZEN_ENV_TDZ_VIOLATION if used improperly.
    // MUST run before renamer to ensure we catch original identifiers.
    let mut environment_prelude: Vec<String> = Vec::new();
    let mut script_body_no_env = ast.vec();

    // Validator for Law: Environment Resolution
    struct TdzValidator {
        found_invalid: bool,
    }

    impl<'a> oxc_ast_visit::Visit<'a> for TdzValidator {
        fn visit_call_expression(&mut self, expr: &oxc_ast::ast::CallExpression<'a>) {
            if let oxc_ast::ast::Expression::Identifier(ident) = &expr.callee {
                if ident.name == "zenRoute" {
                    self.found_invalid = true;
                }
            }
            oxc_ast_visit::walk::walk_call_expression(self, expr);
        }
    }

    for stmt in program.body.into_iter() {
        let mut is_env_call = false;
        if let Statement::VariableDeclaration(var_decl) = &stmt {
            for decl in &var_decl.declarations {
                if let Some(Expression::CallExpression(call)) = &decl.init {
                    if let Expression::Identifier(ident) = &call.callee {
                        if ident.name == "zenRoute" {
                            is_env_call = true;
                            // Extract the full declaration for hoisting
                            let env_code = Codegen::new()
                                .build(&Program {
                                    span: SPAN,
                                    source_type,
                                    hashbang: None,
                                    directives: ast.vec(),
                                    body: {
                                        let mut b = ast.vec();
                                        b.push(stmt.clone_in(&allocator));
                                        b
                                    },
                                    source_text: "",
                                    comments: ast.vec(),
                                    scope_id: std::cell::Cell::new(None),
                                })
                                .code;
                            environment_prelude.push(env_code.trim().to_string());
                        }
                    }
                }
            }
        }

        if !is_env_call {
            let mut validator = TdzValidator {
                found_invalid: false,
            };
            oxc_ast_visit::Visit::visit_statement(&mut validator, &stmt);
            if validator.found_invalid {
                panic!("\n\nZenith Compile Error [ZEN_ENV_TDZ_VIOLATION]:\nEnvironment-derived values must be resolved before state and expressions.\nMove zenRoute() to the top-level environment prelude.\n\n");
            }
            script_body_no_env.push(stmt);
        }
    }
    program.body = script_body_no_env;

    let mut all_errors = Vec::new();
    let mut local_vars = HashSet::new();
    local_vars.insert("stores".to_string());
    local_vars.insert("loaderData".to_string());
    local_vars.insert("query".to_string());
    local_vars.insert("params".to_string());

    // 3. (Continued) Final script and imports
    let mut renamer = ScriptRenamer::with_categories(
        &allocator,
        state_bindings.clone(),
        prop_bindings.clone(),
        script_locals.clone(),
        local_vars.clone(),
    );
    renamer.allow_prop_fallback = false; // Script context: Strict resolution
                                         // Imports are real JS locals in this scope
    for imp in &imported_identifiers {
        renamer.add_local(imp.clone());
    }
    renamer.visit_program(&mut program);
    all_errors.extend(renamer.errors);

    let script_no_imports = Codegen::new().build(&program).code;
    let all_imports = import_lines.join("");

    // 4. Prepare binding categories for expression transformation
    let mut state_vars = state_bindings.clone();
    for sd in &state_decls {
        state_vars.insert(sd.name.clone());
    }

    let mut prop_vars = prop_bindings.clone();
    prop_vars.insert("props".to_string()); // Legacy support for props object

    let loop_vars: HashSet<String> = input.template_bindings.iter().cloned().collect();

    // 5. Generate Template IR
    let template_ir = if input.nodes.is_empty() {
        "window.__zenith.fragment([])".to_string()
    } else if input.nodes.len() == 1 {
        generate_template_ir(&input.nodes[0], &input.expressions)
    } else {
        let child_irs: Vec<String> = input
            .nodes
            .iter()
            .map(|n| generate_template_ir(n, &input.expressions))
            .collect();
        format!("window.__zenith.fragment([{}])", child_irs.join(", "))
    };

    let render_fn = format!(
        "function renderDynamicPage(state) {{\n  return {};\n}}",
        template_ir
    );

    // 5.5 Detect Event Handler Expression IDs (Phase A8)
    let mut event_handler_ids = HashSet::new();
    collect_event_handler_ids(&input.nodes, &mut event_handler_ids);

    // 6. Generate Expression Wrappers
    let expression_deps = std::cell::RefCell::new(HashMap::new());
    let expressions_code = input
        .expressions
        .iter()
        .map(|expr| {
            let mut all_locals: HashSet<String> = loop_vars.clone();
            for imp in &imported_identifiers {
                all_locals.insert(imp.clone());
            }

            let mut expression_locals = local_vars.clone();
            for loc in &script_locals {
                expression_locals.insert(loc.clone());
            }

            let is_event_handler = event_handler_ids.contains(&expr.id);
            let (transformed_code, state_deps, uses_loop, expr_errors, mutated_deps) = compute_expression_intent(
                expr,
                &state_vars,
                &prop_vars,
                &expression_locals,
                &local_vars,
                &all_locals,
                is_event_handler,
            );
            all_errors.extend(expr_errors);
            expression_deps.borrow_mut().insert(expr.id.clone(), state_deps);

            // Phase 6: Wrap expressions with notification for mutated deps
            let mut final_code = transformed_code.trim_end_matches(';').to_string();
            if !mutated_deps.is_empty() {
                let notifications: Vec<String> = mutated_deps.iter()
                    .map(|d| format!("window.zenithNotify(scope, 'state', '{}');", d))
                    .collect();
                final_code = format!("(() => {{ const __v = ({});\n  {};\n  return __v; }})()", final_code, notifications.join("\n  "));
            } else {
                final_code = format!("({});", final_code);
            }

            let args = if uses_loop {
                "scope, item, index, array"
            } else {
                "scope"
            };

            let fn_name = format!("_expr_{}", expr.id);
            format!(
                "function {}({}) {{
  try {{
    const v = {};
    return (v && typeof v === 'function' && v._isSignal) ? v() : (v === undefined ? '' : (Number.isNaN(v) ? 0 : v));
  }} catch (e) {{
    const errorMsg = `[Zenith Runtime] Expression {} failed: ${{e.message}}`;
    console.error(errorMsg);
    // Placeholder for Z-ERR-UNRESOLVED-IDENT
    if (e instanceof ReferenceError) {{
       console.warn('[Z-ERR-UNRESOLVED-IDENT] Identifier in expression might be missing from scope:', e.message);
    }}
    return '';
  }}
}}",
                fn_name,
                args,
                final_code,
                expr.id
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let expression_registry = if input.expressions.is_empty() {
        "// No expressions to register".to_string()
    } else {
        let deps_map = expression_deps.into_inner();
        let entries: Vec<String> = input
            .expressions
            .iter()
            .map(|e| {
                let deps = deps_map.get(&e.id).cloned().unwrap_or_default();
                let deps_js = format!(
                    "[{}]",
                    deps.iter()
                        .map(|d| format!("'{}'", d))
                        .collect::<Vec<_>>()
                        .join(", ")
                );
                format!(
                    "  window.__ZENITH_EXPRESSIONS__.set('{}', {{ fn: _expr_{}, deps: {} }});",
                    e.id, e.id, deps_js
                )
            })
            .collect();
        format!(
            "if (typeof window !== 'undefined') {{\n  if (!window.__ZENITH_EXPRESSIONS__) window.__ZENITH_EXPRESSIONS__ = new Map();\n{}\n}}",
            entries.join("\n")
        )
    };

    // 8. Styles
    let styles_code = input
        .styles
        .iter()
        .map(|s| s.raw.clone())
        .collect::<Vec<_>>()
        .join("\n");

    // 9. State Init
    let state_init_code = state_decls
        .iter()
        .map(|d| format!("state.{} = {};", d.name, d.initial_value))
        .collect::<Vec<_>>()
        .join("\n");

    let state_props: Vec<String> = state_decls
        .iter()
        .map(|d| format!("  {}: {}", d.name, d.initial_value))
        .collect();

    let reactive_state_init = format!(
        "const state = zenState({{\n{}\n}});\n  const __defaultState = state;\n  const props = {{}};\n  const locals = {{}};\n  const scope = {{ state, props, locals }};",
        state_props.join(",\n")
    );

    // 10. Hydration Runtime (External Import)
    // We no longer embed the runtime string. We generate an ESM import with named aliases.
    let hydration = r#"import {
  signal as zenSignal,
  state as zenState,
  effect as zenEffect,
  memo as zenMemo,
  ref as zenRef,
  onMount as zenOnMount,
  onUnmount as zenOnUnmount,
  batch as zenBatch,
  untrack as zenUntrack,
  hydrate as zenHydrate
} from "@zenithbuild/runtime";"#;

    // 11. Bundle construction
    // SERIALIZE TEMPLATE IR FOR HYDRATION (Metadata Injection)
    let template_json = serde_json::to_string(&input.nodes).expect(
        "❌ [Zenith Critical] Failed to serialize Template IR. This is a fatal compiler bug.",
    );

    // Construct the canonicalIR function string
    let canonical_ir_fn = format!(
        "const canonicalIR = (scope) => {{ return {}; }};\n  window.canonicalIR = canonicalIR;",
        template_json
    );

    let bundle_code = format!(
        r#"
{}
// [ZENITH-NATIVE] Rust Compiler Authority Bundle
{}

  if (!window.__ZENITH_SCOPES__) window.__ZENITH_SCOPES__ = {{}};
  
  // Zenith standard aliases
  const ref = zenRef;
  const reactive = zenState;
  const effect = zenEffect;
  const memo = zenMemo;
  const onMount = zenOnMount;

  // 3. Component instance
  const __instance = {{ mountHooks: [] }};
  if (window.__zenith && window.__zenith.setActiveInstance) {{
    window.__zenith.setActiveInstance(__instance);
  }}

  // 4. Environment Prelude (hoisted zenRoute calls)
  {}

  // 5. Reactive state
  {}

  // 6. User script (Wrapped in setup for export)
  function setup() {{
    {}
  }}
  setup(); // Auto-execute to register hooks/state

  // 7. Expressions
  {}
  {}

  // 8. Styles injection
  const __styles = `{}`.replace(/`/g, '\\\\`');
  if (__styles && typeof document !== 'undefined') {{
    const styleTag = document.head.querySelector('style[data-zen-styles]') || document.createElement('style');
    styleTag.textContent = (styleTag.textContent || '') + __styles;
    if (!styleTag.parentNode) document.head.appendChild(styleTag);
  }}

  // 9. Template IR
  {}

  // 10. Hydration
  function initHydration() {{
    if (typeof zenHydrate === 'function') {{
      // Pass 'app' to target #app container, not document.body which wipes scripts
      zenHydrate(state, 'app', locals);
    }}
    
    // Initialize components
    if (window.__ZENITH_SCOPES__) {{
        Object.values(window.__ZENITH_SCOPES__).forEach(s => {{
            if (typeof s.__run === 'function') s.__run();
        }});
    }}

    if (window.__zenith && window.__zenith.triggerMount) {{
      window.__zenith.triggerMount(__instance);
    }}
  }}

  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', initHydration);
  }} else {{
    initHydration();
  }}

// Module export for virtual entry import
export default {{ setup, render: canonicalIR }};
"#,
        all_imports,
        hydration,
        format!(
            "// === ZENITH ENVIRONMENT PRELUDE ===\n{}",
            environment_prelude
                .join("\n")
                .replace("zenRoute(", "__ZENITH_RUNTIME__.zenRoute(")
        ),
        reactive_state_init,
        script_no_imports,
        expressions_code,
        expression_registry,
        styles_code,
        canonical_ir_fn
    );

    RuntimeCode {
        expressions: expressions_code,
        render: render_fn,
        hydration: hydration.to_string(),
        styles: styles_code,
        script: script_no_imports,
        state_init: state_init_code,
        bundle: bundle_code,
        npm_imports: script_imports,
        errors: all_errors,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE IR GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

fn get_node_args(node_loop_context: &Option<crate::validate::LoopContext>) -> String {
    if let Some(lc) = node_loop_context {
        if lc.variables.is_empty() {
            "scope".to_string()
        } else {
            format!("scope, {}", lc.variables.join(", "))
        }
    } else {
        "scope".to_string()
    }
}

fn generate_template_ir(node: &TemplateNode, expressions: &[ExpressionInput]) -> String {
    match node {
        TemplateNode::Element(el) => generate_element_ir(el, expressions),
        TemplateNode::Text(t) => format!("\"{}\"", escape_js_string(&t.value)),
        TemplateNode::Expression(e) => {
            let expr_id = expressions
                .iter()
                .find(|ex| ex.code.trim() == e.expression.trim() || ex.id == e.expression)
                .map(|ex| ex.id.clone())
                .unwrap_or_else(|| format!("inline_{}", e.expression.len()));
            let args = get_node_args(&e.loop_context);

            // HEAD EXPRESSIONS: If in <head>, execute the expression immediately during render
            // This ensures the value is baked into the HTML as a static string, with no runtime/hydration placeholder.
            if e.is_in_head {
                return format!("(_expr_{}({}))", expr_id, args);
            }

            format!(
                "{{ type: 'expression', value: () => (_expr_{}({})), id: '{}' }}",
                expr_id, args, expr_id
            )
        }

        TemplateNode::LoopFragment(loop_node) => {
            let body_ir: Vec<String> = loop_node
                .body
                .iter()
                .map(|n| generate_template_ir(n, expressions))
                .collect();
            let source_id = expressions
                .iter()
                .find(|ex| ex.code.trim() == loop_node.source.trim() || ex.id == loop_node.source)
                .map(|ex| ex.id.clone())
                .unwrap_or_else(|| loop_node.source.clone());

            // CRITICAL: The source expression should NOT receive loop variables that are
            // introduced BY this loop. Those variables (item_var, index_var) don't exist
            // until INSIDE the .map() callback. We need to filter them out.
            let parent_args = if let Some(ref lc) = loop_node.loop_context {
                // Filter out this loop's own variables from the context
                let parent_vars: Vec<&String> = lc
                    .variables
                    .iter()
                    .filter(|v| {
                        *v != &loop_node.item_var
                            && loop_node.index_var.as_ref().map_or(true, |idx| *v != idx)
                    })
                    .collect();
                if parent_vars.is_empty() {
                    "state".to_string()
                } else {
                    format!(
                        "state, {}",
                        parent_vars
                            .iter()
                            .map(|s| s.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
            } else {
                "state".to_string()
            };

            format!(
                "(_expr_{}({})).map(({}{}) => {})",
                source_id,
                parent_args,
                loop_node.item_var,
                loop_node
                    .index_var
                    .as_ref()
                    .map(|i| format!(", {}", i))
                    .unwrap_or_default(),
                if body_ir.len() == 1 {
                    body_ir[0].clone()
                } else {
                    format!("[{}]", body_ir.join(", "))
                }
            )
        }

        TemplateNode::ConditionalFragment(cond) => {
            let cons: Vec<String> = cond
                .consequent
                .iter()
                .map(|n| generate_template_ir(n, expressions))
                .collect();
            let alt: Vec<String> = cond
                .alternate
                .iter()
                .map(|n| generate_template_ir(n, expressions))
                .collect();
            let cond_id = expressions
                .iter()
                .find(|ex| ex.code.trim() == cond.condition.trim() || ex.id == cond.condition)
                .map(|ex| ex.id.clone())
                .unwrap_or_else(|| cond.condition.clone());
            let args = get_node_args(&cond.loop_context);
            format!(
                "(_expr_{}({})) ? {} : {}",
                cond_id,
                args,
                if cons.len() == 1 {
                    cons[0].clone()
                } else {
                    format!("[{}]", cons.join(", "))
                },
                if alt.len() == 1 {
                    alt[0].clone()
                } else {
                    format!("[{}]", alt.join(", "))
                }
            )
        }
        TemplateNode::OptionalFragment(opt) => {
            let frag: Vec<String> = opt
                .fragment
                .iter()
                .map(|n| generate_template_ir(n, expressions))
                .collect();
            let cond_id = expressions
                .iter()
                .find(|ex| ex.code.trim() == opt.condition.trim() || ex.id == opt.condition)
                .map(|ex| ex.id.clone())
                .unwrap_or_else(|| opt.condition.clone());
            let args = get_node_args(&opt.loop_context);
            format!(
                "(_expr_{}({})) && {}",
                cond_id,
                args,
                if frag.len() == 1 {
                    frag[0].clone()
                } else {
                    format!("[{}]", frag.join(", "))
                }
            )
        }
        TemplateNode::Component(c) => generate_component_ir(c, expressions),
        TemplateNode::Doctype(_) => "\"\"".to_string(),
    }
}

fn generate_element_ir(el: &ElementNode, expressions: &[ExpressionInput]) -> String {
    let args = get_node_args(&el.loop_context);
    let props: Vec<String> = el
        .attributes
        .iter()
        .filter_map(|attr| {
            // Convert data-zen-* event handlers to on* function props
            let (prop_name, prop_val) = match attr.name.as_str() {
                "data-zen-click" => {
                    if let AttributeValue::Static(fn_name) = &attr.value {
                        // Convert to onclick function prop
                        (
                            "onclick".to_string(),
                            format!("function(event, target) {{ {}() }}", fn_name),
                        )
                    } else {
                        return Some(format!("\"onclick\": function(event, target) {{}}"));
                    }
                }
                "data-zen-change" => {
                    if let AttributeValue::Static(fn_name) = &attr.value {
                        (
                            "onchange".to_string(),
                            format!("function(event, target) {{ {}(event) }}", fn_name),
                        )
                    } else {
                        return Some(format!("\"onchange\": function(event, target) {{}}"));
                    }
                }
                "data-zen-input" => {
                    if let AttributeValue::Static(fn_name) = &attr.value {
                        (
                            "oninput".to_string(),
                            format!("function(event, target) {{ {}(event) }}", fn_name),
                        )
                    } else {
                        return Some(format!("\"oninput\": function(event, target) {{}}"));
                    }
                }
                "data-zen-submit" => {
                    if let AttributeValue::Static(fn_name) = &attr.value {
                        (
                            "onsubmit".to_string(),
                            format!(
                                "function(event, target) {{ event.preventDefault(); {}(event); }}",
                                fn_name
                            ),
                        )
                    } else {
                        return Some(format!("\"onsubmit\": function(event, target) {{}}"));
                    }
                }
                _ => {
                    // Standard attribute handling
                    let mut p_name = attr.name.clone();

                    // Normalize "on:click" -> "onclick"
                    if p_name.starts_with("on:") {
                        p_name = format!("on{}", &p_name[3..]);
                    }

                    let val = match &attr.value {
                        AttributeValue::Static(s) => {
                            // If it's a standard event handler, wrap it correctly
                            if p_name.starts_with("on") && p_name.len() > 2 {
                                let is_simple_id = s
                                    .chars()
                                    .all(|c| c.is_alphanumeric() || c == '_' || c == '$')
                                    && !s.is_empty();
                                if is_simple_id {
                                    format!("function(event, target) {{ {}() }}", s)
                                } else {
                                    format!("function(event, target) {{ {} }}", s)
                                }
                            } else {
                                format!("\"{}\"", escape_js_string(s))
                            }
                        }
                        AttributeValue::Dynamic(expr) => {
                            if p_name.starts_with("on") {
                                // Event Handler: Evaluate the expression, and if it returns
                                // a function (e.g. on:click={increment}), call it with the event.
                                // If it returns a non-function (e.g. on:click={count++}), the
                                // side-effect already ran during evaluation, so do nothing extra.
                                format!(
                                    "{{ fn: function(event, target) {{ var _expr_ = _expr_{}({}); if (typeof _expr_ === 'function') _expr_(event); }}, id: '{}' }}",
                                    expr.id, args, expr.id
                                )
                            } else {
                                // Reactive Attribute: Return wrapper
                                format!(
                                    "{{ fn: () => (_expr_{}({})), id: '{}' }}",
                                    expr.id, args, expr.id
                                )
                            }
                        }
                    };
                    (p_name, val)
                }
            };
            Some(format!("\"{}\": {}", prop_name, prop_val))
        })
        .collect();

    // For structural elements, we still use __zenith.h but they are handled specially by the runtime hydration
    let props_str = if props.is_empty() {
        "null".to_string()
    } else {
        format!("{{ {} }}", props.join(", "))
    };

    let children: Vec<String> = el
        .children
        .iter()
        .map(|c| generate_template_ir(c, expressions))
        .collect();
    let children_str = format!("[{}]", children.join(", "));

    format!(
        "window.__zenith.h(\"{}\", {}, {})",
        el.tag, props_str, children_str
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESSION INTENT
// ═══════════════════════════════════════════════════════════════════════════════

fn compute_expression_intent(
    expr: &ExpressionInput,
    state_bindings: &HashSet<String>,
    prop_bindings: &HashSet<String>,
    local_bindings: &HashSet<String>,
    external_locals: &HashSet<String>,
    loop_vars: &HashSet<String>,
    is_event_handler: bool,
) -> (String, Vec<String>, bool, Vec<String>, Vec<String>) {
    let allocator = Allocator::default();
    let source_type = SourceType::default().with_jsx(true).with_typescript(true);
    let code = &expr.code;

    // Check if it uses loop variables (fast check)
    let uses_loop = expr.loop_context.is_some() || loop_vars.iter().any(|v| code.contains(v));

    // Parse the expression
    let parser = Parser::new(&allocator, code, source_type);
    let ret = parser.parse();
    if !ret.errors.is_empty() {
        // Fallback to original code if parsing fails (e.g. fragment bits)
        return (code.clone(), vec![], uses_loop, vec![], vec![]);
    }

    let mut program = ret.program;

    // 1. Lower JSX to __zenith.h calls
    let mut jsx_lowerer = JsxLowerer::new(&allocator);
    jsx_lowerer.visit_program(&mut program);

    let mut renamer = ScriptRenamer::with_categories(
        &allocator,
        state_bindings.clone(),
        prop_bindings.clone(),
        local_bindings.clone(),
        external_locals.clone(),
    );
    renamer.allow_prop_fallback = false; // Strict Enforcement: Disallow fallback for root-level identifiers
                                         // Add loop variables from context as true JS locals
    if let Some(lc) = &expr.loop_context {
        for v in &lc.variables {
            renamer.add_local(v.clone());
        }
    }
    for v in loop_vars {
        renamer.add_local(v.clone());
    }
    renamer.visit_program(&mut program);

    if is_event_handler {
        renamer.is_event_handler = true;
    }
    // Re-visit for the new enforcement logic (VisitMut is idempotent for renaming)
    renamer.visit_program(&mut program);

    // Codegen the transformed expression
    let mut transformed = Codegen::new().build(&program).code;
    // Trim trailing whitespace and SEMICOLONS (Expressions in Zenith should not have them internally)
    transformed = transformed.trim().trim_end_matches(';').to_string();

    if transformed.contains("docsOrder") || transformed.contains("render") {
        panic!(
            "\n\n[DEBUG PANIC] Found target code!\nCode: {}\nTransformed: {}\n\n",
            expr.code, transformed
        );
    }

    // Phase 5 Enhancement 3: Use direct dependency tracking from ScriptRenamer
    // No more string matching - deps are collected during AST traversal
    let deps: Vec<String> = renamer.state_deps.into_iter().collect();
    let mutated = renamer.mutated_state_deps.into_iter().collect();

    (transformed, deps, uses_loop, renamer.errors, mutated)
}

fn collect_event_handler_ids(nodes: &[TemplateNode], ids: &mut HashSet<String>) {
    for node in nodes {
        match node {
            TemplateNode::Element(el) => {
                for attr in &el.attributes {
                    if attr.name.starts_with("on") || attr.name.starts_with("data-zen-") {
                        if let AttributeValue::Dynamic(expr) = &attr.value {
                            ids.insert(expr.id.clone());
                        }
                    }
                }
                collect_event_handler_ids(&el.children, ids);
            }
            TemplateNode::Component(c) => {
                for attr in &c.attributes {
                    if attr.name.starts_with("on") {
                        if let AttributeValue::Dynamic(expr) = &attr.value {
                            ids.insert(expr.id.clone());
                        }
                    }
                }
                collect_event_handler_ids(&c.children, ids);
            }
            TemplateNode::ConditionalFragment(cf) => {
                collect_event_handler_ids(&cf.consequent, ids);
                collect_event_handler_ids(&cf.alternate, ids);
            }
            TemplateNode::OptionalFragment(of) => {
                collect_event_handler_ids(&of.fragment, ids);
            }
            TemplateNode::LoopFragment(lf) => {
                collect_event_handler_ids(&lf.body, ids);
            }
            _ => {}
        }
    }
}

fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "")
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

fn generate_component_ir(
    comp: &crate::validate::ComponentNode,
    expressions: &[ExpressionInput],
) -> String {
    let args = get_node_args(&comp.loop_context);
    let props: Vec<String> = comp
        .attributes
        .iter()
        .filter_map(|attr| {
            let mut p_name = attr.name.clone();

            // Normalize "on:click" -> "onclick"
            if p_name.starts_with("on:") {
                p_name = format!("on{}", &p_name[3..]);
            }

            let val = match &attr.value {
                AttributeValue::Static(s) => {
                    // If it's a standard event handler, wrap it correctly
                    if p_name.starts_with("on") && p_name.len() > 2 {
                        format!("function(event, target) {{ {} }}", s) // Simplified for components
                    } else {
                        format!("\"{}\"", escape_js_string(s))
                    }
                }
                AttributeValue::Dynamic(expr) => {
                    if p_name.starts_with("on") {
                        // Event Handler: Evaluate the expression, and if it returns
                        // a function (e.g. on:click={increment}), call it with the event.
                        // If it returns a non-function (e.g. on:click={count++}), the
                        // side-effect already ran during evaluation, so do nothing extra.
                        format!(
                            "{{ fn: function(event, target) {{ var _expr_ = _expr_{}({}); if (typeof _expr_ === 'function') _expr_(event); }}, id: '{}' }}",
                            expr.id, args, expr.id
                        )
                    } else {
                        // Reactive Attribute: Return wrapper
                        format!(
                            "{{ fn: () => (_expr_{}({})), id: '{}' }}",
                            expr.id, args, expr.id
                        )
                    }
                }
            };
            Some(format!("\"{}\": {}", p_name, val))
        })
        .collect();

    let props_str = if props.is_empty() {
        "null".to_string()
    } else {
        format!("{{ {} }}", props.join(", "))
    };

    let children: Vec<String> = comp
        .children
        .iter()
        .map(|c| generate_template_ir(c, expressions))
        .collect();
    let children_str = format!("[{}]", children.join(", "));

    // Use component name as Identifier (not string)
    format!(
        "window.__zenith.h({}, {}, {})",
        comp.name, props_str, children_str
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_js_string() {
        assert_eq!(escape_js_string("hello\"world"), "hello\\\"world");
        assert_eq!(escape_js_string("line1\nline2"), "line1\\nline2");
    }

    #[test]
    fn test_expression_intent() {
        let expr = ExpressionInput {
            id: "test".to_string(),
            code: "count + 1".to_string(),
            loop_context: None,
        };
        let mut state_vars = HashSet::new();
        state_vars.insert("count".to_string());
        let comp_prop_bindings = HashSet::new();
        let comp_local_bindings = HashSet::new();

        let (code, deps, uses_loop, errors, _mutated) = compute_expression_intent(
            &expr,
            &state_vars,
            &comp_prop_bindings,
            &comp_local_bindings,
            &HashSet::new(), // Component-level external locals
            &HashSet::new(),
            true, // Phase A7: Disallow reactive access in __run()
        );
        assert!(code.contains("scope.state.count"));
        assert!(deps.contains(&"count".to_string()));
        assert!(!uses_loop);
        assert!(errors.is_empty());
    }
}
