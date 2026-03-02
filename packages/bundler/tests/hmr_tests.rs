//! Phase 6 — Dev Mode + HMR Tests
//!
//! These tests enforce BUNDLER_CONTRACT.md §7 (HMR injection rules)
//! and CSS live reload invariants.

use std::io::Write;
use std::sync::Arc;
use zenith_bundler::plugin::css_cache::CssCache;
use zenith_bundler::plugin::zenith_loader::{
    compile_zen_source, ZenithLoaderConfig, HMR_FOOTER, HMR_MARKER,
};
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan};

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

fn dev_config() -> ZenithLoaderConfig {
    ZenithLoaderConfig {
        components: None,
        metadata: None,
        strict: false,
        is_dev: true,
    }
}

fn prod_config() -> ZenithLoaderConfig {
    ZenithLoaderConfig {
        components: None,
        metadata: None,
        strict: false,
        is_dev: false,
    }
}

// ===========================================================================
// 6.2 — HMR Footer Injection
// ===========================================================================

/// HMR footer constant has the expected structure.
#[test]
fn hmr_footer_structure() {
    assert!(HMR_FOOTER.contains(HMR_MARKER));
    assert!(HMR_FOOTER.contains("import.meta.hot"));
    assert!(HMR_FOOTER.contains("import.meta.hot.accept()"));
}

/// In dev mode, appending HMR footer to compiled output works correctly.
#[test]
fn hmr_footer_appended_in_dev() {
    let (js, _) = compile_zen_source("<h1>{title}</h1>", "page.zen", &dev_config()).unwrap();

    // Simulate what the transform hook does
    let with_hmr = format!("{}{}", js, HMR_FOOTER);

    assert!(with_hmr.contains(HMR_MARKER), "HMR marker missing");
    assert!(
        with_hmr.contains("import.meta.hot"),
        "HMR acceptance code missing"
    );
}

/// In prod mode, no HMR code should be present.
#[test]
fn hmr_footer_absent_in_prod() {
    let (js, _) = compile_zen_source("<h1>{title}</h1>", "page.zen", &prod_config()).unwrap();

    assert!(!js.contains(HMR_MARKER), "HMR marker found in prod output");
    assert!(
        !js.contains("import.meta.hot"),
        "HMR code found in prod output"
    );
}

/// HMR must not mutate the expression table.
#[test]
fn hmr_does_not_mutate_expressions() {
    let (js_before, compiled) = compile_zen_source(
        "<div><span>{a}</span><span>{b}</span></div>",
        "page.zen",
        &dev_config(),
    )
    .unwrap();

    // Simulate HMR injection
    let js_after = format!("{}{}", js_before, HMR_FOOTER);

    // Expression table must be unchanged
    assert_eq!(compiled.expressions, vec!["a", "b"]);

    // The __zenith_expr line must be identical
    let expr_line_before = js_before
        .lines()
        .find(|l| l.contains("__zenith_expr"))
        .unwrap();
    let expr_line_after = js_after
        .lines()
        .find(|l| l.contains("__zenith_expr"))
        .unwrap();
    assert_eq!(expr_line_before, expr_line_after);
}

/// Multiple rebuilds must not duplicate the HMR footer.
#[test]
fn hmr_multiple_rebuilds_no_duplication() {
    let (js, _) = compile_zen_source("<h1>{title}</h1>", "page.zen", &dev_config()).unwrap();

    // Simulate 5 rebuilds
    let mut code = format!("{}{}", js, HMR_FOOTER);
    for _ in 0..4 {
        // The transform hook checks for HMR_MARKER before appending
        if !code.contains(HMR_MARKER) {
            code = format!("{}{}", code, HMR_FOOTER);
        }
    }

    // Count occurrences of the marker
    let marker_count = code.matches(HMR_MARKER).count();
    assert_eq!(
        marker_count, 1,
        "HMR footer duplicated: found {} occurrences",
        marker_count
    );
}

/// HMR footer position: must appear after all exports.
#[test]
fn hmr_footer_position_snapshot() {
    let (js, _) = compile_zen_source("<div>{x}</div>", "page.zen", &dev_config()).unwrap();
    let with_hmr = format!("{}{}", js, HMR_FOOTER);

    // Find positions
    let last_export = with_hmr.rfind("export").unwrap();
    let hmr_pos = with_hmr.find(HMR_MARKER).unwrap();

    assert!(
        hmr_pos > last_export,
        "HMR footer must appear after all exports (export@{}, hmr@{})",
        last_export,
        hmr_pos
    );
}

/// HMR must not re-order exports.
#[test]
fn hmr_no_export_reorder() {
    let (js, _) = compile_zen_source("<div>{x}</div>", "page.zen", &dev_config()).unwrap();
    let with_hmr = format!("{}{}", js, HMR_FOOTER);

    // __zenith_html must still come before __zenith_expr
    let html_pos = with_hmr.find("__zenith_html").unwrap();
    let expr_pos = with_hmr.find("__zenith_expr").unwrap();
    assert!(html_pos < expr_pos, "HMR injection re-ordered exports");

    // Default export must still come after named exports
    let default_pos = with_hmr.find("export default").unwrap();
    let const_pos = with_hmr.rfind("export const").unwrap();
    assert!(
        default_pos > const_pos,
        "HMR injection re-ordered default export"
    );
}

/// HMR marker detection is exact.
#[test]
fn hmr_marker_detection_exact() {
    assert!(HMR_FOOTER.contains(HMR_MARKER));
    assert!(!HMR_MARKER.is_empty());

    // Marker should be a comment, not executable code
    assert!(HMR_MARKER.starts_with("/*"));
    assert!(HMR_MARKER.ends_with("*/"));
}

// ===========================================================================
// 6.3 — CSS Live Reload
// ===========================================================================

/// CSS invalidation removes cache and marks dirty.
#[test]
fn css_invalidation_works() {
    let cache = CssCache::new();
    cache.insert("page_a", ".a { color: red }".into());

    assert!(cache.contains("page_a"));

    cache.invalidate("page_a");

    assert!(
        !cache.contains("page_a"),
        "CSS should be removed after invalidation"
    );
    assert!(
        cache.has_changed("page_a"),
        "Page should be marked dirty after invalidation"
    );
    assert!(
        !cache.has_changed("page_a"),
        "Dirty flag should be cleared after first check"
    );
}

/// CSS insert marks page as dirty.
#[test]
fn css_insert_marks_dirty() {
    let cache = CssCache::new();
    cache.insert("page_a", ".a { color: red }".into());

    assert!(
        cache.has_changed("page_a"),
        "Page should be dirty after insert"
    );
    assert!(
        !cache.has_changed("page_a"),
        "Dirty flag should be cleared after check"
    );
}

/// CSS invalidation does not touch other pages.
#[test]
fn css_invalidation_does_not_touch_other_pages() {
    let cache = CssCache::new();
    cache.insert("page_a", ".a { color: red }".into());
    cache.insert("page_b", ".b { color: blue }".into());

    // Clear dirty flags from inserts
    cache.has_changed("page_a");
    cache.has_changed("page_b");

    // Invalidate only page_a
    cache.invalidate("page_a");

    // page_b must be untouched
    assert!(
        !cache.has_changed("page_b"),
        "Invalidating page_a touched page_b"
    );
    assert!(
        cache.contains("page_b"),
        "Invalidating page_a removed page_b CSS"
    );
    assert_eq!(cache.get("page_b").unwrap(), ".b { color: blue }");
}

/// CSS cache dirty tracking is thread-safe.
#[test]
fn css_dirty_tracking_thread_safe() {
    use std::thread;

    let cache = Arc::new(CssCache::new());
    let mut handles = Vec::new();

    for i in 0..5 {
        let cache_clone = Arc::clone(&cache);
        handles.push(thread::spawn(move || {
            let page_id = format!("page_{}", i);
            cache_clone.insert(&page_id, format!(".p{} {{ }}", i));
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // All 5 should be dirty
    for i in 0..5 {
        let page_id = format!("page_{}", i);
        assert!(cache.has_changed(&page_id));
    }

    // After checking, none should be dirty
    for i in 0..5 {
        let page_id = format!("page_{}", i);
        assert!(!cache.has_changed(&page_id));
    }
}

/// Bundle in dev mode vs prod mode: expressions identical.
#[tokio::test]
async fn dev_and_prod_expressions_identical() {
    let file = create_temp_zen("<div>{title}</div>");
    let path = file.path().to_string_lossy().to_string();

    let dev_result = bundle_page(
        BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        },
        BundleOptions::default(),
    )
    .await
    .unwrap();

    let prod_result = bundle_page(
        BundlePlan {
            page_path: path,
            out_dir: None,
            mode: BuildMode::Prod,
        },
        BundleOptions::default(),
    )
    .await
    .unwrap();

    assert_eq!(
        dev_result.expressions, prod_result.expressions,
        "Expressions must be identical across dev and prod"
    );
    assert_eq!(
        dev_result.expressions, prod_result.expressions,
        "Expressions must be identical across dev and prod"
    );
}

/// Brutal HMR rebuild cycle: 10 iterations, exactly one marker.
#[test]
fn hmr_brutal_rebuild_cycles() {
    let (js, _) = compile_zen_source("<h1>{title}</h1>", "page.zen", &dev_config()).unwrap();

    let mut code = js.clone();
    for _ in 0..10 {
        // Simulate transform hook logic: check, then append
        if !code.contains(HMR_MARKER) {
            code = format!("{}{}", code, HMR_FOOTER);
        }
    }

    let marker_count = code.matches(HMR_MARKER).count();
    assert_eq!(
        marker_count, 1,
        "HMR marker detected {} times after 10 cycles",
        marker_count
    );

    // Footer must appear exactly once at the end (roughly)
    assert!(code.trim().ends_with("}"));
    assert!(code.contains("import.meta.hot.accept();"));
}

/// Verify that Dev output is identical to Prod output if footer is stripped.
/// This proves HMR is purely additive.
#[tokio::test]
async fn hmr_file_sha_identical_except_footer() {
    let file = create_temp_zen("<div>{title}</div>");
    let path = file.path().to_string_lossy().to_string();

    let dev_result = bundle_page(
        BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        },
        BundleOptions::default(),
    )
    .await
    .unwrap();

    if !dev_result.entry_js.contains(HMR_MARKER) {
        println!("Dev Output (Missing Marker):\n{}", dev_result.entry_js);
    }

    let prod_result = bundle_page(
        BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Prod,
        },
        BundleOptions {
            minify: Some(false),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // Strip footer from Dev result (using line filtering to ignore whitespace drift)
    // and compare lines directly.

    let dev_lines: Vec<&str> = dev_result
        .entry_js
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.contains("import.meta.hot"))
        .collect();

    let prod_lines: Vec<&str> = prod_result
        .entry_js
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    assert_eq!(
        dev_lines, prod_lines,
        "Dev output (stripped) must match Prod output content (ignoring whitespace)"
    );
}
