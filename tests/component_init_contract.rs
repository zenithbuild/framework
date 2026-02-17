use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
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

fn find_component_asset(out_dir: &Path) -> PathBuf {
    let assets_dir = out_dir.join("assets");
    fs::read_dir(&assets_dir)
        .expect("read assets dir")
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("component.") && name.ends_with(".js"))
                .unwrap_or(false)
        })
        .expect("component asset must exist")
}

fn component_payload() -> serde_json::Value {
    let graph_hash = compute_graph_hash(&["root_hoist"], &[]);
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
            "components_scripts": {
                "comp_hoist": {
                    "hoist_id": "comp_hoist",
                    "module_id": "src/components/Hero.zen:script0",
                    "factory": "createComponent_comp_hoist",
                    "imports": [],
                    "deps": [],
                    "code": "export function initComponent_comp_hoist(root, ctx = Object.freeze({})) {\n  void root;\n  void ctx;\n  return function __zenith_component_cleanup() {};\n}\nexport default initComponent_comp_hoist;\nexport function createComponent_comp_hoist(host, props, runtime) {\n  return { mount(){ void host; void props; void runtime; }, update(){}, destroy(){}, bindings: Object.freeze({}) };\n}\n"
                }
            },
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

#[test]
fn component_init_assets_emitted_deterministically() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_a = tmp.path().join("dist-a");
    let out_b = tmp.path().join("dist-b");

    let payload = component_payload();

    let first = run_bundler(payload.clone(), &out_a);
    assert!(
        first.status.success(),
        "bundler failed unexpectedly: {}",
        String::from_utf8_lossy(&first.stderr)
    );

    let second = run_bundler(payload, &out_b);
    assert!(
        second.status.success(),
        "bundler failed unexpectedly on second run: {}",
        String::from_utf8_lossy(&second.stderr)
    );

    let component_a = find_component_asset(&out_a);
    let component_b = find_component_asset(&out_b);

    let file_a = component_a.file_name().and_then(|n| n.to_str()).unwrap();
    let file_b = component_b.file_name().and_then(|n| n.to_str()).unwrap();
    assert_eq!(
        file_a, file_b,
        "component init asset filename must be stable"
    );

    let src_a = fs::read_to_string(component_a).expect("read component asset A");
    let src_b = fs::read_to_string(component_b).expect("read component asset B");
    assert_eq!(src_a, src_b, "component init asset bytes must be stable");
    assert!(
        src_a.contains("export default initComponent_comp_hoist"),
        "component init module must keep default init export:\n{}",
        src_a
    );
}

#[test]
fn component_init_modules_do_not_embed_forbidden_imports() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");

    let output = run_bundler(component_payload(), &out_dir);
    assert!(
        output.status.success(),
        "bundler failed unexpectedly: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let component_asset = find_component_asset(&out_dir);
    let source = fs::read_to_string(component_asset).expect("read component asset");

    assert!(
        !source.contains(".zen"),
        "component init asset leaked .zen import:\n{source}"
    );
    assert!(
        !source.contains("zenith:"),
        "component init asset leaked zenith:* import:\n{source}"
    );
    assert!(
        !source.contains("fetch("),
        "component init asset leaked fetch(:\n{source}"
    );
}
