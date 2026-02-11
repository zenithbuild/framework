use zenith_compiler::compiler::compile;

// ============================================================
// PHASE 7: MULTI-FILE STRUCTURAL ISOLATION
// Each file produces isolated structural output.
// No cross-file resolution. No symbol linking. No shared state.
// ============================================================

#[test]
fn each_file_produces_independent_output() {
    let file_a = compile("<div>{x}</div>");
    let file_b = compile("<span>{y}</span>");
    let file_c = compile("<p>{z}</p>");

    // Each has its own expression table
    assert!(file_a.contains(r#"__zenith_expr = ["x"]"#));
    assert!(file_b.contains(r#"__zenith_expr = ["y"]"#));
    assert!(file_c.contains(r#"__zenith_expr = ["z"]"#));

    // Each has its own setup
    assert!(file_a.contains("export function setup()"));
    assert!(file_b.contains("export function setup()"));
    assert!(file_c.contains("export function setup()"));
}

#[test]
fn cross_file_name_collision_no_shared_indexing() {
    // Two files both use <Component /> — no shared state
    let file_a = compile(r#"<Component title={a} />"#);
    let file_b = compile(r#"<Component title={b} />"#);

    // Each starts at index 0 independently
    assert!(file_a.contains(r#"data-zx-title="0""#));
    assert!(file_b.contains(r#"data-zx-title="0""#));

    // Different expression values
    assert!(file_a.contains(r#"__zenith_expr = ["a"]"#));
    assert!(file_b.contains(r#"__zenith_expr = ["b"]"#));
}

#[test]
fn global_index_resets_per_file() {
    // File A has 3 expressions
    let file_a = compile(r#"<div>{x}{y}{z}</div>"#);
    // File B compiled AFTER file A must start at 0, not 3
    let file_b = compile(r#"<div>{a}</div>"#);

    assert!(file_a.contains(r#"__zenith_expr = ["x", "y", "z"]"#));
    assert!(file_b.contains(r#"__zenith_expr = ["a"]"#));

    // file_b index is 0, not 3
    assert!(file_b.contains(r#"data-zx-e="0""#));
}

#[test]
fn identical_templates_produce_identical_output() {
    let file_a = compile("<div>{x}</div>");
    let file_b = compile("<div>{x}</div>");

    assert_eq!(
        file_a, file_b,
        "Identical input must produce identical output"
    );
}

#[test]
fn no_cross_file_symbol_leakage() {
    // Compile a file with "handler" expression
    let _ = compile(r#"<button on:click={handler}>click</button>"#);

    // Compile a completely different file — must not contain "handler"
    let file_b = compile("<p>text</p>");
    assert!(!file_b.contains("handler"));
    assert!(file_b.contains(r#"__zenith_expr = []"#));
}
