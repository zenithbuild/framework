use std::fs;
use std::path::PathBuf;

use zenith_compiler::compiler::compile_structured_with_source;

fn fixture_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "zenith-compiler-script-hoisting-{name}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src").join("components")).unwrap();
    fs::create_dir_all(root.join("src").join("pages")).unwrap();
    fs::write(root.join("package.json"), r#"{"name":"script-hoisting"}"#).unwrap();
    root
}

#[test]
fn component_script_is_hoisted_into_structured_ir() {
    let root = fixture_root("component");
    let component = root.join("src/components/Card.zen");
    let page = root.join("src/pages/index.zen");

    fs::write(
        &component,
        r#"<script lang="ts">
const count = signal(0)
function inc() {
  count.set(count.get() + 1)
}
</script>
<button on:click={inc}>{count}</button>"#,
    )
    .unwrap();

    fs::write(
        &page,
        r#"<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main><Card /></main>"#,
    )
    .unwrap();

    let output = compile_structured_with_source(
        &fs::read_to_string(&page).unwrap(),
        &page.to_string_lossy(),
    )
    .expect("component script page should compile");

    assert!(!output.html.contains("<script"));
    assert_eq!(output.expressions.len(), 0);

    assert_eq!(output.component_instances.len(), 0);
    assert_eq!(output.components_scripts.len(), 0);
}

#[test]
fn nested_component_scripts_are_rejected() {
    let input = r#"
<main>
  <div>
    <script lang="ts">
    const count = signal(0)
    </script>
    <p>{count}</p>
  </div>
  <div>
    <script lang="ts">
    const count = signal(0)
    </script>
    <p>{count}</p>
  </div>
</main>
"#;

    let msg = compile_structured_with_source(input, "/tmp/Page.zen")
        .expect_err("nested scripts should return contract error");

    assert!(msg.contains("Zenith requires TypeScript scripts. Add lang=\"ts\"."));
    assert!(msg.contains("nested <script> tags inside markup are not supported"));
    assert!(msg.contains("/tmp/Page.zen#script0"));
}

#[test]
fn forbidden_component_script_tokens_fail_with_precise_message() {
    let input = r#"
<script lang="ts">
document.querySelector('#x')
</script>
<div>Hello</div>
"#;

    let msg = compile_structured_with_source(input, "/tmp/Bad.zen")
        .expect_err("forbidden DOM access should return contract error");

    assert!(msg.contains("Zenith requires TypeScript scripts. Add lang=\"ts\"."));
    assert!(msg.contains("Component scripts cannot create runtime scope boundaries"));
    assert!(msg.contains("/tmp/Bad.zen#script0"));
}
