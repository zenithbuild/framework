use zenith_compiler::compiler::compile;

// ============================================================
// 6.3 ZERO SEMANTIC AWARENESS TESTS
// The compiler does NOT:
//   - Resolve imports
//   - Look up component definitions
//   - Infer meaning from tag names
//   - Attach runtime behavior
// It only emits structure.
// ============================================================

#[test]
fn no_import_resolution() {
    // Compiler never generates import statements
    let output = compile("<MyComponent />");
    assert!(!output.contains("import "));
    assert!(!output.contains("require("));
}

#[test]
fn no_component_definition_lookup() {
    // Nonexistent component compiles fine — no resolution attempt
    let output = compile("<CompletelyFakeWidget />");
    assert!(output.contains("<CompletelyFakeWidget />"));
}

#[test]
fn tag_name_has_no_semantic_meaning() {
    // "script", "style", "head" — all treated identically to "div"
    let script = compile("<script></script>");
    let div = compile("<div></div>");

    // Both produce empty expression tables
    assert!(script.contains("__zenith_expr = []"));
    assert!(div.contains("__zenith_expr = []"));

    // Both emit setup()
    assert!(script.contains("export function setup()"));
    assert!(div.contains("export function setup()"));
}

#[test]
fn no_runtime_behavior_attached() {
    // Output never contains runtime-specific keywords
    let output = compile(r#"<button on:click={handler}>click</button>"#);

    assert!(!output.contains("addEventListener"));
    assert!(!output.contains("proxy"));
    assert!(!output.contains("signal"));
    assert!(!output.contains("reactive"));
    assert!(!output.contains("useState"));
    assert!(!output.contains("createEffect"));
    assert!(!output.contains("observe"));
}

#[test]
fn no_virtual_dom_concepts() {
    let output = compile("<div>{x}</div>");

    assert!(!output.contains("vnode"));
    assert!(!output.contains("createElement"));
    assert!(!output.contains("render"));
    assert!(!output.contains("diff"));
    assert!(!output.contains("patch"));
    assert!(!output.contains("h("));
}

#[test]
fn output_always_has_exact_three_exports() {
    let output = compile("<div>{x}</div>");

    // Exactly three exports: __zenith_expr, setup, default
    assert!(output.contains("export const __zenith_expr"));
    assert!(output.contains("export function setup()"));
    assert!(output.contains("export default `"));

    // No other exports
    let export_count = output.matches("export ").count();
    assert_eq!(
        export_count, 3,
        "Must have exactly 3 exports, found {}",
        export_count
    );
}

#[test]
fn expression_strings_emitted_unmodified() {
    // Expression identity preservation
    let output = compile(r#"<div>{myVar_123}</div>"#);
    assert!(output.contains(r#""myVar_123""#));

    let output2 = compile(r#"<div>{some_long_expression_name}</div>"#);
    assert!(output2.contains(r#""some_long_expression_name""#));
}
