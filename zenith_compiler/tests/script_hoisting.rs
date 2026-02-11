use zenith_compiler::compiler::compile_structured_with_source;

#[test]
fn component_script_is_hoisted_into_structured_ir() {
    let input = r#"
<Card>
  <script>
  const count = signal(0)
  function inc() {
    count.set(count.get() + 1)
  }
  </script>
  <button on:click={inc}>{count}</button>
</Card>
"#;

    let output = compile_structured_with_source(input, "/tmp/Button.zen");

    assert!(!output.html.contains("<script"));
    assert_eq!(output.expressions.len(), 2);
    assert!(output.expressions[0].contains("c0."));
    assert!(output.expressions[1].contains("c0."));

    assert_eq!(output.component_instances.len(), 1);
    assert_eq!(output.components_scripts.len(), 1);
    let script = output.components_scripts.values().next().unwrap();
    assert!(script.code.contains("export function createComponent_"));
    assert!(script.code.contains("bindings: Object.freeze({"));
}

#[test]
fn duplicate_component_names_are_namespaced_deterministically() {
    let input = r#"
<main>
  <div>
    <script>
    const count = signal(0)
    </script>
    <p>{count}</p>
  </div>
  <div>
    <script>
    const count = signal(0)
    </script>
    <p>{count}</p>
  </div>
</main>
"#;

    let output = compile_structured_with_source(input, "/tmp/Page.zen");

    assert_eq!(output.expressions.len(), 2);
    assert_ne!(output.expressions[0], output.expressions[1]);
    assert_eq!(output.component_instances.len(), 2);
    assert_eq!(output.components_scripts.len(), 1);
}

#[test]
fn forbidden_component_script_tokens_fail_with_precise_message() {
    let input = r#"
<script>
document.querySelector('#x')
</script>
<div>Hello</div>
"#;

    let err = std::panic::catch_unwind(|| {
        compile_structured_with_source(input, "/tmp/Bad.zen");
    })
    .expect_err("forbidden DOM access should panic");

    let msg = if let Some(s) = err.downcast_ref::<String>() {
        s.clone()
    } else if let Some(s) = err.downcast_ref::<&str>() {
        s.to_string()
    } else {
        String::new()
    };

    assert!(msg.contains("Component scripts cannot create runtime scope boundaries"));
}
