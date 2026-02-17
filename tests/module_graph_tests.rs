//! Phase 5 — Deterministic Module Graph Lock Tests
//!
//! These tests prove the bundler is a pure structural transformer with
//! zero semantic drift. Output must be byte-stable and graph-stable.
//!
//! Execution order: 5 → 8 → 6 → 7 → 9
//! This phase must complete fully before any mode branching.

use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::Arc;
use std::thread;
use zenith_bundler::plugin::css_cache::CssCache;
use zenith_bundler::utils;
use zenith_bundler::{
    bundle_page, BuildMode, BundleError, BundleOptions, BundlePlan, CompilerOutput,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn create_temp_zen(content: &str) -> tempfile::NamedTempFile {
    let mut file = tempfile::Builder::new()
        .suffix(".zen")
        .tempfile()
        .expect("Failed to create temp file");
    file.write_all(content.as_bytes())
        .expect("Failed to write temp file");
    file
}

fn sha256(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

fn sha256_vec(data: &[String]) -> String {
    let mut hasher = Sha256::new();
    for item in data {
        hasher.update(item.as_bytes());
        hasher.update(b"|"); // deterministic separator
    }
    hex::encode(hasher.finalize())
}

// ===========================================================================
// 5.1 — Expression Stability Audit
// ===========================================================================

/// SHA256 of expression table must be identical across 3 builds.
#[tokio::test]
async fn expression_sha256_stable() {
    let content = r#"<div><h1>{title}</h1><p>{subtitle}</p><span>{count}</span></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let mut hashes = Vec::new();
    for _ in 0..3 {
        let plan = BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        };
        let result = bundle_page(plan, BundleOptions::default()).await.unwrap();
        hashes.push(sha256_vec(&result.expressions));
    }

    assert_eq!(hashes[0], hashes[1], "Build 1 vs 2 expression SHA differs");
    assert_eq!(hashes[1], hashes[2], "Build 2 vs 3 expression SHA differs");
}

/// Left-to-right, depth-first order preserved with 5+ expressions.
#[tokio::test]
async fn expression_order_multi() {
    let content =
        r#"<div title={a}><h1>{b}</h1><ul><li>{c}</li><li>{d}</li></ul><footer>{e}</footer></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert_eq!(
        result.expressions,
        vec!["a", "b", "c", "d", "e"],
        "Expression order must be left-to-right, depth-first"
    );
}

/// Inline output exports __zenith_expr.
#[tokio::test]
async fn inline_expr_in_output() {
    let file = create_temp_zen("<h1>{x}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Rolldown ESM: const decl + collected export
    assert!(
        result.entry_js.contains("const __zenith_expr"),
        "Output must contain __zenith_expr binding"
    );
    assert!(
        result.entry_js.contains("export {"),
        "Output must have Rolldown collected export"
    );
}

/// Inline output exports __zenith_html.
#[tokio::test]
async fn inline_html_in_output() {
    let file = create_temp_zen("<h1>{x}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Rolldown ESM: const decl + collected export
    assert!(
        result.entry_js.contains("const __zenith_html"),
        "Output must contain __zenith_html binding"
    );
    assert!(
        result.entry_js.contains("export {"),
        "Output must have Rolldown collected export"
    );
}

/// Inline vs Inline: expression SHA must be identical (path equivalence baseline).
#[tokio::test]
async fn inline_vs_inline_expression_sha_equal() {
    let content = r#"<div><h1>{title}</h1><button on:click={handler}>Go</button></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let plan1 = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let plan2 = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };

    let r1 = bundle_page(plan1, BundleOptions::default()).await.unwrap();
    let r2 = bundle_page(plan2, BundleOptions::default()).await.unwrap();

    assert_eq!(
        sha256_vec(&r1.expressions),
        sha256_vec(&r2.expressions),
        "Inline path equivalence: expression SHA must be identical"
    );
    assert_eq!(
        sha256(&r1.entry_js),
        sha256(&r2.entry_js),
        "Inline path equivalence: JS SHA must be identical"
    );
}

// ===========================================================================
// 5.2 — Module Isolation Guarantee
// ===========================================================================

/// Two different pages compiled concurrently must not have expression overlap.
#[tokio::test]
async fn concurrent_compile_no_overlap() {
    let file_a = create_temp_zen("<div>{page_a_var}</div>");
    let file_b = create_temp_zen("<div>{page_b_var}</div>");

    let path_a = file_a.path().to_string_lossy().to_string();
    let path_b = file_b.path().to_string_lossy().to_string();

    let (result_a, result_b) = tokio::join!(
        async {
            let plan = BundlePlan {
                page_path: path_a,
                out_dir: None,
                mode: BuildMode::Dev,
            };
            bundle_page(plan, BundleOptions::default()).await.unwrap()
        },
        async {
            let plan = BundlePlan {
                page_path: path_b,
                out_dir: None,
                mode: BuildMode::Dev,
            };
            bundle_page(plan, BundleOptions::default()).await.unwrap()
        }
    );

    // page_a expressions must NOT appear in page_b and vice versa
    assert_eq!(result_a.expressions, vec!["page_a_var"]);
    assert_eq!(result_b.expressions, vec!["page_b_var"]);

    // JS must only contain its own expressions
    assert!(result_a.entry_js.contains("page_a_var"));
    assert!(!result_a.entry_js.contains("page_b_var"));
    assert!(result_b.entry_js.contains("page_b_var"));
    assert!(!result_b.entry_js.contains("page_a_var"));
}

/// CSS cache keyed by page ID — no cross-pollination.
#[tokio::test]
async fn css_cache_no_cross_pollination() {
    let cache = CssCache::new();

    cache.insert("page_a", ".page-a { color: red }".into());
    cache.insert("page_b", ".page-b { color: blue }".into());

    let css_a = cache.get("page_a").unwrap();
    let css_b = cache.get("page_b").unwrap();

    assert!(css_a.contains("page-a"));
    assert!(
        !css_a.contains("page-b"),
        "CSS cache leaked page_b into page_a"
    );
    assert!(css_b.contains("page-b"));
    assert!(
        !css_b.contains("page-a"),
        "CSS cache leaked page_a into page_b"
    );
}

/// DashMap threaded stress test — 10 parallel writes/reads, atomic consistency.
#[tokio::test]
async fn dashmap_threaded_stress() {
    use dashmap::DashMap;

    let map: Arc<DashMap<String, Vec<String>>> = Arc::new(DashMap::new());
    let mut handles = Vec::new();

    for i in 0..10 {
        let map_clone = Arc::clone(&map);
        handles.push(thread::spawn(move || {
            let key = format!("page_{}", i);
            let exprs = vec![format!("expr_{}_a", i), format!("expr_{}_b", i)];
            map_clone.insert(key, exprs);
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // All 10 entries must exist with correct data
    assert_eq!(map.len(), 10);
    for i in 0..10 {
        let key = format!("page_{}", i);
        let entry = map.get(&key).unwrap();
        let exprs = entry.value();
        assert_eq!(exprs.len(), 2);
        assert_eq!(exprs[0], format!("expr_{}_a", i));
        assert_eq!(exprs[1], format!("expr_{}_b", i));
    }
}

/// CSS cache thread safety under parallel writes — no data race.
#[test]
fn css_cache_parallel_writes() {
    let cache = Arc::new(CssCache::new());
    let mut handles = Vec::new();

    for i in 0..10 {
        let cache_clone = Arc::clone(&cache);
        handles.push(thread::spawn(move || {
            let page_id = format!("page_{}", i);
            let css = format!(".page-{} {{ color: #{:06x} }}", i, i * 111111);
            cache_clone.insert(&page_id, css);
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    assert_eq!(cache.len(), 10);
    for i in 0..10 {
        let page_id = format!("page_{}", i);
        let css = cache.get(&page_id).unwrap();
        assert!(css.contains(&format!("page-{}", i)));
    }
}

// ===========================================================================
// 5.3 — Virtual Module Contract Seal
// ===========================================================================

/// Virtual ID format snapshot: \0zenith: prefix frozen.
#[test]
fn virtual_id_format_snapshot() {
    assert_eq!(utils::VIRTUAL_PREFIX, "\0zenith:");
    assert_eq!(utils::virtual_entry_id("home"), "\0zenith:entry:home");
    assert_eq!(utils::virtual_css_id("home"), "\0zenith:css:home");

    // Must always start with null byte
    assert!(utils::virtual_entry_id("x").starts_with('\0'));
    assert!(utils::virtual_css_id("x").starts_with('\0'));
}

/// is_zenith_virtual_id correctly identifies internal IDs.
#[test]
fn is_zenith_virtual_id_works() {
    assert!(utils::is_zenith_virtual_id("\0zenith:entry:home"));
    assert!(utils::is_zenith_virtual_id("\0zenith:css:about"));
    assert!(utils::is_zenith_virtual_id("\0zenith:page-script:index"));
    assert!(!utils::is_zenith_virtual_id("./component.zen"));
    assert!(!utils::is_zenith_virtual_id("react"));
    assert!(!utils::is_zenith_virtual_id("zenith:fake")); // no null byte
}

/// User code importing virtual IDs → hard error.
#[test]
fn reject_external_zenith_import() {
    // Direct null-byte prefix → rejected
    let result = utils::reject_external_zenith_import("\0zenith:entry:hack");
    assert!(result.is_err());
    match result.unwrap_err() {
        BundleError::ValidationError(msg) => {
            assert!(
                msg.contains("reserved"),
                "Error should mention reserved namespace"
            );
        }
        e => panic!("Expected ValidationError, got: {:?}", e),
    }

    // Escaped null byte attempt → rejected
    assert!(utils::reject_external_zenith_import("\\0zenith:entry:hack").is_err());

    // URL-encoded null byte attempt → rejected
    assert!(utils::reject_external_zenith_import("%00zenith:entry:hack").is_err());
}

/// Normal specifiers must pass through.
#[test]
fn normal_specifiers_pass_through() {
    assert!(utils::reject_external_zenith_import("./header.zen").is_ok());
    assert!(utils::reject_external_zenith_import("react").is_ok());
    assert!(utils::reject_external_zenith_import("@zenith/runtime").is_ok());
    assert!(utils::reject_external_zenith_import("../utils.js").is_ok());
}

/// Virtual ID collision impossible: user file literally named with \0 cannot override.
#[test]
fn virtual_id_collision_impossible() {
    // A user file path should never start with null byte
    // Even if it did, is_zen_file would still detect ".zen" extension
    // But reject_external_zenith_import catches it at resolution time
    let fake_path = "\0zenith:entry:evil.zen";
    assert!(utils::reject_external_zenith_import(fake_path).is_err());

    // A regular file with "zenith" in the name is fine
    assert!(utils::reject_external_zenith_import("zenith-component.zen").is_ok());
}

/// Invalid/malformed virtual ID → None from extract_page_id.
#[test]
fn invalid_virtual_id_returns_none() {
    assert_eq!(utils::extract_page_id("not-a-virtual-id"), None);
    assert_eq!(utils::extract_page_id("zenith:entry:fake"), None); // no null byte
    assert_eq!(utils::extract_page_id(""), None);
    assert_eq!(utils::extract_page_id("\0other:prefix"), None);
}

// ===========================================================================
// 5.4 — Compiler Strict Mode Sync
// ===========================================================================

/// Both inline paths produce the same error variant on mismatch.
#[tokio::test]
async fn strict_inline_and_rolldown_mirror_count() {
    let file = create_temp_zen("<h1>{title}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let metadata = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<!-- ZENITH_STYLES_ANCHOR -->".to_string(),
        expressions: vec!["title".into(), "extra".into()],
        imports: Default::default(),
        server_script: Default::default(),
        prerender: false,
        ssr_data: Default::default(),
        hoisted: Default::default(),
        components_scripts: Default::default(),
        component_instances: Default::default(),
        signals: Default::default(),
        expression_bindings: Default::default(),
        marker_bindings: Default::default(),
        event_bindings: Default::default(),
        ref_bindings: Default::default(),
        style_blocks: Default::default(),
    };

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let opts = BundleOptions {
        metadata: Some(metadata),
        strict: true,
        ..Default::default()
    };

    let result = bundle_page(plan, opts).await;
    assert!(result.is_err());

    // Must be ExpressionMismatch specifically — not a generic error
    match result.unwrap_err() {
        BundleError::ExpressionMismatch { expected, got } => {
            assert_eq!(expected, 2);
            assert_eq!(got, 1);
        }
        e => panic!("Expected ExpressionMismatch variant, got: {:?}", e),
    }
}

/// Strict mode content mismatch produces ExpressionContentMismatch variant.
#[tokio::test]
async fn strict_inline_and_rolldown_mirror_content() {
    let file = create_temp_zen("<h1>{title}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let metadata = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<!-- ZENITH_STYLES_ANCHOR -->".to_string(),
        expressions: vec!["wrong_name".into()],
        imports: Default::default(),
        server_script: Default::default(),
        prerender: false,
        ssr_data: Default::default(),
        hoisted: Default::default(),
        components_scripts: Default::default(),
        component_instances: Default::default(),
        signals: Default::default(),
        expression_bindings: Default::default(),
        marker_bindings: Default::default(),
        event_bindings: Default::default(),
        ref_bindings: Default::default(),
        style_blocks: Default::default(),
    };

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let opts = BundleOptions {
        metadata: Some(metadata),
        strict: true,
        ..Default::default()
    };

    let result = bundle_page(plan, opts).await;
    assert!(result.is_err());

    match result.unwrap_err() {
        BundleError::ExpressionContentMismatch {
            index,
            expected,
            got,
        } => {
            assert_eq!(index, 0);
            assert_eq!(expected, "wrong_name");
            assert_eq!(got, "title");
        }
        e => panic!("Expected ExpressionContentMismatch variant, got: {:?}", e),
    }
}

// ===========================================================================
// 5.5 — Missing Determinism Invariants
// ===========================================================================

/// Rolldown commit pin enforcement.
/// If the Rolldown git revision changes, this test MUST be updated.
#[test]
fn rolldown_commit_pinned() {
    assert_eq!(
        utils::EXPECTED_ROLLDOWN_COMMIT,
        "67a1f58",
        "Rolldown commit pin changed — determinism guarantees must be re-validated"
    );
}

/// Output asset order: JS chunk always emitted for same input.
/// When bundling the same input twice, the output format is identical.
#[tokio::test]
async fn output_asset_order_stable() {
    let content = r#"<div><h1>{title}</h1><p>{body}</p></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let mut js_hashes = Vec::new();
    for _ in 0..3 {
        let plan = BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        };
        let result = bundle_page(plan, BundleOptions::default()).await.unwrap();
        js_hashes.push(sha256(&result.entry_js));
    }

    assert_eq!(
        js_hashes[0], js_hashes[1],
        "Asset order drift between build 1 and 2"
    );
    assert_eq!(
        js_hashes[1], js_hashes[2],
        "Asset order drift between build 2 and 3"
    );
}

/// HTML SHA stability: same input → identical HTML in output.
#[tokio::test]
async fn html_sha_stable() {
    let content = r#"<section><h1>{heading}</h1><article>{content}</article></section>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let mut html_hashes = Vec::new();
    for _ in 0..3 {
        let plan = BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        };
        let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

        // Extract the HTML from the JS output (between backticks in __zenith_html)
        let js = &result.entry_js;
        if let Some(start) = js.find("const __zenith_html = `") {
            let html_start = start + "const __zenith_html = `".len();
            if let Some(end) = js[html_start..].find("`;") {
                let html = &js[html_start..html_start + end];
                html_hashes.push(sha256(html));
            }
        }
    }

    assert_eq!(html_hashes.len(), 3, "Failed to extract HTML from output");
    assert_eq!(
        html_hashes[0], html_hashes[1],
        "HTML SHA drift between builds 1-2"
    );
    assert_eq!(
        html_hashes[1], html_hashes[2],
        "HTML SHA drift between builds 2-3"
    );
}

/// Full output directory SHA: entry_js + expressions combined hash is stable.
#[tokio::test]
async fn full_output_sha_stable() {
    let content =
        r#"<div id="app"><h1>{title}</h1><button on:click={handler}>Click</button></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let mut output_hashes = Vec::new();
    for _ in 0..3 {
        let plan = BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        };
        let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

        // Combined hash: JS + expression list
        let mut hasher = Sha256::new();
        hasher.update(result.entry_js.as_bytes());
        for e in &result.expressions {
            hasher.update(e.as_bytes());
        }
        output_hashes.push(hex::encode(hasher.finalize()));
    }

    assert_eq!(output_hashes[0], output_hashes[1]);
    assert_eq!(output_hashes[1], output_hashes[2]);
}

/// Export shape snapshot: named exports, not default-only.
#[tokio::test]
async fn export_shape_snapshot() {
    let file = create_temp_zen("<div>{x}</div>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Must have named exports
    assert!(result.entry_js.contains("const __zenith_html"));
    assert!(result.entry_js.contains("const __zenith_expr"));
    assert!(result.entry_js.contains("const __zenith_contract"));
    // Must have default export via collected export
    assert!(result.entry_js.contains("__zenith_page as default"));
    // __zenith_expr must be an array literal
    assert!(result.entry_js.contains("__zenith_expr = ["));
}

/// Expression table is a const binding, not let or var.
#[tokio::test]
async fn expression_binding_is_const() {
    let file = create_temp_zen("<p>{value}</p>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Must use `const`, never `let` or `var`
    assert!(result.entry_js.contains("const __zenith_expr"));
    assert!(!result.entry_js.contains("let __zenith_expr"));
    assert!(!result.entry_js.contains("var __zenith_expr"));
}

/// Export order: __zenith_html comes before __zenith_expr.
#[tokio::test]
async fn export_order_html_before_expr() {
    let file = create_temp_zen("<div>{x}</div>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    let html_pos = result.entry_js.find("__zenith_html").unwrap();
    let expr_pos = result.entry_js.find("__zenith_expr").unwrap();
    assert!(
        html_pos < expr_pos,
        "__zenith_html must appear before __zenith_expr in output"
    );
}

#[tokio::test]
// Re-enabled: fixed potential hang by using pure path resolution in loader
async fn deep_topo_css_order_a_b_c() {
    // A -> B -> C
    // Expected CSS: C, then B, then A
    let dir = tempfile::tempdir().unwrap();
    let path_a = dir.path().join("a.zen");
    let path_b = dir.path().join("b.zen");
    let path_c = dir.path().join("c.zen");

    std::fs::write(
        &path_c,
        r#"
        <div>
            <div class="c">C</div>
            <style>.c { color: blue; }</style>
        </div>
    "#,
    )
    .unwrap();

    std::fs::write(
        &path_b,
        r#"
        <script lang="ts">
            import C from './c.zen';
        </script>
        <div>
            <div class="b">B</div>
            <C />
            <style>.b { color: green; }</style>
        </div>
    "#,
    )
    .unwrap();

    std::fs::write(
        &path_a,
        r#"
        <script lang="ts">
            import B from './b.zen';
        </script>
        <div>
            <div class="a">A</div>
            <B />
            <style>.a { color: red; }</style>
        </div>
    "#,
    )
    .unwrap();

    let plan = BundlePlan {
        page_path: path_a.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Verify CSS presence and order
    let css = result.css.expect("CSS should be present");

    // Find indices of each style block
    let idx_c = css.find(".c { color: blue; }").expect("Missing C styles");
    let idx_b = css.find(".b { color: green; }").expect("Missing B styles");
    let idx_a = css.find(".a { color: red; }").expect("Missing A styles");

    assert!(
        idx_c < idx_b,
        "C styles must precede B styles (Dependency first)"
    );
    assert!(
        idx_b < idx_a,
        "B styles must precede A styles (Dependency first)"
    );

    // Also verify strict newline enforcement (CRLF -> LF)
    // We already have a test for that, but checking here doesn't hurt.
    assert!(!css.contains("\r\n"), "CSS must not contain CRLF");
}
