use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use regex::Regex;
use serde_json::json;

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

#[test]
fn emitted_runtime_graph_contains_no_zen_references() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");

    let payload = json!([
        {
            "route": "/",
            "file": "pages/index.zen",
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": "64d2dd5787572845305bb40813a7ab2bd93560ebc6ea3d6e19f92cb392d616ee",
                "graph_nodes": [{ "id": "mod_index", "hoist_id": "mod_a" }],
                "graph_edges": [],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
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
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest_path = out_dir.join("manifest.json");
    assert!(manifest_path.exists(), "manifest.json missing");
    let manifest_raw = fs::read_to_string(&manifest_path).expect("read manifest");
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).expect("parse manifest");

    let chunk_rel = manifest["chunks"]["/"]
        .as_str()
        .expect("manifest.chunks['/'] missing");
    let page_chunk_path = from_manifest_path(&out_dir, chunk_rel);
    assert!(page_chunk_path.exists(), "page chunk missing");
    let final_bundle_js = fs::read_to_string(&page_chunk_path).expect("read page chunk");
    assert!(
        !final_bundle_js.contains(".zen"),
        "page chunk leaked source reference: {}",
        page_chunk_path.display()
    );

    let router_rel = manifest["router"]
        .as_str()
        .expect("manifest.router missing");
    let router_path = from_manifest_path(&out_dir, router_rel);
    assert!(router_path.exists(), "router chunk missing");
    let router_js = fs::read_to_string(&router_path).expect("read router chunk");
    assert!(
        !router_js.contains(".zen"),
        "router chunk leaked source reference: {}",
        router_path.display()
    );
    assert!(
        !router_js.contains("fetch("),
        "router chunk must not perform runtime fetch: {}",
        router_path.display()
    );
}

#[test]
fn vendor_rewrite_leaves_no_bare_imports_in_emitted_assets() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");

    let node_modules = tmp.path().join("node_modules");
    fs::create_dir_all(node_modules.join("gsap")).expect("create gsap module dir");
    fs::write(
        node_modules.join("gsap/package.json"),
        r#"{"name":"gsap","main":"index.js","type":"module"}"#,
    )
    .expect("write gsap package.json");
    fs::write(
        node_modules.join("gsap/index.js"),
        r#"export const gsap = { version: "mock" };"#,
    )
    .expect("write gsap index.js");

    fs::create_dir_all(node_modules.join("date-fns")).expect("create date-fns module dir");
    fs::write(
        node_modules.join("date-fns/package.json"),
        r#"{"name":"date-fns","main":"index.js","type":"module"}"#,
    )
    .expect("write date-fns package.json");
    fs::write(
        node_modules.join("date-fns/index.js"),
        r#"export const format = () => "mock-date";"#,
    )
    .expect("write date-fns index.js");

    fs::write(
        tmp.path().join("package.json"),
        r#"{"name":"test-project","dependencies":{"gsap":"1.0.0","date-fns":"1.0.0"}}"#,
    )
    .expect("write package.json");
    fs::write(
        tmp.path().join("package-lock.json"),
        r#"{"name":"test-project","lockfileVersion":3,"packages":{"":{"dependencies":{"gsap":"1.0.0","date-fns":"1.0.0"}}}}"#,
    )
    .expect("write package-lock.json");

    // Create component fixture so extract_component_template_markup can read it
    fs::create_dir_all(tmp.path().join("components")).expect("create components dir");
    fs::write(
        tmp.path().join("components/Banner.zen"),
        "<script lang=\"ts\">\nzenMount(({ cleanup }) => { cleanup(() => {}); });\n</script>\n<div data-banner><p>Banner</p></div>\n",
    )
    .expect("write Banner.zen fixture");

    let payload = json!([
        {
            "route": "/vendor",
            "file": "pages/vendor.zen",
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": "c0c678e4a3242a6e7c08a3739de307181a6d2a241340cd73927adcf93ea838da",
                "graph_nodes": [{ "id": "mod_vendor", "hoist_id": "mod_vendor" }],
                "graph_edges": [],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Vendor</main></body></html>",
                "expressions": [],
                "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
                "components_scripts": {
                    "cmp_banner": {
                        "hoist_id": "cmp_banner",
                        "module_id": "components/Banner.zen:script",
                        "factory": "createBanner",
                        "imports": ["import { animate } from '../helpers/anim.js';"],
                        "deps": [],
                        "code": "export function createBanner(host, props, runtime) {\n  return { mount(){ void host; void props; void runtime; }, update(){}, destroy(){}, bindings: Object.freeze({}) };\n}\nexport default createBanner;\n"
                    }
                },
                "component_instances": [],
                "imports": [
                    { "local": "gsap", "spec": "gsap", "hoist_id": "h_gsap", "file_hash": "f_gsap" },
                    { "local": "format", "spec": "date-fns", "hoist_id": "h_date_fns", "file_hash": "f_date_fns" }
                ],
                "modules": [
                    {
                        "id": "helpers/anim.js",
                        "source": "import { gsap } from 'gsap'; export { format } from 'date-fns'; export async function load() { return import('gsap'); } export function animate() { return gsap; }",
                        "deps": []
                    }
                ],
                "style_blocks": []
            }
        }
    ]);

    let mut child = Command::new(bundler_bin())
        .arg("--out-dir")
        .arg(&out_dir)
        .current_dir(tmp.path())
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
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest_path = out_dir.join("manifest.json");
    let manifest_raw = fs::read_to_string(&manifest_path).expect("read manifest");
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).expect("parse manifest");
    let vendor_rel = manifest["vendor"]
        .as_str()
        .expect("manifest.vendor missing")
        .to_string();

    let assets_dir = out_dir.join("assets");
    let mut saw_vendor_rewrite = false;
    for asset in list_js_files(&assets_dir).expect("list js assets") {
        let source = fs::read_to_string(&asset).expect("read asset");
        for spec in collect_js_specifiers(&source) {
            assert_ne!(
                spec,
                "gsap",
                "bare gsap import leaked in emitted asset {}",
                asset.display()
            );
            assert_ne!(
                spec,
                "date-fns",
                "bare date-fns import leaked in emitted asset {}",
                asset.display()
            );
            if spec == vendor_rel {
                saw_vendor_rewrite = true;
            }
            assert!(
                spec.starts_with("./") || spec.starts_with("../") || spec.starts_with('/'),
                "bare import '{}' leaked in emitted asset {}",
                spec,
                asset.display()
            );
        }
    }

    assert!(
        saw_vendor_rewrite,
        "expected at least one import rewritten to manifest.vendor"
    );
}

fn from_manifest_path(out_dir: &Path, manifest_path: &str) -> std::path::PathBuf {
    let rel = manifest_path.trim_start_matches('/');
    out_dir.join(rel)
}

fn list_js_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current)
            .map_err(|e| format!("read_dir {} failed: {e}", current.display()))?
        {
            let entry = entry
                .map_err(|e| format!("read_dir entry in {} failed: {e}", current.display()))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) == Some("js") {
                out.push(path);
            }
        }
    }
    out.sort();
    Ok(out)
}

fn collect_js_specifiers(source: &str) -> Vec<String> {
    let static_import_re =
        Regex::new(r#"(?m)\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]"#).unwrap();
    let dynamic_import_re = Regex::new(r#"(?m)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    let export_from_re =
        Regex::new(r#"(?m)\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();

    let mut out = Vec::new();
    for captures in static_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in dynamic_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in export_from_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}
