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

#[test]
fn emitted_router_and_runtime_follow_template_contract() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    let graph_hash_home = compute_graph_hash(&["mod_home"], &[]);
    let graph_hash_about = compute_graph_hash(&["mod_about"], &[]);

    let payload = json!([
        {
            "route": "/",
            "file": "pages/index.zen",
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash_home,
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
        },
        {
            "route": "/about",
            "file": "pages/about.zen",
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash_about,
                "graph_edges": [],
                "graph_nodes": [{ "id": "src/pages/about.zen", "hoist_id": "mod_about" }],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Move certainty upstream.</main></body></html>",
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

    let output = run_bundler(payload, &out_dir);
    assert!(
        output.status.success(),
        "bundler failed unexpectedly: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest_path = out_dir.join("manifest.json");
    let manifest_raw = fs::read_to_string(&manifest_path).expect("read manifest");
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).expect("parse manifest");

    let router_rel = manifest["router"]
        .as_str()
        .expect("manifest.router missing");
    let runtime_rel = manifest["entry"].as_str().expect("manifest.entry missing");

    let router_path = from_manifest_path(&out_dir, router_rel);
    let runtime_path = from_manifest_path(&out_dir, runtime_rel);

    assert!(router_path.exists(), "router asset missing");
    assert!(runtime_path.exists(), "runtime asset missing");

    let router_source = fs::read_to_string(&router_path).expect("read router asset");
    let runtime_source = fs::read_to_string(&runtime_path).expect("read runtime asset");

    let click_start = router_source
        .find("document.addEventListener(\"click\"")
        .expect("router click handler missing");
    let prevent_default = router_source
        .find("event.preventDefault();")
        .expect("preventDefault missing in click flow");
    let perform_navigation = router_source
        .find("performNavigation(targetUrl, \"push\", null)")
        .expect("performNavigation missing in click flow");
    let fetch_document = router_source
        .find("fetch(targetUrl.href")
        .expect("fresh document fetch missing in router");
    let before_leave = router_source
        .find("await emitNavigationEvent(context, \"navigation:before-leave\"")
        .expect("navigation:before-leave missing in router");
    let before_swap = router_source
        .find("await emitNavigationEvent(context, \"navigation:before-swap\"")
        .expect("navigation:before-swap missing in router");
    let before_enter = router_source
        .find("await emitNavigationEvent(context, \"navigation:before-enter\"")
        .expect("navigation:before-enter missing in router");
    let enter_complete = router_source
        .find("emitNavigationEvent(context, \"navigation:enter-complete\"")
        .expect("navigation:enter-complete missing in router");
    let mount_idx = router_source
        .find("const mounted = await mountRoute(resolved.route, resolved.params, context.token, payload);")
        .expect("mountRoute missing in router");
    let scroll_apply = router_source
        .find("dispatchScrollEvent(\"apply\"")
        .expect("scroll apply missing in router");

    assert!(
        click_start < prevent_default && prevent_default < perform_navigation,
        "router click contract ordering violated"
    );
    assert!(
        router_source.contains("history.pushState("),
        "router must push history on successful forward navigation"
    );
    assert!(
        router_source.contains("history.replaceState("),
        "router must replace history state for initial/popstate bookkeeping"
    );
    assert!(
        router_source.contains("encodeURIComponent(toNavigationPath(targetUrl))"),
        "route-check requests must include pathname plus query string"
    );
    assert!(
        router_source.contains("const __ZENITH_RUNTIME_ROUTE_HTML_KEY = \"__zenith_route_html\";"),
        "router must expose the runtime route HTML override channel"
    );
    assert!(
        fetch_document != usize::MAX,
        "router must fetch the target document inside the emitted runtime"
    );
    assert!(
        router_source.contains("import(__ZENITH_MANIFEST__.chunks[route])"),
        "router must use manifest-driven dynamic import shape"
    );
    assert!(
        before_leave < before_swap &&
        before_swap < mount_idx &&
        mount_idx < scroll_apply &&
        scroll_apply < before_enter &&
        before_enter < enter_complete,
        "router lifecycle ordering violated"
    );

    for (label, source) in [("router", &router_source), ("runtime", &runtime_source)] {
        if label == "runtime" {
            assert!(
                !source.contains("fetch("),
                "{label} asset must not contain fetch("
            );
        }
        assert!(
            !source.contains("__zenith_ssr="),
            "{label} asset must not contain query-param SSR transport"
        );
        assert!(
            !source.contains("searchParams.get('__zenith_ssr')"),
            "{label} asset must not read __zenith_ssr query params"
        );
        assert!(
            !source.contains(".zen\"") && !source.contains(".zen'"),
            "{label} asset must not contain .zen string literals"
        );
        assert!(
            !source.contains("zenith:"),
            "{label} asset must not contain zenith:* references"
        );
    }
}
