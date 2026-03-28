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

fn first_binding(output: &CompilerOutput) -> &zenith_compiler::compiler::ExpressionBindingPayload {
    output
        .expression_bindings
        .first()
        .expect("expected first expression binding")
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
fn shadowed_callback_params_remain_lexically_local() {
    let input = r#"
<script lang="ts">
state count = 1;
const items = [1, 2, 3];
</script>
<main>{items.map((count) => count + 1).join(",")}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let expr = output.expressions.first().cloned().unwrap_or_default();
    let binding = first_binding(&output);
    let compiled = binding
        .compiled_expr
        .as_deref()
        .expect("expected compiled runtime expression");

    assert!(
        expr.contains(".map((count) => count + 1)"),
        "shadowed callback params must survive transform-time rewriting, got: {}",
        expr
    );
    assert!(
        compiled.contains(".map((count) => count + 1)"),
        "compiled runtime expression must preserve shadowed callback params, got: {}",
        compiled
    );
    assert!(
        binding.signal_indices.is_empty(),
        "shadowed callback params must not subscribe to outer signal state: {:?}",
        binding
    );
}

#[test]
fn nested_lambdas_preserve_outer_param_scope_while_rewriting_true_free_identifiers() {
    let input = r#"
<script lang="ts">
state total = 3;
const items = [1, 2, 3];
</script>
<main>{items.map((item) => () => item + total)}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let binding = first_binding(&output);
    let compiled = binding
        .compiled_expr
        .as_deref()
        .expect("expected compiled runtime expression");
    let signal_index = binding
        .signal_index
        .expect("expected a single signal dependency for total");

    assert!(
        compiled.contains(&format!("() => item + signalMap.get({signal_index}).get()")),
        "nested lambdas must keep item local while rewriting total as a free identifier, got: {}",
        compiled
    );
    assert!(
        !compiled.contains("() => signalMap.get("),
        "nested lambda params must not collapse into signal reads, got: {}",
        compiled
    );
}

#[test]
fn destructuring_locals_do_not_rewrite_into_signal_reads() {
    let input = r#"
<script lang="ts">
state total = 5;
const items = [{ count: 1 }, { count: 2 }];
</script>
<main>{items.map(({ count }) => count + total)}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let binding = first_binding(&output);
    let compiled = binding
        .compiled_expr
        .as_deref()
        .expect("expected compiled runtime expression");
    let signal_index = binding
        .signal_index
        .expect("expected a single signal dependency for total");

    assert!(
        compiled.contains(&format!(
            "({{ count }}) => count + signalMap.get({signal_index}).get()"
        )),
        "destructuring locals must remain local while free total rewrites structurally, got: {}",
        compiled
    );
    assert!(
        !compiled.contains("({ signalMap.get"),
        "destructuring locals must not be rewritten as signal reads, got: {}",
        compiled
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
fn direct_state_bindings_keep_compiler_owned_literal_payloads() {
    let input = r#"
<script lang="ts">
state currentTheme = "light";
</script>
<main>{currentTheme}</main>
"#;

    let output = compile_with_options(input, false).expect("compile should succeed");
    let binding = output
        .expression_bindings
        .first()
        .expect("expected first expression binding");

    assert_eq!(
        binding.literal.as_deref(),
        Some("currentTheme"),
        "direct state bindings must keep literal payloads for exact downstream lookup: {:?}",
        binding
    );
    assert!(
        binding.state_index.is_some(),
        "direct state bindings must still resolve state ownership: {:?}",
        binding
    );
    assert_eq!(
        binding.compiled_expr, None,
        "direct state bindings must not synthesize compiled_expr when a direct binding is sufficient: {:?}",
        binding
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
fn scoped_expression_rewrites_are_deterministic_across_repeated_compiles() {
    let input = r#"
<script lang="ts">
state total = 3;
const items = [1, 2, 3];
</script>
<main>{items.map((item) => () => item + total)}</main>
"#;

    let first = compile_with_options(input, false).expect("first compile should succeed");
    let second = compile_with_options(input, false).expect("second compile should succeed");

    assert_eq!(first.expressions, second.expressions);
    assert_eq!(first.expression_bindings, second.expression_bindings);
}

#[test]
fn compiled_embedded_markup_uses_ctx_fragment_in_runtime_expression_scope() {
    let input = r#"
<main>{cond ? (<a>Hi</a>) : "__zenith_fragment literal"}</main>
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
        compiled.contains("__ctx.fragment`"),
        "embedded markup runtime expressions must target __ctx.fragment tagged templates, got: {}",
        compiled
    );
    assert!(
        !compiled.contains("__zenith_fragment`"),
        "compiled runtime expressions must not depend on __zenith_fragment scope aliases, got: {}",
        compiled
    );
    assert!(
        compiled.contains("\"__zenith_fragment literal\""),
        "string literal content must survive fragment helper lowering untouched, got: {}",
        compiled
    );
}
