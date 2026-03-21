use zenith_compiler::compiler::{
    compile_structured_with_source_options, CompileOptions, CompilerOutput,
};

fn compile_with_options(
    input: &str,
    embedded_markup_expressions: bool,
) -> Result<CompilerOutput, String> {
    compile_structured_with_source_options(
        input,
        "/virtual/expression-pipeline.zen",
        CompileOptions {
            embedded_markup_expressions,
            strict_dom_lints: false,
        },
    )
}

#[test]
fn plain_const_member_access_does_not_pick_up_signal_dependencies_from_property_names() {
    let input = r#"
<script lang="ts">
state title = "signal title";
const contractContent = props.content;
</script>
<main>{contractContent.title}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let binding = output
        .expression_bindings
        .first()
        .expect("expected first expression binding");

    assert_eq!(
        binding.signal_index, None,
        "plain const member access must not resolve property names as signals: {:?}",
        binding
    );
    assert!(
        binding.signal_indices.is_empty(),
        "plain const member access must not subscribe to signal-backed property names: {:?}",
        binding
    );
}

#[test]
fn signal_backed_alias_access_still_collects_runtime_signal_rewrites() {
    let input = r#"
<script lang="ts">
state count = 0;
</script>
<main>{count ? "ready" : "idle"}</main>
"#;

    let output = compile_with_options(input, true).expect("compile should succeed");
    let binding = output
        .expression_bindings
        .first()
        .expect("expected first expression binding");
    let signal_index = binding
        .signal_index
        .expect("state-backed alias access must still resolve a signal index");
    let compiled = binding
        .compiled_expr
        .as_deref()
        .expect("expected compiled runtime expression");

    assert_eq!(
        binding.signal_indices,
        vec![signal_index],
        "signal-backed alias access must keep a single runtime subscription: {:?}",
        binding
    );
    assert!(
        compiled.contains(&format!("signalMap.get({signal_index}).get()")),
        "signal-backed alias access must still rewrite through signalMap.get(...).get(), got: {}",
        compiled
    );
}

#[test]
fn non_signal_property_chains_remain_plain_member_access() {
    let input = r#"
<script lang="ts">
state title = "signal title";
const contractContent = props.content;
</script>
<main>{contractContent.meta.title}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let binding = output
        .expression_bindings
        .first()
        .expect("expected first expression binding");
    let literal = binding
        .literal
        .as_deref()
        .expect("expected literal member-chain expression");

    assert_eq!(
        binding.signal_index, None,
        "non-signal property chains must not resolve a signal index: {:?}",
        binding
    );
    assert!(
        binding.signal_indices.is_empty(),
        "non-signal property chains must not subscribe to signal-backed property names: {:?}",
        binding
    );
    assert!(
        literal.ends_with(".meta.title"),
        "non-signal property chains must preserve the property chain tail, got: {:?}",
        binding
    );
    assert!(
        !literal.contains(".meta.__"),
        "non-signal property names must not be renamed into hoisted bindings, got: {:?}",
        binding
    );
}

#[test]
fn compiled_embedded_markup_uses_ctx_fragment_in_runtime_expression_scope() {
    let input = r#"
<main>{cond ? (<a>Hi</a>) : null}</main>
"#;

    let output = compile_with_options(input, true).expect("compile should succeed");
    let binding = output
        .expression_bindings
        .first()
        .expect("expected first expression binding");
    let compiled = binding
        .compiled_expr
        .as_deref()
        .expect("expected compiled runtime expression");

    assert!(
        compiled.contains("__ctx.fragment("),
        "embedded markup runtime expressions must target __ctx.fragment(...), got: {}",
        compiled
    );
    assert!(
        !compiled.contains("__zenith_fragment("),
        "compiled runtime expressions must not depend on __zenith_fragment scope aliases, got: {}",
        compiled
    );
}
