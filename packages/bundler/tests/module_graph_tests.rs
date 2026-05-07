//! Deterministic module graph lock tests.

use std::sync::Arc;
use std::thread;
use zenith_bundler::plugin::css_cache::CssCache;
use zenith_bundler::utils;
use zenith_bundler::{bundle_page, BuildMode, BundleError, BundleOptions, BundlePlan};

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

#[test]
fn virtual_id_format_snapshot() {
    assert_eq!(utils::VIRTUAL_PREFIX, "\0zenith:");
    assert_eq!(utils::virtual_entry_id("home"), "\0zenith:entry:home");
    assert_eq!(utils::virtual_css_id("home"), "\0zenith:css:home");

    assert!(utils::virtual_entry_id("x").starts_with('\0'));
    assert!(utils::virtual_css_id("x").starts_with('\0'));
}

#[test]
fn is_zenith_virtual_id_works() {
    assert!(utils::is_zenith_virtual_id("\0zenith:entry:home"));
    assert!(utils::is_zenith_virtual_id("\0zenith:css:about"));
    assert!(utils::is_zenith_virtual_id("\0zenith:page-script:index"));
    assert!(!utils::is_zenith_virtual_id("./component.zen"));
    assert!(!utils::is_zenith_virtual_id("react"));
    assert!(!utils::is_zenith_virtual_id("zenith:fake"));
}

#[test]
fn reject_external_zenith_import() {
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

    assert!(utils::reject_external_zenith_import("\\0zenith:entry:hack").is_err());
    assert!(utils::reject_external_zenith_import("%00zenith:entry:hack").is_err());
}

#[test]
fn normal_specifiers_pass_through() {
    assert!(utils::reject_external_zenith_import("./header.zen").is_ok());
    assert!(utils::reject_external_zenith_import("react").is_ok());
    assert!(utils::reject_external_zenith_import("@zenith/runtime").is_ok());
    assert!(utils::reject_external_zenith_import("../utils.js").is_ok());
}

#[test]
fn virtual_id_collision_impossible() {
    let fake_path = "\0zenith:entry:evil.zen";
    assert!(utils::reject_external_zenith_import(fake_path).is_err());
    assert!(utils::reject_external_zenith_import("zenith-component.zen").is_ok());
}

#[test]
fn invalid_virtual_id_returns_none() {
    assert_eq!(utils::extract_page_id("not-a-virtual-id"), None);
    assert_eq!(utils::extract_page_id("zenith:entry:fake"), None);
    assert_eq!(utils::extract_page_id(""), None);
    assert_eq!(utils::extract_page_id("\0other:prefix"), None);
}

#[test]
fn rolldown_commit_pinned() {
    assert_eq!(
        utils::EXPECTED_ROLLDOWN_COMMIT,
        "67a1f58",
        "Rolldown commit pin changed - determinism guarantees must be re-validated"
    );
}

#[tokio::test]
async fn deep_topo_css_order_a_b_c() {
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

    let css = result.css.expect("CSS should be present");
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
    assert!(!css.contains("\r\n"), "CSS must not contain CRLF");
}
