use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::json;
use zenith_compiler::deterministic::sha256_hex;

fn repo_root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("bundler crate should live at <repo>/packages/bundler")
        .to_path_buf()
}

fn link_workspace_node_modules(project_root: &Path) {
    let workspace_node_modules = repo_root().join("node_modules");
    if !workspace_node_modules.exists() {
        return;
    }

    let target = project_root.join("node_modules");
    if target.exists() {
        return;
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&workspace_node_modules, &target)
        .expect("symlink workspace node_modules into test project");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&workspace_node_modules, &target)
        .expect("symlink workspace node_modules into test project");
}

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

fn run_bundler(payload: serde_json::Value, cwd: &Path, out_dir: &Path) -> std::process::Output {
    let mut command = Command::new(bundler_bin());
    command
        .arg("--out-dir")
        .arg(out_dir)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
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

fn count_stylesheet_links(html: &str) -> usize {
    html.matches("rel=\"stylesheet\"").count()
}

fn compute_graph_hash(hoist_ids: &[&str], edges: &[&str]) -> String {
    let mut ids = hoist_ids.iter().map(|id| (*id).to_string()).collect::<Vec<_>>();
    ids.sort();
    ids.dedup();

    let mut sorted_edges = edges.iter().map(|edge| (*edge).to_string()).collect::<Vec<_>>();
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

#[test]
fn precompiled_local_css_import_is_bundled_and_injected_once() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    let styles_dir = pages_dir.join("styles");
    fs::create_dir_all(&styles_dir).expect("create styles dir");

    let page_path = pages_dir.join("index.zen");
    fs::write(
        &page_path,
        "<script>\nimport \"./styles/output.css\";\n</script>\n<main>Home</main>\n",
    )
    .expect("write page");

    let marker = "/* TAILWIND_PRECOMPILED_MARKER */\n:root { --brand: #13795b; }\nmain { color: var(--brand); }\n";
    fs::write(styles_dir.join("output.css"), marker).expect("write css");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &["index.zen->styles/output.css"]);

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": ["index.zen->styles/output.css"],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": "import \"./styles/output.css\";\\nexport const marker = true;",
                        "deps": ["styles/output.css"]
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");

    let css_rel = manifest["css"].as_str().expect("manifest.css missing");
    let css_abs = out_dir.join(css_rel.trim_start_matches('/'));
    assert!(css_abs.exists(), "emitted CSS asset missing: {}", css_abs.display());

    let css = fs::read_to_string(&css_abs).expect("read css asset");
    assert!(
        css.contains("TAILWIND_PRECOMPILED_MARKER"),
        "emitted CSS must include imported precompiled CSS marker"
    );

    let html = fs::read_to_string(out_dir.join("index.html")).expect("read index.html");
    assert_eq!(
        count_stylesheet_links(&html),
        1,
        "index.html must include exactly one stylesheet link"
    );
    assert!(
        !html.contains("<!-- ZENITH_STYLES_ANCHOR -->"),
        "styles anchor must be removed"
    );
}

#[test]
fn local_tailwind_entry_is_compiled_internally() {
    let tmp = tempfile::tempdir().expect("temp dir");
    link_workspace_node_modules(tmp.path());
    let pages_dir = tmp.path().join("pages");
    let styles_dir = pages_dir.join("styles");
    fs::create_dir_all(&styles_dir).expect("create styles dir");

    let page_path = pages_dir.join("index.zen");
    fs::write(
        &page_path,
        "<script>\nimport \"./styles/global.css\";\n</script>\n<main class=\"text-red-500 font-bold\">Home</main>\n",
    )
    .expect("write page");

    fs::write(
        styles_dir.join("global.css"),
        "@import \"tailwindcss\";\n:root { --zenith-test: 1; }\n",
    )
    .expect("write tailwind entry");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &["index.zen->styles/global.css"]);

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": ["index.zen->styles/global.css"],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main class=\"text-red-500 font-bold\">Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": "import \"./styles/global.css\";\\nexport const marker = true;",
                        "deps": ["styles/global.css"]
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");

    let css_rel = manifest["css"].as_str().expect("manifest.css missing");
    let css_abs = out_dir.join(css_rel.trim_start_matches('/'));
    let css = fs::read_to_string(&css_abs).expect("read css asset");

    assert!(
        !css.contains("@import \"tailwindcss\""),
        "emitted CSS must not contain raw Tailwind import"
    );
    assert!(
        css.contains(".text-red-500") || css.contains("color:var(--color-red-500"),
        "emitted CSS must include compiled Tailwind utility, got:\n{}",
        css
    );
    assert!(
        css.contains(":root") && css.contains("--zenith-test"),
        "custom CSS from the Tailwind entry must survive compilation"
    );
}

#[test]
fn precompiled_local_css_import_with_query_and_hash_suffix_is_resolved() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    let styles_dir = pages_dir.join("styles");
    fs::create_dir_all(&styles_dir).expect("create styles dir");

    let page_path = pages_dir.join("index.zen");
    fs::write(
        &page_path,
        "<script>\nimport \"./styles/output.css?v=1#hash\";\n</script>\n<main>Home</main>\n",
    )
    .expect("write page");

    let marker = "/* QUERY_SUFFIX_MARKER */\nmain { color: #0f766e; }\n";
    fs::write(styles_dir.join("output.css"), marker).expect("write css");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &["index.zen->styles/output.css"]);

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": ["index.zen->styles/output.css"],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": "import \"./styles/output.css?v=1#hash\";\nexport const marker = true;",
                        "deps": ["styles/output.css"]
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");
    let css_rel = manifest["css"].as_str().expect("manifest.css missing");
    let css = fs::read_to_string(out_dir.join(css_rel.trim_start_matches('/')))
        .expect("read emitted css");

    assert!(
        css.contains("QUERY_SUFFIX_MARKER"),
        "emitted CSS must include local file imported with query/hash suffix"
    );
}

#[test]
fn compiler_style_blocks_still_strip_anchor_and_emit_single_stylesheet() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    fs::create_dir_all(&pages_dir).expect("create pages dir");
    let page_path = pages_dir.join("index.zen");
    fs::write(&page_path, "<main>Home</main>\n").expect("write page");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &[]);
    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": [],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": "export const marker = true;",
                        "deps": []
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": [
                    {
                        "module_id": "index.zen",
                        "order": 0,
                        "content": ".from-style-block { color: #ef4444; }"
                    }
                ]
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let html = fs::read_to_string(out_dir.join("index.html")).expect("read index.html");
    assert_eq!(
        count_stylesheet_links(&html),
        1,
        "index.html must include exactly one stylesheet link when style_blocks exist"
    );
    assert!(
        !html.contains("<!-- ZENITH_STYLES_ANCHOR -->"),
        "styles anchor must be removed when style_blocks exist"
    );

    let manifest: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest"),
    )
    .expect("parse manifest");
    let css_rel = manifest["css"].as_str().expect("manifest.css missing");
    let css = fs::read_to_string(out_dir.join(css_rel.trim_start_matches('/')))
        .expect("read emitted css");
    assert!(
        css.contains(".from-style-block"),
        "emitted CSS must include compiler style block content"
    );
}

#[test]
fn raw_tailwind_import_in_emitted_css_hard_fails() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    fs::create_dir_all(&pages_dir).expect("create pages dir");

    let page_path = pages_dir.join("index.zen");
    fs::write(&page_path, "<main>Home</main>\n").expect("write page");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &[]);

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": [],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": [
                    {
                        "module_id": "index.zen::__style0",
                        "order": 0,
                        "content": "@import \"tailwindcss\";\nbody { color: red; }\n"
                    }
                ]
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(!output.status.success(), "bundler must reject raw tailwind imports in emitted CSS");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Tailwind CSS contract violation"),
        "expected tailwind CSS contract diagnostic, got:\n{}",
        stderr
    );
}

#[test]
fn bare_css_package_import_hard_fails() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    fs::create_dir_all(&pages_dir).expect("create pages dir");

    let page_path = pages_dir.join("index.zen");
    fs::write(
        &page_path,
        "<script>\nimport \"tailwindcss\";\n</script>\n<main>Home</main>\n",
    )
    .expect("write page");

    let out_dir = tmp.path().join("dist");
    let graph_hash = compute_graph_hash(&["index.zen"], &["index.zen->external:tailwindcss"]);

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": ["index.zen->external:tailwindcss"],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": "import \"tailwindcss\";\\nexport const marker = true;",
                        "deps": ["external:tailwindcss"]
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    assert!(
        !output.status.success(),
        "bundler must fail for bare CSS package imports"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("CSS import contract violation: bare CSS imports are not supported."),
        "expected bare CSS contract diagnostic, got:\n{}",
        stderr
    );
    assert!(
        stderr.contains("specifier: tailwindcss"),
        "expected failing specifier in diagnostic, got:\n{}",
        stderr
    );
}

#[test]
fn css_merge_is_deterministic_when_input_order_changes() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    let styles_dir = pages_dir.join("styles");
    fs::create_dir_all(&styles_dir).expect("create styles dir");

    fs::write(styles_dir.join("a.css"), "/* A */\n.a{color:red}\n").expect("write a.css");
    fs::write(styles_dir.join("b.css"), "/* B */\n.b{color:blue}\n").expect("write b.css");

    let a_path = pages_dir.join("a.zen");
    let b_path = pages_dir.join("b.zen");
    fs::write(&a_path, "<script>\nimport \"./styles/a.css\";\n</script>\n<main>A</main>\n")
        .expect("write a.zen");
    fs::write(&b_path, "<script>\nimport \"./styles/b.css\";\n</script>\n<main>B</main>\n")
        .expect("write b.zen");

    let page_a = json!({
        "route": "/a",
        "file": a_path,
        "router": true,
        "ir": {
            "ir_version": 1,
            "graph_hash": compute_graph_hash(&["a.zen"], &["a.zen->styles/a.css"]),
            "graph_nodes": [{ "id": "a.zen", "hoist_id": "a.zen" }],
            "graph_edges": ["a.zen->styles/a.css"],
            "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>A</main></body></html>",
            "expressions": [],
            "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
            "components_scripts": {},
            "component_instances": [],
            "imports": [],
            "modules": [
                {
                    "id": "a.zen",
                    "source": "import \"./styles/a.css\";\nexport const page = 'a';",
                    "deps": ["styles/a.css"]
                }
            ],
            "signals": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "style_blocks": []
        }
    });
    let page_b = json!({
        "route": "/b",
        "file": b_path,
        "router": true,
        "ir": {
            "ir_version": 1,
            "graph_hash": compute_graph_hash(&["b.zen"], &["b.zen->styles/b.css"]),
            "graph_nodes": [{ "id": "b.zen", "hoist_id": "b.zen" }],
            "graph_edges": ["b.zen->styles/b.css"],
            "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>B</main></body></html>",
            "expressions": [],
            "hoisted": { "imports": [], "declarations": [], "functions": [], "signals": [], "state": [], "code": [] },
            "components_scripts": {},
            "component_instances": [],
            "imports": [],
            "modules": [
                {
                    "id": "b.zen",
                    "source": "import \"./styles/b.css\";\nexport const page = 'b';",
                    "deps": ["styles/b.css"]
                }
            ],
            "signals": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "style_blocks": []
        }
    });

    let out_a = tmp.path().join("dist-a");
    let first = run_bundler(json!([page_a.clone(), page_b.clone()]), tmp.path(), &out_a);
    assert!(
        first.status.success(),
        "first build failed: {}",
        String::from_utf8_lossy(&first.stderr)
    );
    let manifest_first: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(out_a.join("manifest.json")).expect("read manifest first"))
            .expect("parse manifest first");
    let css_first_rel = manifest_first["css"].as_str().expect("manifest.css first");
    let css_first = fs::read_to_string(out_a.join(css_first_rel.trim_start_matches('/')))
        .expect("read first css");

    let out_b = tmp.path().join("dist-b");
    let second = run_bundler(json!([page_b, page_a]), tmp.path(), &out_b);
    assert!(
        second.status.success(),
        "second build failed: {}",
        String::from_utf8_lossy(&second.stderr)
    );
    let manifest_second: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(out_b.join("manifest.json")).expect("read manifest second"))
            .expect("parse manifest second");
    let css_second_rel = manifest_second["css"].as_str().expect("manifest.css second");
    let css_second = fs::read_to_string(out_b.join(css_second_rel.trim_start_matches('/')))
        .expect("read second css");

    assert_eq!(
        css_first_rel, css_second_rel,
        "CSS asset filename/hash must be deterministic regardless of input order"
    );
    assert_eq!(css_first, css_second, "Merged CSS bytes must be identical across input order");
}

#[test]
fn css_import_cannot_escape_project_root() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let pages_dir = tmp.path().join("pages");
    fs::create_dir_all(&pages_dir).expect("create pages dir");

    let escape_name = format!(
        "zenith-escape-{}.css",
        tmp.path()
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("fallback")
    );
    let outside_css = tmp
        .path()
        .parent()
        .expect("temp parent")
        .join(&escape_name);
    fs::write(&outside_css, "/* escape */\n").expect("write outside css");

    let page_path = pages_dir.join("index.zen");
    fs::write(
        &page_path,
        format!(
            "<script>\nimport \"../../{}\";\n</script>\n<main>Home</main>\n",
            escape_name
        ),
    )
    .expect("write page");

    let out_dir = tmp.path().join("dist");
    let edge = format!("index.zen->../../{}", escape_name);
    let graph_hash = compute_graph_hash(&["index.zen"], &[&edge]);
    let source = format!(
        "import \"../../{}\";\nexport const marker = true;",
        escape_name
    );

    let payload = json!([
        {
            "route": "/",
            "file": page_path,
            "router": true,
            "ir": {
                "ir_version": 1,
                "graph_hash": graph_hash,
                "graph_nodes": [{ "id": "index.zen", "hoist_id": "index.zen" }],
                "graph_edges": [edge],
                "html": "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>",
                "expressions": [],
                "hoisted": {
                    "imports": [],
                    "declarations": [],
                    "functions": [],
                    "signals": [],
                    "state": [],
                    "code": []
                },
                "components_scripts": {},
                "component_instances": [],
                "imports": [],
                "modules": [
                    {
                        "id": "index.zen",
                        "source": source,
                        "deps": []
                    }
                ],
                "signals": [],
                "expression_bindings": [],
                "marker_bindings": [],
                "event_bindings": [],
                "style_blocks": []
            }
        }
    ]);

    let output = run_bundler(payload, tmp.path(), &out_dir);
    let _ = fs::remove_file(&outside_css);

    assert!(
        !output.status.success(),
        "bundler must fail when css import escapes project root"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("CSS import contract violation: imported CSS path escapes project root."),
        "expected traversal contract diagnostic, got:\n{}",
        stderr
    );
    assert!(
        stderr.contains(&format!("specifier: ../../{}", escape_name)),
        "expected escaping specifier in diagnostic, got:\n{}",
        stderr
    );
}
