use zenith_compiler::compiler::compile_structured_with_source;

fn state_keys(output: &zenith_compiler::compiler::CompilerOutput) -> Vec<String> {
    output
        .hoisted
        .state
        .iter()
        .map(|entry| entry.key.clone())
        .collect::<Vec<_>>()
}

fn hoisted_code(output: &zenith_compiler::compiler::CompilerOutput) -> String {
    output.hoisted.code.join("\n")
}

#[test]
fn effect_cleanup_locals_remain_closure_scoped() {
    let input = r#"
<script lang="ts">
const ready = signal(false);

zenEffect(() => {
  if (!ready.get()) return;
  const frameId = requestAnimationFrame(() => {});
  return () => cancelAnimationFrame(frameId);
});
</script>
<main>{ready.get() ? "ready" : "idle"}</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/frame-id-scope.zen")
        .expect("component should compile");
    let keys = state_keys(&output);
    let joined = keys.join(",");

    assert!(
        joined.contains("ready"),
        "expected top-level ready binding in state table, got: {joined}"
    );
    assert!(
        !joined.contains("frameId"),
        "function-local frameId leaked into state table: {joined}"
    );
}

#[test]
fn helper_function_locals_are_not_promoted_to_module_bindings() {
    let input = r#"
<script lang="ts">
function runtimeGlobals() {
  return globalThis;
}

function resolvePreferredTheme() {
  const runtimePreferred = runtimeGlobals();
  const saved = runtimePreferred.localStorage?.getItem("zenith-theme");
  if (saved === "dark") return "dark";
  return "light";
}

const mode = resolvePreferredTheme();
</script>
<main>{mode}</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/runtime-preferred-scope.zen")
        .expect("component should compile");
    let keys = state_keys(&output);
    let joined = keys.join(",");

    assert!(
        joined.contains("mode"),
        "expected top-level mode binding in state table, got: {joined}"
    );
    assert!(
        !joined.contains("runtimePreferred"),
        "function-local runtimePreferred leaked into state table: {joined}"
    );
    assert!(
        !joined.contains("saved"),
        "function-local saved leaked into state table: {joined}"
    );
}

#[test]
fn duplicate_function_local_names_do_not_trigger_script_collision() {
    let input = r#"
<script lang="ts">
function first(value: string) {
  const parsed = value.trim();
  return parsed;
}

function second(value: string) {
  const parsed = value.toUpperCase();
  return parsed;
}

const result = first("a") + second("b");
</script>
<main>{result}</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/local-duplicate-names.zen")
        .expect("function-local duplicate names should not collide");
    let keys = state_keys(&output);
    let joined = keys.join(",");

    assert!(
        joined.contains("result"),
        "expected top-level result binding in state table, got: {joined}"
    );
    assert!(
        !joined.contains("parsed"),
        "function-local parsed leaked into state table: {joined}"
    );
}

#[test]
fn zeneffect_reads_state_through_get_calls() {
    let input = r#"
<script lang="ts">
state isOpen = false;

zenEffect(() => {
  if (isOpen) {
    return;
  }
});
</script>
<main>{isOpen ? "close" : "menu"}</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/zeneffect-state-read.zen")
        .expect("component should compile");
    let hoisted = hoisted_code(&output);

    assert!(
        hoisted.contains("if (___tmp_zeneffect_state_read_zen_script0_"),
        "expected lowered script symbol in hoisted code: {hoisted}"
    );
    assert!(
        hoisted.contains("_isOpen.get())"),
        "expected zenEffect state read to lower to .get(): {hoisted}"
    );
}

#[test]
fn zeneffect_assignments_lower_to_signal_sets() {
    let input = r#"
<script lang="ts">
state isAnimating = false;

zenEffect(() => {
  isAnimating = true;
});
</script>
<main>{isAnimating ? "busy" : "idle"}</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/zeneffect-state-write.zen")
        .expect("component should compile");
    let hoisted = hoisted_code(&output);

    assert!(
        hoisted.contains("_isAnimating.set(true);"),
        "expected zenEffect assignment to lower to .set(true): {hoisted}"
    );
}
