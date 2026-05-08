//! Module graph strict-mode and output stability tests.

use sha2::{Digest, Sha256};
use std::io::Write;
use zenith_bundler::{
    bundle_page, BuildMode, BundleError, BundleOptions, BundlePlan, CompilerOutput,
};

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

#[tokio::test]
async fn strict_inline_and_rolldown_mirror_count() {
    let file = create_temp_zen("<h1>{props.title}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let metadata = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<!-- ZENITH_STYLES_ANCHOR -->".to_string(),
        expressions: vec!["props.title".into(), "extra".into()],
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
        image_materialization: Default::default(),
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
        BundleError::ExpressionMismatch { expected, got } => {
            assert_eq!(expected, 2);
            assert_eq!(got, 1);
        }
        e => panic!("Expected ExpressionMismatch variant, got: {:?}", e),
    }
}

#[tokio::test]
async fn strict_inline_and_rolldown_mirror_content() {
    let file = create_temp_zen("<h1>{props.title}</h1>");
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
        image_materialization: Default::default(),
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
            assert_eq!(got, "props.title");
        }
        e => panic!("Expected ExpressionContentMismatch variant, got: {:?}", e),
    }
}

#[tokio::test]
async fn output_asset_order_stable() {
    let content = r#"<div><h1>{props.title}</h1><p>{props.body}</p></div>"#;
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

#[tokio::test]
async fn html_sha_stable() {
    let content =
        r#"<section><h1>{props.heading}</h1><article>{props.content}</article></section>"#;
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

#[tokio::test]
async fn full_output_sha_stable() {
    let content = r#"<div id="app"><h1>{props.title}</h1><button on:click={props.handler}>Click</button></div>"#;
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

#[tokio::test]
async fn export_shape_snapshot() {
    let file = create_temp_zen("<div>{props.x}</div>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert!(result.entry_js.contains("const __zenith_html"));
    assert!(result.entry_js.contains("const __zenith_expr"));
    assert!(result.entry_js.contains("const __zenith_contract"));
    assert!(result.entry_js.contains("__zenith_page as default"));
    assert!(result.entry_js.contains("__zenith_expr = ["));
}

#[tokio::test]
async fn expression_binding_is_const() {
    let file = create_temp_zen("<p>{props.value}</p>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert!(result.entry_js.contains("const __zenith_expr"));
    assert!(!result.entry_js.contains("let __zenith_expr"));
    assert!(!result.entry_js.contains("var __zenith_expr"));
}

#[tokio::test]
async fn export_order_html_before_expr() {
    let file = create_temp_zen("<div>{props.x}</div>");
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
