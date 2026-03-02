use zenith_compiler::compiler::compile as compile_zen;

fn compile(input: &str) -> String {
    compile_zen(input).expect("compile should succeed")
}


// ============================================================
// PHASE 8: EXPRESSION BOUNDARY HARDENING
// The compiler must never:
//   - Split expressions
//   - Merge expressions
//   - Wrap expressions
//   - Introduce scopes
// ============================================================

// --- 8.1 Nested Expression Integrity ---

#[test]
fn nested_expression_no_flattening() {
    let input = r#"<div>{a}<span>{b}</span></div>"#;
    let output = compile(input);

    // a = index 0, b = index 1
    // NOT grouped, NOT flattened
    assert!(output.contains(r#"__zenith_expr = ["a", "b"]"#));
}

#[test]
fn deeply_nested_expressions_preserve_order() {
    let input = r#"<div>{a}<ul><li>{b}<span>{c}</span></li></ul>{d}</div>"#;
    let output = compile(input);

    // Depth-first left-to-right: a, b, c, d
    assert!(output.contains(r#"__zenith_expr = ["a", "b", "c", "d"]"#));
}

#[test]
fn expression_per_level_not_grouped() {
    let input = r#"<div>{top}<section>{mid}<article>{deep}</article></section></div>"#;
    let output = compile(input);

    // Each expression is its own index — never grouped by nesting level
    assert!(output.contains(r#"__zenith_expr = ["top", "mid", "deep"]"#));
}

// --- 8.2 Expression in Attribute + Child ---

#[test]
fn attribute_expression_before_child_expression() {
    let input = r#"<Card title={a}>{b}</Card>"#;
    let output = compile(input);

    // Attribute a = 0, child b = 1. Always.
    assert!(output.contains(r#"__zenith_expr = ["a", "b"]"#));
    assert!(output.contains(r#"data-zx-title="0""#));
    assert!(output.contains(r#"data-zx-e="1""#));
}

#[test]
fn multiple_attributes_then_children() {
    let input = r#"<Widget x={a} y={b}>{c}{d}</Widget>"#;
    let output = compile(input);

    // Attrs first: a=0, b=1. Children: c=2, d=3.
    assert!(output.contains(r#"__zenith_expr = ["a", "b", "c", "d"]"#));
    assert!(output.contains(r#"data-zx-x="0""#));
    assert!(output.contains(r#"data-zx-y="1""#));
    assert!(output.contains(r#"data-zx-e="2 3""#));
}

#[test]
fn event_then_attribute_then_child() {
    let input = r#"<button on:click={handler} label={text}>{content}</button>"#;
    let output = compile(input);

    // Source order: handler=0, text=1, content=2
    assert!(output.contains(r#"__zenith_expr = ["handler", "text", "content"]"#));
    assert!(output.contains(r#"data-zx-on-click="0""#));
    assert!(output.contains(r#"data-zx-label="1""#));
    assert!(output.contains(r#"data-zx-e="2""#));
}

// --- 8.3 Expression Identity Preservation ---

#[test]
fn expression_string_never_modified() {
    let output = compile(r#"<div>{myVariable}</div>"#);
    assert!(output.contains(r#""myVariable""#));
    // Not wrapped, not proxied, not renamed
    assert!(!output.contains("proxy"));
    assert!(!output.contains("wrapper"));
}

#[test]
fn expression_with_underscores_preserved() {
    let output = compile(r#"<div>{my_long_var_name}</div>"#);
    assert!(output.contains(r#""my_long_var_name""#));
}

#[test]
fn expression_with_numbers_preserved() {
    let output = compile(r#"<div>{item2}</div>"#);
    assert!(output.contains(r#""item2""#));
}

#[test]
fn no_expression_splitting() {
    // One expression = one index. Never split.
    let output = compile(r#"<div>{singleExpr}</div>"#);
    let expr_count = output.matches(r#"__zenith_expr"#).count();
    assert_eq!(expr_count, 1, "Only one expression table declaration");

    // The expression table contains exactly one entry
    assert!(output.contains(r#"__zenith_expr = ["singleExpr"]"#));
}

#[test]
fn no_expression_merging() {
    // Two distinct expressions must remain two distinct entries
    let output = compile(r#"<div>{a}{b}</div>"#);
    assert!(output.contains(r#"__zenith_expr = ["a", "b"]"#));
    // Not merged into one
    assert!(!output.contains(r#"__zenith_expr = ["ab"]"#));
}
