//! Regression: bundler must accept compiler JSON with schemaVersion and warnings.
//! Prevents "unknown field schemaVersion" when compiler emits LSP-related fields.

use std::env;
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::json;
use zenith_compiler::deterministic::sha256_hex;

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

fn compute_graph_hash(hoist_ids: &[&str], edges: &[&str]) -> String {
    let mut ids = hoist_ids
        .iter()
        .map(|v| (*v).to_string())
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    let mut sorted_edges = edges.iter().map(|v| (*v).to_string()).collect::<Vec<_>>();
    sorted_edges.sort();
    sorted_edges.dedup();
    let mut seed = String::new();
    for id in ids {
        seed.push_str("id:");
        seed.push_str(&id);
        seed.push('\n');
    }
    for edge in sorted_edges {
        seed.push_str("edge:");
        seed.push_str(&edge);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

#[test]
fn bundler_parses_compiler_json_with_schema_version_and_warnings() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    fs::create_dir_all(&out_dir).expect("create out dir");

    let graph_hash = compute_graph_hash(&["mod_home"], &[]);

    let payload = json!([
        {
            "route": "/",
            "file": "/tmp/pages/index.zen",
            "router": false,
            "ir": {
                "schemaVersion": 1,
                "warnings": [
                    {
                        "code": "ZEN-DOM-QUERY",
                        "message": "Use ref<T>() + zenMount instead",
                        "severity": "warning",
                        "range": { "start": { "line": 1, "column": 0 }, "end": { "line": 1, "column": 10 } }
                    }
                ],
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_edges": [],
                "graph_nodes": [{ "id": "src/pages/index.zen", "hoist_id": "mod_home" }],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let mut child = Command::new(bundler_bin())
        .arg("--out-dir")
        .arg(&out_dir)
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

    let output = child.wait_with_output().expect("wait bundler");

    assert!(
        output.status.success(),
        "bundler must accept compiler JSON with schemaVersion and warnings; stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
