use zenith_compiler::compiler::{
    compile_structured_with_source_options_and_warnings, CompileOptions,
};

#[test]
fn zen_dom_query_for_query_selector() {
    let input = r#"
<script lang="ts">
const el = document.querySelector('.foo')
</script>
<div>Hello</div>
"#;
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        input,
        "/tmp/Page.zen",
        CompileOptions::default(),
    )
    .expect("compile");
    assert!(
        warnings.iter().any(|w| w.code == "ZEN-DOM-QUERY"),
        "expected ZEN-DOM-QUERY: {:?}",
        warnings
    );
}

#[test]
fn zen_dom_query_for_get_element_by_id() {
    let input = r#"
<script lang="ts">
const el = document.getElementById('x')
</script>
<div>Hello</div>
"#;
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        input,
        "/tmp/Page.zen",
        CompileOptions::default(),
    )
    .expect("compile");
    assert!(
        warnings.iter().any(|w| w.code == "ZEN-DOM-QUERY"),
        "expected ZEN-DOM-QUERY: {:?}",
        warnings
    );
}

#[test]
fn zen_dom_listener_for_add_event_listener() {
    let input = r#"
<script lang="ts">
window.addEventListener('resize', () => {})
</script>
<div>Hello</div>
"#;
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        input,
        "/tmp/Page.zen",
        CompileOptions::default(),
    )
    .expect("compile");
    assert!(
        warnings.iter().any(|w| w.code == "ZEN-DOM-LISTENER"),
        "expected ZEN-DOM-LISTENER: {:?}",
        warnings
    );
}

#[test]
fn zen_dom_wrapper_for_typeof_window_undefined() {
    let input = r#"
<script lang="ts">
const win = typeof window === 'undefined' ? null : window
</script>
<div>Hello</div>
"#;
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        input,
        "/tmp/Page.zen",
        CompileOptions::default(),
    )
    .expect("compile");
    assert!(
        warnings.iter().any(|w| w.code == "ZEN-DOM-WRAPPER"),
        "expected ZEN-DOM-WRAPPER: {:?}",
        warnings
    );
}

#[test]
fn zen_allow_dom_query_suppresses_query_warning() {
    let input = r#"
<script lang="ts">
// zen-allow:dom-query interop with legacy lib
const el = document.querySelector('.legacy')
</script>
<div>Hello</div>
"#;
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        input,
        "/tmp/Page.zen",
        CompileOptions::default(),
    )
    .expect("compile");
    let query_warnings: Vec<_> = warnings.iter().filter(|w| w.code == "ZEN-DOM-QUERY").collect();
    assert!(
        query_warnings.is_empty(),
        "zen-allow:dom-query should suppress ZEN-DOM-QUERY: {:?}",
        warnings
    );
}
