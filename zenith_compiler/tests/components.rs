use zenith_compiler::compiler::compile as compile_zen;

fn compile(input: &str) -> String {
    compile_zen(input).expect("compile should succeed")
}


/// Precision Lock: Components are structurally identical to Elements.
/// No resolution. No expansion. No special casing.
/// Uppercase tag is convention only, NOT behavior.

#[test]
fn self_closing_component_emitted_verbatim() {
    let input = r#"<Header />"#;
    let output = compile(input);

    println!("Output:\n{}", output);

    // Tag name preserved exactly
    assert!(output.contains("<Header"));
    // Self-closing preserved
    assert!(output.contains("/>"));
    // No expressions
    assert!(output.contains(r#"__zenith_expr = []"#));
}

#[test]
fn component_with_static_attribute() {
    let input = r#"<Card title="Hello" />"#;
    let output = compile(input);

    println!("Output:\n{}", output);

    // Static attribute preserved verbatim
    assert!(output.contains(r#"title="Hello""#));
    // No expressions
    assert!(output.contains(r#"__zenith_expr = []"#));
}

#[test]
fn component_with_expression_attribute() {
    let input = r#"<Header title={mainTitle} />"#;
    let output = compile(input);

    println!("Output:\n{}", output);

    // Expression indexed
    assert!(output.contains(r#"data-zx-title="0""#));
    // Expression table populated
    assert!(output.contains(r#"__zenith_expr = ["mainTitle"]"#));
}

#[test]
fn component_open_close_not_normalized() {
    // <Component></Component> must NOT be silently self-closed.
    // Emit exactly as written.
    let input = r#"<Component></Component>"#;
    let output = compile(input);

    println!("Output:\n{}", output);

    // Must contain both opening and closing tags, NOT self-closing
    assert!(output.contains("<Component>"));
    assert!(output.contains("</Component>"));
    assert!(!output.contains("/>"));
}

#[test]
fn expression_indexing_is_deterministic_left_to_right() {
    // Left-to-right depth-first traversal order
    let input = r#"<div><Header title={first} /><Footer label={second} /></div>"#;
    let output = compile(input);

    println!("Output:\n{}", output);

    // "first" must be index 0, "second" must be index 1
    assert!(output.contains(r#"data-zx-title="0""#));
    assert!(output.contains(r#"data-zx-label="1""#));
    assert!(output.contains(r#"__zenith_expr = ["first", "second"]"#));
}

#[test]
fn component_is_not_a_separate_node_type() {
    // Uppercase and lowercase tags produce identical structure.
    // The compiler does NOT know what a component is.
    let lower = compile(r#"<header title={val} />"#);
    let upper = compile(r#"<Header title={val} />"#);

    // Both must have identical expression tables
    assert!(lower.contains(r#"__zenith_expr = ["val"]"#));
    assert!(upper.contains(r#"__zenith_expr = ["val"]"#));

    // Both must have data-zx-title="0"
    assert!(lower.contains(r#"data-zx-title="0""#));
    assert!(upper.contains(r#"data-zx-title="0""#));

    // Only difference is the tag name itself
    assert!(lower.contains("<header"));
    assert!(upper.contains("<Header"));
}
