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
    let input = r#"<div>{props.a}<span>{props.b}</span></div>"#;
    let output = compile(input);

    // a = index 0, b = index 1
    // NOT grouped, NOT flattened
    assert!(output.contains(r#"__zenith_expr = ["props.a", "props.b"]"#));
}

#[test]
fn deeply_nested_expressions_preserve_order() {
    let input = r#"<div>{props.a}<ul><li>{props.b}<span>{props.c}</span></li></ul>{props.d}</div>"#;
    let output = compile(input);

    // Depth-first left-to-right: a, b, c, d
    assert!(output.contains(r#"__zenith_expr = ["props.a", "props.b", "props.c", "props.d"]"#));
}

#[test]
fn expression_per_level_not_grouped() {
    let input =
        r#"<div>{props.top}<section>{props.mid}<article>{props.deep}</article></section></div>"#;
    let output = compile(input);

    // Each expression is its own index — never grouped by nesting level
    assert!(output.contains(r#"__zenith_expr = ["props.top", "props.mid", "props.deep"]"#));
}

// --- 8.2 Expression in Attribute + Child ---

#[test]
fn attribute_expression_before_child_expression() {
    let input = r#"<Card title={props.a}>{props.b}</Card>"#;
    let output = compile(input);

    // Attribute a = 0, child b = 1. Always.
    assert!(output.contains(r#"__zenith_expr = ["props.a", "props.b"]"#));
    assert!(output.contains(r#"data-zx-title="0""#));
    assert!(output.contains(r#"data-zx-e="1""#));
}

#[test]
fn multiple_attributes_then_children() {
    let input = r#"<Widget x={props.a} y={props.b}>{props.c}{props.d}</Widget>"#;
    let output = compile(input);

    // Attrs first: a=0, b=1. Children: c=2, d=3.
    assert!(output.contains(r#"__zenith_expr = ["props.a", "props.b", "props.c", "props.d"]"#));
    assert!(output.contains(r#"data-zx-x="0""#));
    assert!(output.contains(r#"data-zx-y="1""#));
    assert!(output.contains(r#"<!--zx-e:2-->"#));
    assert!(output.contains(r#"<!--zx-e:3-->"#));
    assert!(!output.contains(r#"data-zx-e="2 3""#));
}

#[test]
fn event_then_attribute_then_child() {
    let input = r#"<button on:click={props.handler} label={props.text}>{props.content}</button>"#;
    let output = compile(input);

    // Source order: handler=0, text=1, content=2
    assert!(output.contains(r#"__zenith_expr = ["props.handler", "props.text", "props.content"]"#));
    assert!(output.contains(r#"data-zx-on-click="0""#));
    assert!(output.contains(r#"data-zx-label="1""#));
    assert!(output.contains(r#"data-zx-e="2""#));
}

// --- 8.3 Expression Identity Preservation ---

#[test]
fn expression_string_never_modified() {
    let output = compile(r#"<div>{props.myVariable}</div>"#);
    assert!(output.contains(r#""props.myVariable""#));
    // Not wrapped, not proxied, not renamed
    assert!(!output.contains("proxy"));
    assert!(!output.contains("wrapper"));
}

#[test]
fn expression_with_underscores_preserved() {
    let output = compile(r#"<div>{props.my_long_var_name}</div>"#);
    assert!(output.contains(r#""props.my_long_var_name""#));
}

#[test]
fn expression_with_numbers_preserved() {
    let output = compile(r#"<div>{props.item2}</div>"#);
    assert!(output.contains(r#""props.item2""#));
}

#[test]
fn no_expression_splitting() {
    // One expression = one index. Never split.
    let output = compile(r#"<div>{props.singleExpr}</div>"#);
    let expr_count = output.matches(r#"__zenith_expr"#).count();
    assert_eq!(expr_count, 1, "Only one expression table declaration");

    // The expression table contains exactly one entry
    assert!(output.contains(r#"__zenith_expr = ["props.singleExpr"]"#));
}

#[test]
fn no_expression_merging() {
    // Two distinct expressions must remain two distinct entries
    let output = compile(r#"<div>{props.a}{props.b}</div>"#);
    assert!(output.contains(r#"__zenith_expr = ["props.a", "props.b"]"#));
    // Not merged into one
    assert!(!output.contains(r#"__zenith_expr = ["ab"]"#));
}

#[test]
fn mixed_inline_text_and_code_use_stable_placeholders() {
    let output = compile(r#"<p>{props.before}<code>{props.code}</code>{props.after}</p>"#);

    assert!(output.contains(r#"__zenith_expr = ["props.before", "props.code", "props.after"]"#));
    assert!(output.contains(r#"<!--zx-e:0--><code data-zx-e="1"></code><!--zx-e:2-->"#));
    assert!(!output.contains(r#"<p data-zx-e="0 2">"#));
}

#[test]
fn raw_text_elements_collapse_static_and_dynamic_content() {
    let output = compile(r#"<title>ZenithBuild | {props.pageTitle}</title>"#);

    assert!(output.contains(r#"ZenithBuild | "#));
    assert!(output.contains(r#"props.pageTitle"#));
    assert!(output.contains(r#"<title data-zx-e="0"></title>"#));
    assert!(!output.contains("display: contents"));
}

#[test]
fn option_mixed_text_and_expression_uses_parser_safe_placeholder() {
    let output = compile(r#"<option>Prefix {props.label}</option>"#);

    assert!(output.contains(r#"__zenith_expr = ["props.label"]"#));
    assert!(output.contains(r#"<option>Prefix <!--zx-e:0--></option>"#));
    assert!(!output.contains("display: contents"));
}
