use zenith_compiler::compiler::compile_structured;

/// Helper: compile and assert success.
fn compile_ok(input: &str) -> zenith_compiler::compiler::CompilerOutput {
    compile_structured(input).expect("compile should succeed")
}

/// Helper: compile and assert failure, returning error message.
fn compile_err(input: &str) -> String {
    compile_structured(input).expect_err("compile should fail")
}

// ─── Comparisons ──────────────────────────────────────────────────────

#[test]
fn expression_with_less_than_comparison() {
    let input = r#"<p>{x < 10 ? "small" : "big"}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("<")),
        "expression should preserve < comparison operator"
    );
}

#[test]
fn expression_with_greater_than_comparison() {
    let input = r#"<p>{x > 10 ? "big" : "small"}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains(">")),
        "expression should preserve > comparison operator"
    );
}

// ─── TypeScript generics ──────────────────────────────────────────────

#[test]
fn expression_with_single_letter_generic() {
    // Single letter generics like <T> must NOT be treated as markup tags.
    let input = r#"<p>{fn_call<T>(x)}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("<T>")),
        "expression should preserve generic <T>"
    );
}

// ─── Nested braces ────────────────────────────────────────────────────

#[test]
fn expression_with_nested_braces() {
    let input = r#"<p>{items.map(x => { return x; })}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("return x")),
        "expression should capture content inside nested braces"
    );
}

#[test]
fn expression_with_arrow_function() {
    let input = r#"<p>{() => 42}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("=>")),
        "expression should preserve arrow function"
    );
}

// ─── String safety ────────────────────────────────────────────────────

#[test]
fn expression_with_string_containing_braces() {
    let input = r#"<p>{"hello { world }"}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("hello")),
        "expression should handle strings with braces inside"
    );
}

#[test]
fn expression_with_template_literal() {
    let input = "<p>{`hello ${name}`}</p>";
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("hello")),
        "expression should handle template literals"
    );
}

// ─── Attribute expressions ────────────────────────────────────────────

#[test]
fn attribute_expression_with_ternary() {
    let input = r#"<div class={x === 0 ? "active" : "inactive"}></div>"#;
    let output = compile_ok(input);
    // The expression should be in the output — either in html or expressions list.
    assert!(
        output.html.contains("data-zx"),
        "attribute expression should produce a marker"
    );
}

#[test]
fn attribute_expression_with_complex_value() {
    let input = r#"<div style={base + " " + extra}></div>"#;
    let output = compile_ok(input);
    assert!(
        output.html.contains("data-zx"),
        "complex attribute expression should produce a marker"
    );
}

// ─── Embedded markup (contract gate) ──────────────────────────────────

#[test]
fn embedded_markup_rejected_by_default() {
    let input = r#"<span>{cond ? (<div>yes</div>) : (<div>no</div>)}</span>"#;
    let err = compile_err(input);
    assert!(
        err.contains("Embedded markup expressions are disabled"),
        "embedded markup should be rejected by default, got: {}",
        err
    );
}

#[test]
fn embedded_markup_allowed_when_flag_enabled() {
    // Use compile_structured_with_source which goes through the full pipeline.
    // The parser flag is currently not threaded through the public API,
    // so we test it directly via the parser.
    use zenith_compiler::parser::Parser;

    let input = r#"<span>{cond ? (<div>yes</div>) : (<div>no</div>)}</span>"#;
    let mut parser = Parser::new_with_options(input, true);
    // Should not panic.
    let _ast = parser.parse();
}

// ─── Event handler expressions ────────────────────────────────────────

#[test]
fn event_handler_with_arrow_function() {
    let input = r#"<button on:click={() => count.set(count.get() + 1)}>+</button>"#;
    let output = compile_ok(input);
    assert!(
        output.html.contains("data-zx-on-click"),
        "event handler with arrow function should produce event marker"
    );
}

// ─── Edge cases ───────────────────────────────────────────────────────

#[test]
fn empty_expression() {
    // Empty expressions should still parse (treated as empty string).
    let input = r#"<p>{}</p>"#;
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.is_empty()),
        "empty expression should be captured"
    );
}

#[test]
fn expression_with_comment() {
    let input = "<p>{/* comment */ value}</p>";
    let output = compile_ok(input);
    assert!(
        output.expressions.iter().any(|e| e.contains("value")),
        "expression with comment should preserve value"
    );
}
