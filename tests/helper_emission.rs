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
fn missing_helper_module_hard_fails_with_diagnostic() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["root_hoist"], &[]);

    let payload = json!([{
        "route": "/",
        "file": "pages/index.zen",
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
                    "module_id": "src/components/Widget.zen:script0",
                    "factory": "createComponent_comp_hoist",
                    "imports": ["import { setup } from './helpers/PhilosophyLogic.js';"],
                    "deps": ["src/components/helpers/PhilosophyLogic.js"],
                    "code": "export function createComponent_comp_hoist(){ setup(); return { mount(){}, update(){}, destroy(){}, bindings:Object.freeze({}) }; }"
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
    }]);

    let output = run_bundler(payload, &out_dir);
    assert!(
        !output.status.success(),
        "bundler unexpectedly succeeded for missing helper module"
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Emission failed - unresolved import"),
        "missing unresolved-import diagnostic:\n{stderr}"
    );
    assert!(
        stderr.contains("./helpers/PhilosophyLogic.js"),
        "missing unresolved specifier in diagnostic:\n{stderr}"
    );
}

#[test]
fn transitive_helper_modules_are_emitted() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["root_hoist"], &[]);

    let payload = json!([{
        "route": "/",
        "file": "pages/index.zen",
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
                    "module_id": "src/components/Widget.zen:script0",
                    "factory": "createComponent_comp_hoist",
                    "imports": ["import { one } from './helpers/One.js';"],
                    "deps": ["src/components/helpers/One.js"],
                    "code": "export function createComponent_comp_hoist(){ void one; return { mount(){}, update(){}, destroy(){}, bindings:Object.freeze({}) }; }"
                }
            },
            "component_instances": [],
            "imports": [],
            "modules": [
                {
                    "id": "src/components/helpers/One.js",
                    "source": "import { two } from './Two.js';\nexport function one(){ return two(); }\n",
                    "deps": ["src/components/helpers/Two.js"]
                },
                {
                    "id": "src/components/helpers/Two.js",
                    "source": "export function two(){ return 'ok'; }\n",
                    "deps": []
                }
            ],
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
        "bundler failed unexpectedly: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let helper_one = out_dir.join("assets/modules/src/components/helpers/One.js");
    let helper_two = out_dir.join("assets/modules/src/components/helpers/Two.js");
    assert!(
        helper_one.exists(),
        "missing emitted helper module {}",
        helper_one.display()
    );
    assert!(
        helper_two.exists(),
        "missing emitted transitive helper module {}",
        helper_two.display()
    );

    let assets_dir = out_dir.join("assets");
    let component_asset = fs::read_dir(&assets_dir)
        .expect("read assets dir")
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("component.") && name.ends_with(".js"))
                .unwrap_or(false)
        })
        .expect("component asset must exist");
    let source = fs::read_to_string(&component_asset).expect("read component asset");
    assert!(
        source.contains("from './modules/src/components/helpers/One.js'"),
        "component asset did not rewrite helper specifier:\n{}",
        source
    );
}

#[test]
fn component_dynamic_imports_are_emitted_and_rewritten() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["root_hoist"], &[]);

    let payload = json!([{
        "route": "/",
        "file": "pages/index.zen",
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
                    "module_id": "src/components/Widget.zen:script0",
                    "factory": "createComponent_comp_hoist",
                    "imports": [],
                    "deps": ["src/components/helpers/Dynamic.js"],
                    "code": "export function createComponent_comp_hoist(){ return { mount(){ import('./helpers/Dynamic.js'); }, update(){}, destroy(){}, bindings:Object.freeze({}) }; }"
                }
            },
            "component_instances": [],
            "imports": [],
            "modules": [
                {
                    "id": "src/components/helpers/Dynamic.js",
                    "source": "export const dynamicValue = 1;\n",
                    "deps": []
                }
            ],
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
        "bundler failed unexpectedly: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let helper_dynamic = out_dir.join("assets/modules/src/components/helpers/Dynamic.js");
    assert!(
        helper_dynamic.exists(),
        "missing emitted dynamic helper module {}",
        helper_dynamic.display()
    );

    let assets_dir = out_dir.join("assets");
    let component_asset = fs::read_dir(&assets_dir)
        .expect("read assets dir")
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("component.") && name.ends_with(".js"))
                .unwrap_or(false)
        })
        .expect("component asset must exist");
    let source = fs::read_to_string(&component_asset).expect("read component asset");
    assert!(
        source.contains("import('./modules/src/components/helpers/Dynamic.js')"),
        "component dynamic import was not rewritten:\n{}",
        source
    );
}
