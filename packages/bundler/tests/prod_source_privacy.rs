//! Production client output must not ship build-machine paths or source snippets.
//! Dev-stable output keeps full spans for overlays.

use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::json;
use zenith_compiler::deterministic::sha256_hex;

const UNIX_SOURCE_FILE: &str = "/home/judahbsullivan/zenith-jud90-leak/src/pages/index.zen";
const UNIX_SNIPPET: &str = "open /home/judahbsullivan/zenith-jud90-leak/secret.txt";
const WINDOWS_SOURCE_FILE: &str = r"C:\Users\judahbsullivan\zenith-jud90-leak\index.zen";
const WINDOWS_SNIPPET: &str = r"C:\Users\judahbsullivan\zenith-jud90-leak\secret.txt";

fn bundler_bin() -> String {
    if let Ok(path) = env::var("CARGO_BIN_EXE_zenith-bundler") {
        return path;
    }
    let current = env::current_exe().expect("resolve current test binary");
    let debug_dir = current
        .parent()
        .and_then(|parent| parent.parent())
        .expect("resolve target/debug directory");
    let candidate = debug_dir.join(format!("zenith-bundler{}", env::consts::EXE_SUFFIX));
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
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    let mut sorted_edges = edges
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
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

fn source_span(file: &str, snippet: &str) -> serde_json::Value {
    json!({
        "file": file,
        "start": { "line": 11, "column": 1 },
        "end": { "line": 11, "column": 24 },
        "snippet": snippet
    })
}

fn leaking_payload() -> serde_json::Value {
    let graph_hash = compute_graph_hash(&["mod_home"], &[]);
    json!([{
        "route": "/",
        "file": UNIX_SOURCE_FILE,
        "router": false,
        "ir": {
            "ir_version": 1,
            "graph_hash": graph_hash,
            "graph_edges": [],
            "graph_nodes": [{ "id": "page", "hoist_id": "mod_home" }],
            "html": "<!DOCTYPE html><html><head></head><body><main><button>Save</button><span>Hello</span></main></body></html>",
            "expressions": ["count"],
            "hoisted": {
                "state": [{ "key": "rootRef", "value": "null" }]
            },
            "expression_bindings": [{
                "marker_index": 0,
                "literal": "count",
                "source": source_span(UNIX_SOURCE_FILE, UNIX_SNIPPET)
            }],
            "marker_bindings": [{
                "index": 0,
                "kind": "text",
                "selector": "[data-zx-e~=\"0\"]",
                "source": source_span(UNIX_SOURCE_FILE, UNIX_SNIPPET)
            }],
            "event_bindings": [{
                "index": 0,
                "event": "click",
                "selector": "[data-zx-on-click=\"0\"]",
                "source": source_span(WINDOWS_SOURCE_FILE, WINDOWS_SNIPPET)
            }],
            "ref_bindings": [{
                "index": 0,
                "identifier": "rootRef",
                "selector": "[data-zx-ref=\"0\"]",
                "source": source_span(UNIX_SOURCE_FILE, UNIX_SNIPPET)
            }]
        }
    }])
}

fn run_bundler(out_dir: &Path, dev_stable: bool) -> String {
    let mut command = Command::new(bundler_bin());
    command.arg("--out-dir").arg(out_dir);
    if dev_stable {
        command.arg("--dev-stable-assets");
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn bundler");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(leaking_payload().to_string().as_bytes())
        .expect("write payload");
    let output = child.wait_with_output().expect("wait bundler");
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    assert!(
        output.status.success(),
        "bundler failed (dev_stable={dev_stable}). stderr:\n{stderr}"
    );
    stderr
}

fn collect_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let entries =
        fs::read_dir(dir).unwrap_or_else(|error| panic!("read {}: {error}", dir.display()));
    for entry in entries {
        let entry = entry.expect("dir entry");
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, files);
        } else {
            files.push(path);
        }
    }
}

fn assert_dist_omits_build_machine_source(out_dir: &Path) {
    let mut files = Vec::new();
    collect_files(out_dir, &mut files);
    assert!(!files.is_empty(), "production dist should contain files");

    let needles = [
        "judahbsullivan",
        "zenith-jud90-leak",
        "secret.txt",
        "/home/",
        r"C:\Users",
        "C:/Users",
    ];
    let mut saw_page = false;
    for path in &files {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if extension == "js" || extension == "html" {
            for needle in needles {
                assert!(
                    !text.contains(needle),
                    "{} leaked `{needle}`",
                    path.display()
                );
            }
        }
        if extension == "js" && (text.contains("rootRef") || text.contains("__zenith_refs")) {
            saw_page = true;
        }
    }
    assert!(
        saw_page,
        "production dist should still emit the ref table without source metadata"
    );
}

#[test]
fn production_dist_omits_absolute_source_paths_and_snippets() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    run_bundler(&out_dir, false);
    assert_dist_omits_build_machine_source(&out_dir);
}

#[test]
fn dev_stable_dist_keeps_source_spans_for_overlays() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let out_dir = tmp.path().join("dist");
    run_bundler(&out_dir, true);

    let mut files = Vec::new();
    collect_files(&out_dir, &mut files);
    let page = files.iter().find(|path| {
        fs::read_to_string(path)
            .map(|text| text.contains(UNIX_SOURCE_FILE) && text.contains(UNIX_SNIPPET))
            .unwrap_or(false)
    });
    assert!(
        page.is_some(),
        "dev-stable page bundle should keep absolute source.file and snippet for overlays"
    );
    let page_text = fs::read_to_string(page.expect("page")).expect("read page");
    assert!(page_text.contains("judahbsullivan"));
    assert!(page_text.contains("secret.txt"));
    assert!(
        page_text.contains(WINDOWS_SOURCE_FILE)
            || page_text.contains("C:\\\\Users\\\\judahbsullivan"),
        "dev-stable event source should keep the windows path"
    );
}
