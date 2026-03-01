//! Tests for Zenith state shorthand (`state name = value`) and expression binding
//! to state_index for expressions that reference component state.

use zenith_compiler::compiler::{
    compile_structured_with_source_options, CompileOptions, CompilerOutput,
};

#[test]
fn state_shorthand_emits_to_state_table_and_lowers_to_var() {
    let input = r#"<script lang="ts">
state isOpen = false;
state isAnimating = false;
</script>
<div>{isOpen ? "close" : "menu"}</div>"#;

    let output: CompilerOutput = compile_structured_with_source_options(
        input,
        "test.zen",
        CompileOptions {
            embedded_markup_expressions: true,
            strict_dom_lints: false,
        },
    )
    .expect("should compile");

    assert!(
        !output.hoisted.state.is_empty(),
        "state shorthand must emit to hoisted state table"
    );

    let keys: Vec<&str> = output.hoisted.state.iter().map(|s| s.key.as_str()).collect();
    assert!(
        keys.iter().any(|k: &&str| k.ends_with("_isOpen")),
        "state table must contain isOpen (key ends with _isOpen), got: {:?}",
        keys
    );

    for block in &output.hoisted.code {
        assert!(
            !block.contains("state;"),
            "hoisted code must not contain bare 'state;' token"
        );
        assert!(
            block.contains("var ") && (block.contains("isOpen") || block.contains("isAnimating")),
            "state shorthand must lower to var declaration, got: {}",
            block
        );
        assert!(
            block.contains("signal("),
            "state shorthand must lower to signal() for reactivity, got: {}",
            block
        );
    }
}

#[test]
fn expression_referencing_state_gets_state_index() {
    let input = r#"<script lang="ts">
state isOpen = false;
</script>
<div>{isOpen ? "close" : "menu"}</div>"#;

    let output: CompilerOutput = compile_structured_with_source_options(
        input,
        "test.zen",
        CompileOptions {
            embedded_markup_expressions: true,
            strict_dom_lints: false,
        },
    )
    .expect("should compile");

    let binding = output
        .expression_bindings
        .iter()
        .find(|b| {
            b.literal
                .as_ref()
                .map(|l: &String| l.contains("isOpen"))
                .unwrap_or(false)
        })
        .expect("expression binding for isOpen ternary must exist");

    assert!(
        binding.state_index.is_some(),
        "expression referencing state must have state_index set, got: {:?}",
        binding
    );
    assert!(
        binding.signal_index.is_some(),
        "expression referencing state (now signal) must have signal_index for reactivity, got: {:?}",
        binding
    );
    assert!(
        binding.compiled_expr.is_some(),
        "compound expression must have compiled_expr for codegen, got: {:?}",
        binding
    );
    assert_eq!(
        binding.signal_indices,
        vec![binding.signal_index.expect("single signal index")],
        "compound expression must carry signal_indices for runtime subscriptions, got: {:?}",
        binding
    );
}

#[test]
fn state_assignment_lowers_to_set() {
    let input = r#"<script lang="ts">
state isOpen = false;
function toggleMenu() { isOpen = !isOpen; }
</script>
<div>{isOpen ? "close" : "menu"}</div>"#;

    let output: CompilerOutput = compile_structured_with_source_options(
        input,
        "test.zen",
        CompileOptions {
            embedded_markup_expressions: true,
            strict_dom_lints: false,
        },
    )
    .expect("should compile");

    let code = output.hoisted.code.join("\n");
    assert!(
        code.contains(".set("),
        "state assignment must lower to .set() for reactivity, got: {}",
        code
    );
    assert!(
        code.contains(".get()"),
        "state read in assignment RHS must use .get(), got: {}",
        code
    );
}

#[test]
fn state_reads_in_control_flow_lower_to_get() {
    let input = r#"<script lang="ts">
state isOpen = false;
state isAnimating = false;
function toggleMenu() {
    if (isAnimating) return;
    isOpen = !isOpen;
}
function handleEscape() {
    if (!isOpen || isAnimating) return;
    isOpen = false;
}
</script>
<div>{isOpen ? "close" : "menu"}</div>"#;

    let output: CompilerOutput = compile_structured_with_source_options(
        input,
        "test.zen",
        CompileOptions {
            embedded_markup_expressions: true,
            strict_dom_lints: false,
        },
    )
    .expect("should compile");

    let code = output.hoisted.code.join("\n");
    assert!(
        code.contains("if (__test_zen_script0_"),
        "compiled control flow should be preserved, got: {}",
        code
    );
    assert!(
        code.contains(".get()) return;"),
        "state read in if-condition must lower to .get(), got: {}",
        code
    );
    assert!(
        code.contains(".get() || __"),
        "compound state condition must lower each read to .get(), got: {}",
        code
    );
}
