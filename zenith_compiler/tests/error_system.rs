use std::panic;
use zenith_compiler::compiler::compile;

// ============================================================
// PHASE 10: COMPILE-TIME ERROR SYSTEM
// Errors are compiler responsibilities.
// Invalid input must fail at compile time.
// No runtime warnings. No silent recovery.
// ============================================================

fn must_panic(input: &str) -> String {
    let result = panic::catch_unwind(|| compile(input));
    match result {
        Err(payload) => {
            if let Some(s) = payload.downcast_ref::<String>() {
                s.clone()
            } else if let Some(s) = payload.downcast_ref::<&str>() {
                s.to_string()
            } else {
                "panicked".to_string()
            }
        }
        Ok(output) => {
            panic!(
                "Expected compile error for input `{}`, but got output:\n{}",
                input, output
            );
        }
    }
}

#[test]
fn error_on_unclosed_tag() {
    let msg = must_panic("<div>");
    assert!(
        msg.contains("EOF") || msg.contains("error") || msg.contains("Unexpected"),
        "Error message: {}",
        msg
    );
}

#[test]
fn error_on_mismatched_closing_tag() {
    let msg = must_panic("<div></span>");
    assert!(
        msg.contains("Mismatched") || msg.contains("expected") || msg.contains("error"),
        "Error message: {}",
        msg
    );
}

#[test]
fn error_on_unclosed_expression() {
    let msg = must_panic("<div>{unclosed</div>");
    assert!(!msg.is_empty(), "Should have produced an error message");
}

#[test]
fn error_on_empty_input() {
    let msg = must_panic("");
    assert!(!msg.is_empty(), "Empty input should produce an error");
}

#[test]
fn error_on_multiple_root_nodes() {
    let msg = must_panic("<div></div><span></span>");
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
    let result = panic::catch_unwind(|| compile("just some text"));
    assert!(result.is_ok(), "Bare text root is valid structure");
}

#[test]
fn error_on_unterminated_string_attribute() {
    let msg = must_panic(r#"<div id="unclosed></div>"#);
    assert!(
        msg.contains("unterminated") || msg.contains("error") || msg.contains("string"),
        "Error message: {}",
        msg
    );
}
