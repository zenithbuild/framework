use zenith_compiler::compiler::{compile, compile_structured, CompilerOutput};

// ============================================================
// PHASE 13: PUBLIC COMPILER CONTRACT (BUNDLER INTERFACE)
// The bundler sees ONLY CompilerOutput.
// It cannot reach into AST, modify nodes, or influence indexing.
// ============================================================

#[test]
fn compile_structured_returns_correct_shape() {
    let result = compile_structured("<h1>{title}</h1>");

    assert_eq!(result.expressions, vec!["title"]);
    assert!(result.html.contains("<h1"));
    assert!(result.html.contains("data-zx-e=\"0\""));
}

#[test]
fn compile_structured_matches_compile_html() {
    let input = r#"<div id="app"><h1>{title}</h1><button on:click={save}>Save</button></div>"#;

    let structured = compile_structured(input);
    let full = compile(input);

    // The HTML from compile_structured must match the HTML embedded in compile's output
    assert!(
        full.contains(&structured.html),
        "compile_structured HTML must match compile output.\nStructured HTML: {}\nFull output: {}",
        structured.html,
        full
    );
}

#[test]
fn compile_structured_expressions_match_compile() {
    let input = r#"<div title={a}>{b}<span>{c}</span></div>"#;

    let structured = compile_structured(input);

    assert_eq!(structured.expressions, vec!["a", "b", "c"]);
}

#[test]
fn compiler_output_is_sealed_data_only() {
    // CompilerOutput has exactly 2 fields: html and expressions
    // This test ensures the struct shape at compile time
    let output = CompilerOutput {
        html: String::from("<div></div>"),
        expressions: vec![],
    };

    // Can clone and compare (derives enforced)
    let cloned = output.clone();
    assert_eq!(output, cloned);
}

#[test]
fn compile_structured_no_extra_wrapping() {
    let result = compile_structured("<p>hello</p>");

    // HTML is raw — no backticks, no export, no module wrapper
    assert!(!result.html.contains("export"));
    assert!(!result.html.contains("`"));
    assert!(!result.html.contains("__zenith_expr"));
    assert_eq!(result.html, "<p>hello</p>");
}

#[test]
fn compile_structured_empty_expressions_for_static() {
    let result = compile_structured(r#"<div id="static"></div>"#);

    assert!(result.expressions.is_empty());
    assert_eq!(result.html, r#"<div id="static"></div>"#);
}

#[test]
fn compile_structured_per_file_isolation() {
    let a = compile_structured("<div>{x}</div>");
    let b = compile_structured("<div>{y}</div>");

    // No shared state between calls
    assert_eq!(a.expressions, vec!["x"]);
    assert_eq!(b.expressions, vec!["y"]);
}
