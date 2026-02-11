use zenith_compiler::compiler::compile;

// ============================================================
// 6.2 DETERMINISTIC INDEX LOCK
// Expression indexing must ALWAYS be:
//   - Left-to-right
//   - Depth-first
//   - Stable across builds
// No index shift from internal refactors.
// ============================================================

#[test]
fn nested_expressions_indexed_depth_first() {
    let input = r#"<div><span>{a}</span><span>{b}</span></div>"#;
    let output = compile(input);

    // a encountered first (depth-first into first span), b second
    assert!(output.contains(r#"__zenith_expr = ["a", "b"]"#));
}

#[test]
fn sibling_expressions_indexed_left_to_right() {
    let input = r#"<div>{x}{y}{z}</div>"#;
    let output = compile(input);

    assert!(output.contains(r#"__zenith_expr = ["x", "y", "z"]"#));
    // Parent div should have all three indices
    assert!(output.contains(r#"data-zx-e="0 1 2""#));
}

#[test]
fn mixed_attribute_and_child_expressions() {
    // Attributes are processed BEFORE children (left-to-right within element)
    let input = r#"<Card title={a}>{b}</Card>"#;
    let output = compile(input);

    // a is attribute expression → index 0
    // b is child expression → index 1
    assert!(output.contains(r#"__zenith_expr = ["a", "b"]"#));
    assert!(output.contains(r#"data-zx-title="0""#));
    assert!(output.contains(r#"data-zx-e="1""#));
}

#[test]
fn complex_interleaving_deep_nesting() {
    let input = r#"<div id={a}><p class={b}>{c}<span>{d}</span></p><footer>{e}</footer></div>"#;
    let output = compile(input);

    // Order: a(attr on div), b(attr on p), c(child of p), d(child of span inside p), e(child of footer)
    assert!(output.contains(r#"__zenith_expr = ["a", "b", "c", "d", "e"]"#));
    assert!(output.contains(r#"data-zx-id="0""#)); // a
    assert!(output.contains(r#"data-zx-class="1""#)); // b
}

#[test]
fn multiple_events_indexed_in_source_order() {
    let input = r#"<div on:click={handler1} on:hover={handler2} />"#;
    let output = compile(input);

    assert!(output.contains(r#"__zenith_expr = ["handler1", "handler2"]"#));
    assert!(output.contains(r#"data-zx-on-click="0""#));
    assert!(output.contains(r#"data-zx-on-hover="1""#));
}

#[test]
fn index_stability_across_repeated_compilations() {
    let input = r#"<div>{a}<span>{b}</span>{c}</div>"#;

    // Compile 3 times — output must be identical every time
    let out1 = compile(input);
    let out2 = compile(input);
    let out3 = compile(input);

    assert_eq!(out1, out2, "Output must be stable across compilations");
    assert_eq!(out2, out3, "Output must be stable across compilations");
}
