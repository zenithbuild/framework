use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
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

fn run_bundler(payload: serde_json::Value, out_dir: &Path) -> std::process::Output {
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
fn router_manifest_preserves_image_materialization_from_bundler_input() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["mod_home"], &[]);

    let expected_entry = json!({
        "selector": "[data-zx-data-zenith-image=\"0\"]",
        "props": {
            "src": "/hero.png",
            "alt": "Hero",
            "sizes": "100vw"
        }
    });

    let payload = json!([{
        "route": "/",
        "file": "pages/index.zen",
        "router": true,
        "image_materialization": [expected_entry],
        "ir": {
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
    }]);

    let output = run_bundler(payload, &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let router_manifest_path = out_dir.join("assets/router-manifest.json");
    let raw = fs::read_to_string(&router_manifest_path).expect("read router-manifest.json");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("parse router manifest");
    let routes = parsed["routes"]
        .as_array()
        .expect("routes must be an array");
    assert_eq!(routes.len(), 1, "expected one route");
    let route = &routes[0];
    assert_eq!(route["path"], "/");
    assert_eq!(
        route["image_materialization"],
        json!([expected_entry]),
        "image_materialization must round-trip from bundler stdin to router-manifest.json"
    );
}
