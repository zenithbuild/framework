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

fn route_input(
    graph_hash: &str,
    html: &str,
    image_materialization: serde_json::Value,
) -> serde_json::Value {
    json!({
        "route": "/",
        "file": "pages/index.zen",
        "router": true,
        "image_materialization": image_materialization,
        "ir": {
            "ir_version": 1,
            "graph_hash": graph_hash,
            "graph_edges": [],
            "graph_nodes": [{ "id": "src/pages/index.zen", "hoist_id": "mod_home" }],
            "html": html,
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
    })
}

fn image_runtime_payload() -> serde_json::Value {
    json!({
        "mode": "passthrough",
        "basePath": "/docs",
        "config": {
            "formats": ["webp"],
            "quality": 75,
            "deviceSizes": [1],
            "imageSizes": [1],
            "remotePatterns": [],
            "allowSvg": false,
            "maxRemoteBytes": 10485760,
            "maxPixels": 40000000,
            "minimumCacheTTL": 60,
            "dangerouslyAllowLocalNetwork": false
        },
        "localImages": {
            "/hero.png": {
                "width": 1,
                "height": 1,
                "originalFormat": "png",
                "availableWidths": [1],
                "availableFormats": ["png", "webp"]
            }
        }
    })
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

    let payload = json!([route_input(
        &graph_hash,
        "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
        json!([expected_entry])
    )]);

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

#[test]
fn bundler_materializes_final_build_html_from_structured_image_artifacts() {
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
    let payload = json!({
        "inputs": [route_input(
            &graph_hash,
            "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main><span class=\"contents\" data-zx-data-zenith-image=\"0\" data-zx-unsafeHTML=\"1\"></span></main></body></html>",
            json!([expected_entry])
        )],
        "image_runtime_payload": image_runtime_payload()
    });

    let output = run_bundler(payload, &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let html = fs::read_to_string(out_dir.join("index.html")).expect("read emitted html");
    assert!(html.contains("data-zenith-image="));
    assert!(html.contains("<picture>"));
    assert!(html.contains("alt=\"Hero\""));
    assert!(html.contains("/docs/_zenith/image/local/"));
}

#[test]
fn bundler_fails_when_final_build_html_keeps_unresolved_image_markers() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["mod_home"], &[]);
    let payload = json!({
        "inputs": [route_input(
            &graph_hash,
            "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main><span class=\"contents\" data-zx-data-zenith-image=\"0\" data-zx-unsafeHTML=\"1\"></span></main></body></html>",
            json!([])
        )],
        "image_runtime_payload": image_runtime_payload()
    });

    let output = run_bundler(payload, &out_dir);
    assert!(!output.status.success(), "bundler unexpectedly succeeded");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains(
        "Unresolved Image markers require a compiler-owned image materialization artifact"
    ));
}
