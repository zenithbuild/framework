use zenith_compiler::compiler::compile;

#[test]
fn compiles_basic_expression() {
    let input = r#"<h1>{count}</h1>"#;

    let output = compile(input);

    println!("Output: {}", output);

    assert!(output.contains(r#"data-zx-e="0""#));
    assert!(output.contains(r#"__zenith_expr = ["count"]"#));
}

#[test]
fn compiles_event_handler() {
    let input = r#"<button on:click={increment}>+</button>"#;

    let output = compile(input);

    println!("Output: {}", output);

    assert!(output.contains(r#"data-zx-on-click="0""#));
    assert!(output.contains(r#"__zenith_expr = ["increment"]"#));
}
