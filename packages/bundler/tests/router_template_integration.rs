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
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": ["const __fixture_marker = 1;\nexport {};__zenith_component_bootstraps.push(() => {});"]
                },
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
    let home_path = from_manifest_path(
        &out_dir,
        manifest["chunks"]["/"]
            .as_str()
            .expect("manifest home chunk missing"),
    );

    assert!(router_path.exists(), "router asset missing");
    assert!(runtime_path.exists(), "runtime asset missing");
    assert!(home_path.exists(), "home page asset missing");

    let router_source = fs::read_to_string(&router_path).expect("read router asset");
    let runtime_source = fs::read_to_string(&runtime_path).expect("read runtime asset");
    let home_source = fs::read_to_string(&home_path).expect("read home page asset");
    let router_compact = router_source.split_whitespace().collect::<String>();
    let home_compact = home_source.split_whitespace().collect::<String>();

    let click_start = router_compact
        .find("document.addEventListener(\"click\",")
        .or_else(|| router_compact.find("document.addEventListener('click',"))
        .expect("router click handler missing");
    let prevent_default = router_compact
        .find("event.preventDefault()")
        .expect("preventDefault missing in click flow");
    let perform_navigation = router_compact[prevent_default..]
        .find("performNavigation(targetUrl,")
        .map(|index| prevent_default + index)
        .expect("performNavigation missing in click flow");
    let fetch_document = router_compact
        .find("fetch(targetUrl.href")
        .expect("fresh document fetch missing in router");
    let find_any = |patterns: &[&str]| {
        patterns
            .iter()
            .find_map(|pattern| router_compact.find(pattern))
    };
    let before_leave = find_any(&[
        "awaitemitNavigationEvent(context,\"navigation:before-leave\",",
        "awaitemitNavigationEvent(context,'navigation:before-leave',",
    ])
    .expect("navigation:before-leave missing in router");
    let before_swap = find_any(&[
        "awaitemitNavigationEvent(context,\"navigation:before-swap\",",
        "awaitemitNavigationEvent(context,'navigation:before-swap',",
    ])
    .expect("navigation:before-swap missing in router");
    let before_enter = find_any(&[
        "awaitemitNavigationEvent(context,\"navigation:before-enter\",",
        "awaitemitNavigationEvent(context,'navigation:before-enter',",
    ])
    .expect("navigation:before-enter missing in router");
    let enter_complete = find_any(&[
        "emitNavigationEvent(context,\"navigation:enter-complete\",",
        "emitNavigationEvent(context,'navigation:enter-complete',",
    ])
    .expect("navigation:enter-complete missing in router");
    let mount_idx = router_compact
        .find("constmounted=awaitmountRoute(resolved.route,resolved.params,context.token,payload)")
        .expect("mountRoute missing in router");
    let scroll_apply = find_any(&[
        "dispatchScrollEvent(\"after\",",
        "dispatchScrollEvent('after',",
    ])
    .expect("scroll apply missing in router");

    assert!(
        click_start < prevent_default && prevent_default < perform_navigation,
        "router click contract ordering violated"
    );
    assert!(
        router_compact.contains("history.pushState("),
        "router must push history on successful forward navigation"
    );
    assert!(
        router_compact.contains("history.replaceState("),
        "router must replace history state for initial/popstate bookkeeping"
    );
    assert!(
        !router_compact.contains("encodeURIComponent(toNavigationPath(targetUrl))"),
        "route-check disabled router output must omit route-check fetch scaffolding"
    );
    assert!(
        router_compact.contains("__zenith_route_html"),
        "router must expose the runtime route HTML override channel"
    );
    assert!(
        fetch_document != usize::MAX,
        "router must fetch the target document inside the emitted runtime"
    );
    for route in ["/", "/about"] {
        let chunk = manifest["chunks"][route]
            .as_str()
            .unwrap_or_else(|| panic!("manifest chunk missing for {route}"));
        let double_quoted = format!("import(\"{chunk}\")");
        let single_quoted = format!("import('{chunk}')");
        assert!(
            router_compact.contains(&double_quoted) || router_compact.contains(&single_quoted),
            "router must emit a literal dynamic import for {route}: {chunk}"
        );
    }
    assert!(
        !router_compact.contains("import(routeModuleSpecifier(")
            && !router_compact.contains("import(__ZENITH_MANIFEST__.chunks[route])")
            && !router_compact.contains("zenith_navigation="),
        "router route modules must not use computed imports or cache-busting query strings"
    );
    assert!(
        home_compact.contains("function__zenith_create_page_instance()")
            && home_compact.contains("return__zenith_create_page_instance().mount(root,params)"),
        "cached route modules must create fresh page bindings for every mount"
    );
    assert!(
        !home_source.contains("export {};"),
        "TypeScript module markers must not survive inside the page instance factory"
    );
    assert!(
        before_leave < before_swap
            && before_swap < mount_idx
            && mount_idx < before_enter
            && before_enter < scroll_apply
            && scroll_apply < enter_complete,
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
