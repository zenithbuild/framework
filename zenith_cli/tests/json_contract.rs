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

#[test]
fn compiler_cli_emits_schema_version_warnings_and_compiled_expr() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "zenith-compiler-json-contract-{}",
        std::process::id()
    ));
    fs::create_dir_all(&tmp_dir).expect("create temp dir");
    let file_path = tmp_dir.join("index.zen");
    fs::write(
        &file_path,
        r#"<script lang="ts">
state isOpen = false;
</script>
<button>{isOpen ? "close" : "menu"}</button>"#,
    )
    .expect("write source");

    let output = Command::new(compiler_bin())
        .arg(&file_path)
        .output()
        .expect("run compiler");

    assert!(
        output.status.success(),
        "compiler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse compiler json");
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
