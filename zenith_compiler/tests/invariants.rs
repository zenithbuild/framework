use zenith_compiler::compiler::compile;

// ============================================================
// 6.1 STRUCTURAL INVARIANT TESTS
// These are hard guarantees. If any fail, the compiler is broken.
// ============================================================

// --- No Tag Normalization ---

#[test]
fn open_close_not_rewritten_to_self_closing() {
    let output = compile("<Component></Component>");
    assert!(output.contains("<Component></Component>"));
    assert!(!output.contains("/>"));
}

#[test]
fn self_closing_remains_self_closing() {
    let output = compile("<Component />");
    assert!(output.contains("<Component />"));
    assert!(!output.contains("</Component>"));
}

#[test]
fn nested_open_close_preserved() {
    let output = compile("<Outer><Inner></Inner></Outer>");
    assert!(output.contains("<Outer>"));
    assert!(output.contains("<Inner></Inner>"));
    assert!(output.contains("</Outer>"));
}

// --- No Casing Semantics ---

#[test]
fn lowercase_and_uppercase_produce_identical_ast_shape() {
    let lower = compile(r#"<header class="x"></header>"#);
    let upper = compile(r#"<Header class="x"></Header>"#);

    // Both produce same structure, only tag name differs
    assert!(lower.contains(r#"class="x""#));
    assert!(upper.contains(r#"class="x""#));
    assert!(lower.contains("<header"));
    assert!(upper.contains("<Header"));

    // Same expression table (empty)
    assert!(lower.contains("__zenith_expr = []"));
    assert!(upper.contains("__zenith_expr = []"));
}

#[test]
fn mixed_case_tag_preserved_exactly() {
    let output = compile("<myComponent />");
    assert!(output.contains("<myComponent />"));
}

// --- No Component Node Type ---
// (Verified structurally: there is no Node::Component in ast.rs)
// This test proves it behaviorally.

#[test]
fn uppercase_tag_has_no_special_behavior() {
    let a = compile(r#"<div id={x} />"#);
    let b = compile(r#"<Widget id={x} />"#);

    // Both must produce identical expression tables
    assert!(a.contains(r#"__zenith_expr = ["x"]"#));
    assert!(b.contains(r#"__zenith_expr = ["x"]"#));

    // Both must produce identical attribute transformation
    assert!(a.contains(r#"data-zx-id="0""#));
    assert!(b.contains(r#"data-zx-id="0""#));
}

// --- Attribute Order Preservation ---

#[test]
fn attributes_emitted_in_source_order() {
    let output = compile(r#"<div id="a" class="b" role="c" />"#);

    // Find positions — must be in source order
    let id_pos = output.find(r#"id="a""#).expect("id not found");
    let class_pos = output.find(r#"class="b""#).expect("class not found");
    let role_pos = output.find(r#"role="c""#).expect("role not found");

    assert!(id_pos < class_pos, "id must come before class");
    assert!(class_pos < role_pos, "class must come before role");
}

#[test]
fn expression_attributes_preserve_source_order() {
    let output = compile(r#"<div alpha={a} beta={b} gamma={c} />"#);

    let alpha_pos = output
        .find(r#"data-zx-alpha="0""#)
        .expect("alpha not found");
    let beta_pos = output.find(r#"data-zx-beta="1""#).expect("beta not found");
    let gamma_pos = output
        .find(r#"data-zx-gamma="2""#)
        .expect("gamma not found");

    assert!(alpha_pos < beta_pos);
    assert!(beta_pos < gamma_pos);
}

#[test]
fn mixed_static_and_expression_attributes_preserve_order() {
    let output = compile(r#"<div id="s" dynamic={d} class="c" />"#);

    let id_pos = output.find(r#"id="s""#).expect("id not found");
    let dyn_pos = output
        .find(r#"data-zx-dynamic="0""#)
        .expect("dynamic not found");
    let class_pos = output.find(r#"class="c""#).expect("class not found");

    assert!(id_pos < dyn_pos, "static id must come before dynamic");
    assert!(dyn_pos < class_pos, "dynamic must come before static class");
}

// --- Child Order Preservation ---

#[test]
fn children_emitted_depth_first_left_to_right() {
    let output = compile(r#"<div><a></a><b></b><c></c></div>"#);

    let a_pos = output.find("<a>").expect("a not found");
    let b_pos = output.find("<b>").expect("b not found");
    let c_pos = output.find("<c>").expect("c not found");

    assert!(a_pos < b_pos);
    assert!(b_pos < c_pos);
}

#[test]
fn text_children_preserve_exact_content() {
    let output = compile("<p>Hello World</p>");
    assert!(output.contains("Hello World"));
}
