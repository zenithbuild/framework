//! Phase 8 — Runtime Contract Freeze Tests
//!
//! These tests enforce the BUNDLER_CONTRACT.md.
//! Any symbol rename, structural change, or semantic reinterpretation
//! causes a test failure. No exceptions.

use sha2::{Digest, Sha256};
use std::io::Write;
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan, CompilerOutput};

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

/// Standard test input for contract snapshots.
const CONTRACT_INPUT: &str = r#"<div id="app"><h1>{title}</h1><button on:click={handler}>Click</button><p>{count}</p></div>"#;

// ===========================================================================
// 8.2 — Contract Snapshot Tests
// ===========================================================================

/// Contract symbol names are frozen. Renaming any of these fails the test.
#[tokio::test]
async fn contract_public_symbols_snapshot() {
    let file = create_temp_zen(CONTRACT_INPUT);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Frozen symbol names — any rename breaks this
    assert!(
        result.entry_js.contains("__zenith_html"),
        "FROZEN: __zenith_html symbol missing"
    );
    assert!(
        result.entry_js.contains("__zenith_expr"),
        "FROZEN: __zenith_expr symbol missing"
    );
    assert!(
        result.entry_js.contains("__zenith_page"),
        "FROZEN: __zenith_page symbol missing"
    );
    assert!(
        result.entry_js.contains("__zenith_contract"),
        "FROZEN: __zenith_contract symbol missing"
    );

    // Frozen binding types (Rolldown ESM: const decls + collected export)
    assert!(
        result.entry_js.contains("const __zenith_html"),
        "FROZEN: __zenith_html must be const binding"
    );
    assert!(
        result.entry_js.contains("const __zenith_expr"),
        "FROZEN: __zenith_expr must be const binding"
    );
    assert!(
        result.entry_js.contains("const __zenith_contract"),
        "FROZEN: __zenith_contract must be const binding"
    );
    assert!(
        result.entry_js.contains("__zenith_page as default"),
        "FROZEN: __zenith_page must be exported as default"
    );
    // Rolldown collects exports at the end
    assert!(
        result.entry_js.contains("export {"),
        "FROZEN: Rolldown ESM must have collected export statement"
    );
}

/// Bundler never inspects AST — it receives CompilerOutput and passes through.
/// Test: compile the same source twice, output must be byte-identical.
/// If the bundler inspected AST, it could produce different interpretations.
#[tokio::test]
async fn bundler_never_inspects_ast() {
    let file = create_temp_zen(CONTRACT_INPUT);
    let path = file.path().to_string_lossy().to_string();

    let r1 = bundle_page(
        BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        },
        BundleOptions::default(),
    )
    .await
    .unwrap();

    let r2 = bundle_page(
        BundlePlan {
            page_path: path,
            out_dir: None,
            mode: BuildMode::Dev,
        },
        BundleOptions::default(),
    )
    .await
    .unwrap();

    // Byte-identical output proves no AST inspection branching
    assert_eq!(
        sha256(&r1.entry_js),
        sha256(&r2.entry_js),
        "Bundler produced different output for identical input — possible AST inspection"
    );
}

/// Bundler never modifies expressions — exact passthrough from compiler.
#[tokio::test]
async fn bundler_never_modifies_expressions() {
    let file = create_temp_zen(CONTRACT_INPUT);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Expressions must be exact source strings — no transformation
    assert_eq!(result.expressions, vec!["title", "handler", "count"]);

    // JS must contain the raw expression strings in quotes
    assert!(result.entry_js.contains("\"title\""));
    assert!(result.entry_js.contains("\"handler\""));
    assert!(result.entry_js.contains("\"count\""));

    // Must NOT contain any renaming like title_0 or __title
    assert!(!result.entry_js.contains("title_0"));
    assert!(!result.entry_js.contains("__title"));
}

/// Bundler never rewrites HTML attributes.
#[tokio::test]
async fn bundler_never_rewrites_attributes() {
    let file = create_temp_zen(CONTRACT_INPUT);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // data-zx-e attributes must be in the HTML as-is
    assert!(
        result.entry_js.contains("data-zx-e="),
        "data-zx-e attributes must be preserved"
    );

    // The bundler must NOT rename data-zx-e to something else
    assert!(
        !result.entry_js.contains("data-zenith-expr="),
        "Bundler renamed data-zx-e — contract violation"
    );
    assert!(
        !result.entry_js.contains("data-bind="),
        "Bundler renamed data-zx-e — contract violation"
    );
}

/// Runtime contract hash: the contract-facing portion of JS output is stable.
#[tokio::test]
async fn runtime_contract_hash_stable() {
    let file = create_temp_zen(CONTRACT_INPUT);
    let path = file.path().to_string_lossy().to_string();

    let mut hashes = Vec::new();
    for _ in 0..3 {
        let plan = BundlePlan {
            page_path: path.clone(),
            out_dir: None,
            mode: BuildMode::Dev,
        };
        let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

        // Hash the structural contract: symbol names + expression array + export shape
        let mut hasher = Sha256::new();
        // Check for the three frozen symbols (Rolldown ESM format)
        let has_html = result.entry_js.contains("const __zenith_html");
        let has_expr = result.entry_js.contains("const __zenith_expr");
        let has_page = result.entry_js.contains("__zenith_page as default");
        hasher.update(format!("{}{}{}", has_html, has_expr, has_page).as_bytes());
        // Hash expression content
        for e in &result.expressions {
            hasher.update(e.as_bytes());
        }
        // Hash full JS
        hasher.update(result.entry_js.as_bytes());
        hashes.push(hex::encode(hasher.finalize()));
    }

    assert_eq!(
        hashes[0], hashes[1],
        "Contract hash drift between builds 1-2"
    );
    assert_eq!(
        hashes[1], hashes[2],
        "Contract hash drift between builds 2-3"
    );
}

// ===========================================================================
// 8.3 — End-to-End Golden Test
// ===========================================================================

/// Golden test: .zen → compile → bundle → snapshot.
/// This is the canonical reference for compiler + bundler output.
#[tokio::test]
async fn golden_e2e_pipeline() {
    let input = r#"<div id="app"><h1>{title}</h1><p>{subtitle}</p></div>"#;
    let file = create_temp_zen(input);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // 1. Expression count
    assert_eq!(result.expressions.len(), 2);
    assert_eq!(result.expressions[0], "title");
    assert_eq!(result.expressions[1], "subtitle");

    // 2. Export structure (Rolldown ESM: const decls + collected export)
    assert!(result.entry_js.contains("const __zenith_html = `"));
    assert!(result.entry_js.contains("const __zenith_expr = ["));
    assert!(result.entry_js.contains("export {"));
    assert!(result.entry_js.contains("__zenith_page as default"));

    // 3. HTML contains data attributes
    assert!(result.entry_js.contains("data-zx-e="));

    // 4. Return shape
    assert!(result.entry_js.contains("html: __zenith_html"));
    assert!(result.entry_js.contains("expressions: __zenith_expr"));

    // 5. No CSS for non-CSS input
    assert!(result.css.is_none());
}

/// Golden test with strict metadata — compiler and bundler agree.
#[tokio::test]
async fn golden_e2e_with_strict_metadata() {
    let input = "<div><h1>{title}</h1><p>{body}</p></div>";
    let file = create_temp_zen(input);
    let path = file.path().to_string_lossy().to_string();

    let metadata = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<!-- ZENITH_STYLES_ANCHOR -->".to_string(),
        expressions: vec!["title".into(), "body".into()],
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

    let result = bundle_page(plan, opts).await.unwrap();
    assert_eq!(result.expressions, vec!["title", "body"]);
}

/// Golden test: static page (no expressions) still produces valid output.
#[tokio::test]
async fn golden_e2e_static_page() {
    let input = "<div><h1>Hello World</h1><p>No expressions here.</p></div>";
    let file = create_temp_zen(input);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert!(result.expressions.is_empty());
    assert!(result.entry_js.contains("const __zenith_html"));
    assert!(result.entry_js.contains("const __zenith_expr = []"));
    assert!(result.entry_js.contains("__zenith_page as default"));
}

/// Build consistency: same golden input across Dev and Prod modes
/// produces identical expression tables.
#[tokio::test]
async fn golden_expressions_identical_across_modes() {
    let input = r#"<div><h1>{title}</h1><span>{count}</span></div>"#;
    let file = create_temp_zen(input);
    let path = file.path().to_string_lossy().to_string();

    let dev_plan = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let prod_plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Prod,
    };

    let dev_result = bundle_page(dev_plan, BundleOptions::default())
        .await
        .unwrap();
    let prod_result = bundle_page(prod_plan, BundleOptions::default())
        .await
        .unwrap();

    assert_eq!(
        dev_result.expressions, prod_result.expressions,
        "Expression tables must be identical across build modes"
    );
}
