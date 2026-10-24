use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::json;
use zenith_compiler::deterministic::sha256_hex;

fn bundler_bin() -> PathBuf {
    if let Ok(path) = env::var("CARGO_BIN_EXE_zenith-bundler") {
        return PathBuf::from(path);
    }

    let current = env::current_exe().expect("resolve current test binary");
    let debug_dir = current
        .parent()
        .and_then(Path::parent)
        .expect("resolve target debug directory");
    debug_dir.join("zenith-bundler")
}

fn graph_hash() -> String {
    sha256_hex(b"id:root\n")
}

fn payload() -> serde_json::Value {
    json!([{
        "route": "/",
        "file": "pages/index.zen",
        "router": false,
        "ir": {
            "ir_version": 1,
            "graph_hash": graph_hash(),
            "graph_nodes": [{ "id": "root", "hoist_id": "root" }],
            "graph_edges": [],
            "html": "<!doctype html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Cache fixture</main></body></html>",
            "expressions": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "ref_bindings": [],
            "signals": [],
            "style_blocks": [],
            "hoisted": { "code": [], "state": [], "imports": [] },
            "components_scripts": {},
            "component_instances": [],
            "imports": [{
                "local": "cacheToken",
                "spec": "cache-dep",
                "hoist_id": "cache_dep",
                "file_hash": "cache_dep_hash"
            }],
            "modules": []
        }
    }])
}

fn run_bundler(root: &Path, out_dir: &Path) {
    let mut child = Command::new(bundler_bin())
        .arg("--out-dir")
        .arg(out_dir)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn bundler");

    child
        .stdin
        .as_mut()
        .expect("bundler stdin")
        .write_all(payload().to_string().as_bytes())
        .expect("write bundler payload");

    let output = child.wait_with_output().expect("wait for bundler");
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn vendor_output(out_dir: &Path) -> (String, String) {
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(out_dir.join("manifest.json")).expect("read manifest"))
            .expect("parse manifest");
    let relative = manifest["vendor"]
        .as_str()
        .expect("manifest vendor path")
        .trim_start_matches('/');
    let source = fs::read_to_string(out_dir.join(relative)).expect("read vendor output");
    (relative.to_string(), source)
}

#[test]
fn bun_lock_change_invalidates_warm_vendor_cache() {
    let fixture = tempfile::tempdir().expect("temp fixture");
    let root = fixture.path();
    let out_dir = root.join("dist");
    let dependency_dir = root.join("node_modules/cache-dep");
    fs::create_dir_all(&dependency_dir).expect("create dependency directory");
    fs::write(
        root.join("package.json"),
        r#"{"name":"vendor-cache-fixture","dependencies":{"cache-dep":"1.0.0"}}"#,
    )
    .expect("write project manifest");
    fs::write(
        dependency_dir.join("package.json"),
        r#"{"name":"cache-dep","version":"1.0.0","type":"module","main":"index.js"}"#,
    )
    .expect("write dependency manifest");
    fs::write(
        dependency_dir.join("index.js"),
        r#"export const cacheToken = "CACHE_OLD_VALUE";"#,
    )
    .expect("write old dependency");
    fs::write(root.join("bun.lock"), "cache-dep@1.0.0\n").expect("write old Bun lock");

    run_bundler(root, &out_dir);
    let (old_path, old_source) = vendor_output(&out_dir);
    assert!(old_source.contains("CACHE_OLD_VALUE"));

    fs::write(
        dependency_dir.join("index.js"),
        r#"export const cacheToken = "CACHE_NEW_VALUE";"#,
    )
    .expect("write new dependency");
    fs::write(root.join("bun.lock"), "cache-dep@2.0.0\n").expect("write new Bun lock");

    run_bundler(root, &out_dir);
    let (new_path, new_source) = vendor_output(&out_dir);
    assert_ne!(
        new_path, old_path,
        "vendor asset name must change with Bun lock"
    );
    assert!(new_source.contains("CACHE_NEW_VALUE"));
    assert!(!new_source.contains("CACHE_OLD_VALUE"));
}
