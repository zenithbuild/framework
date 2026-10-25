//! Compiler-owned component script module_id must satisfy bundler validation.
//! Empty and omitted module_id stay rejected.

use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use zenith_compiler::deterministic::sha256_hex;
use zenith_compiler::script::component_script_module_id;

fn bundler_bin() -> String {
    if let Ok(path) = env::var("CARGO_BIN_EXE_zenith-bundler") {
        return path;
    }
    let current = env::current_exe().expect("resolve current test binary");
    let debug_dir = current
        .parent()
        .and_then(|p| p.parent())
        .expect("resolve target/debug directory");
    let candidate = debug_dir.join("zenith-bundler");
    if candidate.exists() {
        return candidate.to_string_lossy().to_string();
    }
    panic!(
        "Could not locate zenith-bundler binary. Checked CARGO_BIN_EXE_zenith-bundler and {}",
        candidate.display()
    );
}

fn compute_graph_hash(hoist_ids: &[&str]) -> String {
    let mut ids = hoist_ids
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    let mut seed = String::new();
    for id in ids {
        seed.push_str("id:");
        seed.push_str(&id);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

fn payload(module_id: Option<&str>) -> Value {
    let graph_hash = compute_graph_hash(&["root_hoist"]);
    let mut script = json!({
        "hoist_id": "comp_hoist",
        "factory": "createComponent_comp_hoist",
        "imports": [],
        "deps": [],
        "code": "export function createComponent_comp_hoist(host, props, runtime) {\n  return { mount(){ void host; void props; void runtime; }, update(){}, destroy(){}, bindings: Object.freeze({}) };\n}\n"
    });
    if let Some(module_id) = module_id {
        script
            .as_object_mut()
            .expect("script object")
            .insert("module_id".to_string(), json!(module_id));
    }
    json!([{
        "route": "/",
        "file": "src/pages/index.zen",
        "router": false,
        "ir": {
            "ir_version": 1,
            "graph_hash": graph_hash,
            "graph_edges": [],
            "graph_nodes": [{ "id": "src/pages/index.zen", "hoist_id": "root_hoist" }],
            "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
            "expressions": [],
            "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
            "components_scripts": { "comp_hoist": script },
            "component_instances": [],
            "imports": [],
            "modules": [],
            "signals": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "style_blocks": []
        }
    }])
}

fn run_bundler(payload: &Value, out_dir: &Path) -> std::process::Output {
    let mut child = Command::new(bundler_bin())
        .arg("--out-dir")
        .arg(out_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn bundler");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(payload.to_string().as_bytes())
        .expect("write payload");
    child.wait_with_output().expect("wait bundler")
}

#[test]
fn nonempty_component_script_with_compiler_module_id_bundles() {
    let module_id = component_script_module_id("src/components/Card.zen", 0);
    assert_eq!(module_id, "src/components/Card.zen:script0");

    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let output = run_bundler(&payload(Some(&module_id)), &out_dir);
    assert!(
        output.status.success(),
        "bundler rejected a compiler-owned module_id: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let assets = fs::read_dir(out_dir.join("assets")).expect("assets dir");
    let found = assets.filter_map(|entry| entry.ok()).any(|entry| {
        entry
            .file_name()
            .to_str()
            .map(|name| name.starts_with("component.") && name.ends_with(".js"))
            .unwrap_or(false)
    });
    assert!(found, "component asset was not emitted");
}

#[test]
fn empty_component_script_module_id_is_rejected() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let output = run_bundler(&payload(Some("  ")), &tmp.path().join("dist"));
    assert!(
        !output.status.success(),
        "empty module_id must fail validation"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("module_id must be non-empty"),
        "missing empty-module_id diagnostic:\n{stderr}"
    );
}

#[test]
fn omitted_component_script_module_id_is_rejected() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let output = run_bundler(&payload(None), &tmp.path().join("dist"));
    assert!(
        !output.status.success(),
        "omitted module_id must fail validation"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("module_id must be non-empty"),
        "missing omitted-module_id diagnostic:\n{stderr}"
    );
}
