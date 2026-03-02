use zenith_compiler::compiler::compile as compile_zen;

// ============================================================
// PHASE 10: COMPILE-TIME ERROR SYSTEM
// Errors are compiler responsibilities.
// Invalid input must fail at compile time.
// No runtime warnings. No silent recovery.
// ============================================================

fn must_fail(input: &str) -> String {
    compile_zen(input).expect_err(&format!(
        "Expected compile error for input `{}`",
        input
    ))
}

#[test]
fn error_on_unclosed_tag() {
    let msg = must_fail("<div>");
    assert!(
        msg.contains("EOF") || msg.contains("error") || msg.contains("Unexpected"),
        "Error message: {}",
        msg
    );
}

#[test]
fn error_on_mismatched_closing_tag() {
    let msg = must_fail("<div></span>");
    assert!(
        msg.contains("Mismatched") || msg.contains("expected") || msg.contains("error"),
        "Error message: {}",
        msg
    );
}

#[test]
fn error_on_unclosed_expression() {
    let msg = must_fail("<div>{unclosed</div>");
    assert!(!msg.is_empty(), "Should have produced an error message");
}

#[test]
fn error_on_empty_input() {
    let msg = must_fail("");
    assert!(!msg.is_empty(), "Empty input should produce an error");
}

#[test]
fn error_on_multiple_root_nodes() {
    let msg = must_fail("<div></div><span></span>");
    assert!(
        msg.contains("Multiple root") || msg.contains("trailing") || msg.contains("error"),
        "Error message: {}",
        msg
    );
}

#[test]
fn bare_text_root_is_valid_structure() {
    // Per Zero Semantic Awareness: the compiler doesn't mandate element roots.
    // Bare text is valid Node::Text. Compiler emits structure, not semantics.
    let result = compile_zen("just some text");
    assert!(result.is_ok(), "Bare text root is valid structure");
}

#[test]
fn error_on_unterminated_string_attribute() {
    let msg = must_fail(r#"<div id="unclosed></div>"#);
    assert!(
        msg.contains("unterminated") || msg.contains("error") || msg.contains("string"),
        "Error message: {}",
        msg
    );
}
