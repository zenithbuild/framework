//! Shared imported CSS is one module across routes.
//!
//! Identity is the canonical project-relative CSS path. Route prefixes and
//! identical selector text must not create extra copies. Scoped style blocks
//! stay page-scoped. Import order is the cascade order.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("bundler crate should live at <repo>/packages/bundler")
        .to_path_buf()
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn bundler_bin() -> String {
    if let Ok(path) = std::env::var("CARGO_BIN_EXE_zenith-bundler") {
        return path;
    }
    let current = std::env::current_exe().expect("resolve current test binary");
    let debug_dir = current
        .parent()
        .and_then(|parent| parent.parent())
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
        .map(|id| (*id).to_string())
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    let mut sorted_edges = edges
        .iter()
        .map(|edge| (*edge).to_string())
        .collect::<Vec<_>>();
    sorted_edges.sort();
    sorted_edges.dedup();
    let mut seed = String::new();
    for hoist_id in ids {
        seed.push_str("id:");
        seed.push_str(&hoist_id);
        seed.push('\n');
    }
    for edge in sorted_edges {
        seed.push_str("edge:");
        seed.push_str(&edge);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

fn stable_hash_8(content: &str) -> String {
    let mut hash: i32 = 0;
    for byte in content.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    format!("{:08x}", hash.wrapping_abs() as u32)
}

pub(crate) fn count_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    haystack.matches(needle).count()
}

fn run_bundler(payload: &Value, cwd: &Path, out_dir: &Path) -> std::process::Output {
    let mut command = Command::new(bundler_bin());
    command
        .arg("--out-dir")
        .arg(out_dir)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let tailwind_bin = repo_root().join("node_modules/.bin/tailwindcss");
    if tailwind_bin.exists() {
        command.env("ZENITH_TAILWIND_BIN", tailwind_bin);
    }
    let mut child = command.spawn().expect("spawn bundler");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(payload.to_string().as_bytes())
        .expect("write payload");
    child.wait_with_output().expect("wait bundler")
}

fn shared_css() -> String {
    "\
/* SHARED_MARKER */
@layer tokens {
  :root { --shared-token: 1; }
}
@media (min-width: 1px) {
  .shared-media { color: canvastext; }
}
@supports (display: grid) {
  .shared-supports { display: grid; }
}
@import \"./nested.css\" layer(components);
.twin { color: red; }
"
    .to_string()
}

pub(crate) struct RouteSpec {
    pub(crate) route: String,
    pub(crate) module_id: String,
    pub(crate) file_name: String,
    pub(crate) hoisted_imports: Vec<String>,
    pub(crate) unique_css_name: String,
    pub(crate) unique_css: String,
    pub(crate) scoped_css: String,
    pub(crate) component_import: bool,
}

pub(crate) fn route_spec(index: usize, count: usize) -> RouteSpec {
    let module_id = format!("r{index:02}.zen");
    let route = if index == 0 {
        "/".to_string()
    } else {
        format!("/r/{index:02}")
    };
    let unique_css_name = format!("r{index:02}.css");
    let via_component = count > 1 && index + 1 == count;
    let mut hoisted_imports = Vec::new();
    if !via_component {
        hoisted_imports.push("import \"./styles/shared.css\";".to_string());
    }
    hoisted_imports.push(format!("import \"./styles/{unique_css_name}\";"));
    RouteSpec {
        route,
        module_id,
        file_name: format!("r{index:02}.zen"),
        hoisted_imports,
        unique_css_name,
        unique_css: format!(
            "/* ROUTE_{index:02} */\n.route-{index:02} {{ color: canvastext; }}\n@media print {{\n  @import \"./print-{index:02}.css\";\n}}\n.twin {{ color: red; }}\n"
        ),
        scoped_css: format!(
            "/* SCOPE_{index:02} */\n.scope-{index:02} {{ color: green; }}\n.scoped-same {{ color: black; }}\n"
        ),
        component_import: via_component,
    }
}

fn write_route_files(root: &Path, spec: &RouteSpec) {
    let pages = root.join("pages");
    fs::create_dir_all(pages.join("styles")).expect("styles dir");
    fs::create_dir_all(pages.join("components")).expect("components dir");
    fs::write(pages.join(&spec.file_name), "<main>page</main>\n").expect("page");
    fs::write(
        pages.join("styles").join(&spec.unique_css_name),
        &spec.unique_css,
    )
    .expect("unique css");
    if spec.component_import {
        fs::write(
            pages.join("components").join("Button.zen"),
            "<script>\nimport \"../styles/shared.css\";\n</script>\n<button></button>\n",
        )
        .expect("component");
    }
}

fn page_payload(root: &Path, spec: &RouteSpec) -> Value {
    let file = root.join("pages").join(&spec.file_name);
    let mut edges = vec![format!(
        "{}->styles/{}",
        spec.module_id, spec.unique_css_name
    )];
    if !spec.component_import {
        edges.push(format!("{}->styles/shared.css", spec.module_id));
    }
    let edge_refs = edges.iter().map(String::as_str).collect::<Vec<_>>();
    let mut components = serde_json::Map::new();
    if spec.component_import {
        components.insert(
            "Button".to_string(),
            json!({
                "hoist_id": "Button",
                "module_id": "pages/components/Button.zen:script",
                "factory": "function Button(){return null}",
                "imports": ["import \"../styles/shared.css\";"],
                "code": "export function Button(){return null}"
            }),
        );
    }
    json!({
        "route": spec.route,
        "file": file,
        "router": true,
        "ir": {
            "ir_version": 1,
            "graph_hash": compute_graph_hash(&[spec.module_id.as_str()], &edge_refs),
            "graph_nodes": [{ "id": spec.module_id, "hoist_id": spec.module_id }],
            "graph_edges": edges,
            "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>page</main></body></html>",
            "expressions": [],
            "hoisted": {
                "imports": spec.hoisted_imports,
                "declarations": [],
                "functions": [],
                "signals": [],
                "state": [],
                "code": []
            },
            "components_scripts": components,
            "component_instances": [],
            "imports": [],
            "modules": [{
                "id": spec.module_id,
                "source": "export const page = true;",
                "deps": []
            }],
            "signals": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "style_blocks": [{
                "module_id": format!("{}::__style0", spec.module_id),
                "order": 0,
                "content": spec.scoped_css
            }]
        }
    })
}

pub(crate) struct BuiltCss {
    pub(crate) css_public_path: String,
    pub(crate) css: String,
    pub(crate) out_dir: PathBuf,
    pub(crate) stderr: String,
}

pub(crate) fn build_specs(root: &Path, specs: &[RouteSpec], out_name: &str) -> BuiltCss {
    fs::create_dir_all(root.join("pages").join("styles")).expect("styles dir");
    fs::write(
        root.join("pages").join("styles").join("shared.css"),
        shared_css(),
    )
    .expect("shared css");
    fs::write(
        root.join("pages").join("styles").join("nested.css"),
        "/* NESTED_SHOULD_NOT_BE_INLINED */\n.nested { color: canvas; }\n",
    )
    .expect("nested css");
    for spec in specs {
        write_route_files(root, spec);
    }
    let payload = Value::Array(specs.iter().map(|spec| page_payload(root, spec)).collect());
    let out_dir = root.join(out_name);
    let output = run_bundler(&payload, root, &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");
    let css_public_path = manifest["css"].as_str().expect("manifest.css").to_string();
    let css_abs = out_dir.join(css_public_path.trim_start_matches('/'));
    let css = fs::read_to_string(&css_abs).expect("read css");
    assert_eq!(
        format!("/assets/styles.{}.css", stable_hash_8(&css)),
        css_public_path,
        "content hash must address the emitted CSS bytes"
    );
    BuiltCss {
        css_public_path,
        css,
        out_dir,
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

pub(crate) fn assert_shared_once(css: &str, count: usize) {
    assert_eq!(
        count_occurrences(css, "/* SHARED_MARKER */"),
        1,
        "shared module must be emitted once for {count} routes, got {} copies\n{css}",
        count_occurrences(css, "/* SHARED_MARKER */")
    );
    assert_eq!(count_occurrences(css, "@layer tokens"), 1);
    assert_eq!(
        count_occurrences(css, "@media (min-width: 1px)"),
        1,
        "conditional @media context must survive once"
    );
    assert_eq!(
        count_occurrences(css, "@supports (display: grid)"),
        1,
        "conditional @supports context must survive once"
    );
    assert_eq!(
        count_occurrences(css, "@import \"./nested.css\" layer(components);"),
        1,
        "layered @import context must be preserved once and not text-deduped away"
    );
    assert_eq!(
        count_occurrences(css, "NESTED_SHOULD_NOT_BE_INLINED"),
        0,
        "opaque CSS @import targets are not inlined by selector rewriting"
    );
    assert_eq!(
        count_occurrences(css, ".twin { color: red; }"),
        count + 1,
        "identical rules in distinct modules must all remain"
    );
    assert_eq!(
        count_occurrences(css, ".scoped-same { color: black; }"),
        count,
        "scoped style blocks are page-scoped and must not collapse by text"
    );
    for index in 0..count {
        assert_eq!(
            count_occurrences(css, &format!("/* ROUTE_{index:02} */")),
            1,
            "unique route style {index} missing"
        );
        assert_eq!(
            count_occurrences(css, &format!("/* SCOPE_{index:02} */")),
            1,
            "scoped style {index} missing"
        );
        assert_eq!(
            count_occurrences(css, &format!("@import \"./print-{index:02}.css\";")),
            1,
            "route-local @media-wrapped import must remain"
        );
    }
}

pub(crate) fn assert_asset_references(built: &BuiltCss, specs: &[RouteSpec]) {
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(built.out_dir.join("manifest.json")).expect("manifest"),
    )
    .expect("parse manifest");
    let css_public_path = manifest["css"].as_str().expect("css");
    assert_eq!(css_public_path, built.css_public_path);

    let router_rel = manifest["router"].as_str().expect("manifest.router");
    let router_js = fs::read_to_string(built.out_dir.join(router_rel.trim_start_matches('/')))
        .expect("router js");
    assert!(
        router_js.contains(css_public_path),
        "router bundle must inline the manifest CSS asset {css_public_path}"
    );

    let router_manifest = fs::read_to_string(built.out_dir.join("assets/router-manifest.json"))
        .expect("router manifest");
    for spec in specs {
        assert!(
            router_manifest.contains(&format!("\"path\":\"{}\"", spec.route)),
            "router manifest missing route {}",
            spec.route
        );
    }
    assert!(
        !router_manifest.contains("styles."),
        "router manifest must not point at a second stylesheet, got {router_manifest}"
    );

    for spec in specs {
        let html_rel = if spec.route == "/" {
            PathBuf::from("index.html")
        } else {
            let mut path = PathBuf::new();
            for segment in spec.route.split('/').filter(|segment| !segment.is_empty()) {
                path.push(segment);
            }
            path.push("index.html");
            path
        };
        let html = fs::read_to_string(built.out_dir.join(&html_rel))
            .unwrap_or_else(|_| panic!("missing html {}", html_rel.display()));
        assert_eq!(
            count_occurrences(&html, "rel=\"stylesheet\""),
            1,
            "route {} stylesheet link count",
            spec.route
        );
        assert!(
            html.contains(&format!("href=\"{css_public_path}\"")),
            "route {} html must reference {css_public_path}\n{html}",
            spec.route
        );
    }
}

pub(crate) fn named_page(
    root: &Path,
    route: &str,
    module_id: &str,
    imports: &[&str],
    edges: &[&str],
    scoped: &str,
) -> Value {
    json!({
        "route": route,
        "file": root.join("pages").join(module_id),
        "router": true,
        "ir": {
            "ir_version": 1,
            "graph_hash": compute_graph_hash(&[module_id], edges),
            "graph_nodes": [{ "id": module_id, "hoist_id": module_id }],
            "graph_edges": edges,
            "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>page</main></body></html>",
            "expressions": [],
            "hoisted": {
                "imports": imports,
                "declarations": [],
                "functions": [],
                "signals": [],
                "state": [],
                "code": []
            },
            "components_scripts": {},
            "component_instances": [],
            "imports": [],
            "modules": [{
                "id": module_id,
                "source": "export const page = true;",
                "deps": []
            }],
            "signals": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "style_blocks": [{
                "module_id": format!("{module_id}::__style0"),
                "order": 0,
                "content": scoped
            }]
        }
    })
}

pub(crate) fn build_payload(root: &Path, payload: Value, out_name: &str) -> BuiltCss {
    let out_dir = root.join(out_name);
    let output = run_bundler(&payload, root, &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");
    let css_public_path = manifest["css"].as_str().expect("manifest.css").to_string();
    let css = fs::read_to_string(out_dir.join(css_public_path.trim_start_matches('/')))
        .expect("read css");
    assert_eq!(
        format!("/assets/styles.{}.css", stable_hash_8(&css)),
        css_public_path
    );
    BuiltCss {
        css_public_path,
        css,
        out_dir,
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}
