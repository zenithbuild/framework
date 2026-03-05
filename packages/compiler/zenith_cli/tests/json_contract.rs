use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn compiler_bin() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_zenith-compiler") {
        return PathBuf::from(path);
    }

    let mut path = std::env::current_exe().expect("current test executable path");
    path.pop();
    if path.ends_with("deps") {
        path.pop();
    }
    path.push(if cfg!(windows) {
        "zenith-compiler.exe"
    } else {
        "zenith-compiler"
    });
    path
}

fn compile_fixture(source: &str, file_name: &str) -> serde_json::Value {
    let tmp_dir = std::env::temp_dir().join(format!(
        "zenith-compiler-json-contract-{}",
        std::process::id()
    ));
    fs::create_dir_all(&tmp_dir).expect("create temp dir");
    let file_path = tmp_dir.join(file_name);
    fs::write(&file_path, source).expect("write source");

    let output = Command::new(compiler_bin())
        .arg(&file_path)
        .output()
        .expect("run compiler");

    assert!(
        output.status.success(),
        "compiler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("parse compiler json")
}

#[test]
fn compiler_cli_emits_schema_version_warnings_and_compiled_expr() {
    let json = compile_fixture(
        r#"<script lang="ts">
state isOpen = false;
</script>
<button>{isOpen ? "close" : "menu"}</button>"#,
        "index.zen",
    );
    assert_eq!(json["schemaVersion"], 1);
    assert_eq!(json["warnings"], serde_json::json!([]));

    let bindings = json["expression_bindings"]
        .as_array()
        .expect("expression_bindings array");
    let compiled = bindings
        .iter()
        .find(|binding| binding["compiled_expr"].is_string())
        .expect("compiled_expr binding");
    assert_eq!(compiled["signal_indices"], serde_json::json!([0]));
}

#[test]
fn compiler_cli_emits_non_empty_ref_bindings_when_refs_exist() {
    let json = compile_fixture(
        r#"<script lang="ts">
const shell = ref<HTMLDivElement>();
</script>
<div ref={shell}></div>"#,
        "with-ref.zen",
    );

    assert_eq!(json["schemaVersion"], 1);
    assert_eq!(json["warnings"], serde_json::json!([]));

    let refs = json["ref_bindings"].as_array().expect("ref_bindings array");
    assert!(!refs.is_empty(), "expected non-empty ref_bindings: {json}");
    assert_eq!(refs[0]["identifier"], "shell");
    assert_eq!(refs[0]["selector"], r#"[data-zx-r="0"]"#);
}

#[test]
fn compiler_cli_emits_empty_ref_bindings_when_no_refs_exist() {
    let json = compile_fixture("<main>Hello</main>", "no-ref.zen");

    assert_eq!(json["schemaVersion"], 1);
    assert_eq!(json["warnings"], serde_json::json!([]));
    assert_eq!(json["ref_bindings"], serde_json::json!([]));
}

#[test]
fn compiler_cli_emits_source_spans_for_marker_and_event_bindings() {
    let json = compile_fixture(
        r#"<script lang="ts">
state count = signal(0);
function increment() { count.set(count.get() + 1); }
</script>
<button on:click={increment}>{count.get()}</button>"#,
        "source-spans.zen",
    );

    let markers = json["marker_bindings"].as_array().expect("marker_bindings array");
    assert!(!markers.is_empty(), "expected marker bindings");
    let marker_source = &markers[0]["source"];
    assert_eq!(marker_source["file"].as_str().unwrap().ends_with("source-spans.zen"), true);
    assert!(marker_source["start"]["line"].as_u64().unwrap() >= 1);
    assert!(marker_source["start"]["column"].as_u64().unwrap() >= 1);

    let events = json["event_bindings"].as_array().expect("event_bindings array");
    assert_eq!(events.len(), 1);
    let event_source = &events[0]["source"];
    assert_eq!(event_source["file"].as_str().unwrap().ends_with("source-spans.zen"), true);
    assert!(event_source["start"]["line"].as_u64().unwrap() >= 1);
    assert!(event_source["end"]["column"].as_u64().unwrap() >= 1);

    let exprs = json["expression_bindings"]
        .as_array()
        .expect("expression_bindings array");
    assert!(!exprs.is_empty(), "expected expression bindings");
    assert!(exprs.iter().all(|entry| entry["source"]["file"].is_string()));
}
