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

fn from_manifest_path(out_dir: &Path, manifest_path: &str) -> PathBuf {
    out_dir.join(manifest_path.trim_start_matches('/'))
}

fn list_js_assets(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current).expect("read dir");
        for entry in entries {
            let entry = entry.expect("dir entry");
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("js"))
                .unwrap_or(false)
            {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

#[test]
fn runtime_core_is_emitted_and_helper_imports_are_rewritten() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["root_hoist"], &[]);

    let payload = json!([{
        "route": "/",
        "file": "pages/index.zen",
        "router": true,
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
                    "imports": ["import { setup } from './helpers/Logic.js';"],
                    "deps": ["src/components/helpers/Logic.js"],
                    "code": "export function createComponent_comp_hoist(){ setup(); return { mount(){}, update(){}, destroy(){}, bindings:Object.freeze({}) }; }"
                }
            },
            "component_instances": [],
            "imports": [],
            "modules": [
                {
                    "id": "src/components/helpers/Logic.js",
                    "source": "import { zenSignal, zenOnMount } from 'zenith:core';\nexport function setup(){ const value = zenSignal(0); zenOnMount(() => {}); return value; }\n",
                    "deps": ["external:zenith:core"]
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

    let manifest_path = out_dir.join("manifest.json");
    assert!(manifest_path.exists(), "manifest.json missing");
    let manifest_raw = fs::read_to_string(&manifest_path).expect("read manifest");
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).expect("parse manifest");

    let core_rel = manifest["core"].as_str().expect("manifest.core missing");
    assert!(
        regex::Regex::new(r"^/assets/core\.[a-f0-9]{8}\.js$")
            .expect("core regex")
            .is_match(core_rel),
        "manifest.core must point to hashed core asset: {core_rel}"
    );
    let core_path = from_manifest_path(&out_dir, core_rel);
    assert!(
        core_path.exists(),
        "core asset missing: {}",
        core_path.display()
    );
    let core_hash = core_rel
        .trim_start_matches('/')
        .trim_start_matches("assets/core.")
        .trim_end_matches(".js")
        .to_string();

    let asset_entries = fs::read_dir(out_dir.join("assets"))
        .expect("read assets dir")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    let core_assets = asset_entries
        .iter()
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("core.") && name.ends_with(".js"))
                .unwrap_or(false)
        })
        .count();
    assert_eq!(core_assets, 1, "core asset must be emitted exactly once");

    let helper_path = out_dir.join("assets/modules/src/components/helpers/Logic.js");
    assert!(
        helper_path.exists(),
        "helper module missing: {}",
        helper_path.display()
    );
    let helper_source = fs::read_to_string(&helper_path).expect("read helper module");
    assert!(
        helper_source.contains("from '/assets/core."),
        "helper import did not rewrite zenith:core to emitted core asset:\n{}",
        helper_source
    );
    assert!(
        !helper_source.contains("zenith:"),
        "helper module leaked zenith:* import:\n{}",
        helper_source
    );

    let router_rel = manifest["router"]
        .as_str()
        .expect("manifest.router missing");
    let router_path = from_manifest_path(&out_dir, router_rel);
    assert!(router_path.exists(), "router asset missing");
    let router_source = fs::read_to_string(&router_path).expect("read router");
    assert!(
        !router_source.contains("zenith:"),
        "router must not reference zenith:* namespace:\n{}",
        router_source
    );

    for js_asset in list_js_assets(&out_dir.join("assets")) {
        let source = fs::read_to_string(&js_asset).expect("read emitted js");
        assert!(
            !source.contains("zenith:"),
            "runtime purity violation: emitted asset contains zenith:* namespace: {}",
            js_asset.display()
        );
    }

    let page_chunk_rel = manifest["chunks"]["/"]
        .as_str()
        .expect("manifest.chunks['/'] missing");
    let page_chunk_path = from_manifest_path(&out_dir, page_chunk_rel);
    let page_chunk_source = fs::read_to_string(&page_chunk_path).expect("read page chunk");
    let graph_hash_prefix = "const __zenith_graph_hash = \"";
    let graph_hash_start = page_chunk_source
        .find(graph_hash_prefix)
        .expect("page chunk graph hash assignment missing")
        + graph_hash_prefix.len();
    let graph_hash_end = page_chunk_source[graph_hash_start..]
        .find("\";")
        .expect("page chunk graph hash terminator missing")
        + graph_hash_start;
    let emitted_global_graph_hash = page_chunk_source[graph_hash_start..graph_hash_end].to_string();

    let manifest_hash = manifest["hash"]
        .as_str()
        .expect("manifest.hash missing")
        .to_string();
    let chunks = manifest["chunks"]
        .as_object()
        .expect("manifest.chunks must be object");
    let mut chunk_values = chunks
        .values()
        .map(|value| {
            value
                .as_str()
                .expect("chunk value must be string")
                .to_string()
        })
        .collect::<Vec<_>>();
    chunk_values.sort();

    let mut manifest_seed = String::new();
    manifest_seed.push_str(&emitted_global_graph_hash);
    manifest_seed.push('\n');
    manifest_seed.push_str(&core_hash);
    manifest_seed.push('\n');
    for chunk in chunk_values {
        manifest_seed.push_str(&chunk);
        manifest_seed.push('\n');
    }
    let expected_manifest_hash = sha256_hex(manifest_seed.as_bytes());
    assert_eq!(
        manifest_hash, expected_manifest_hash,
        "manifest.hash must be sha256(globalGraphHash + coreHash + chunkHashes)"
    );
}
