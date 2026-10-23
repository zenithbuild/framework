//! Module graph expression stability tests.

use sha2::{Digest, Sha256};
use std::io::Write;
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan};

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
        hasher.update(b"|");
    }
    hex::encode(hasher.finalize())
}

#[tokio::test]
async fn expression_sha256_stable() {
    let content =
        r#"<div><h1>{props.title}</h1><p>{props.subtitle}</p><span>{props.count}</span></div>"#;
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

#[tokio::test]
async fn expression_order_multi() {
    let content = r#"<div title={props.a}><h1>{props.b}</h1><ul><li>{props.c}</li><li>{props.d}</li></ul><footer>{props.e}</footer></div>"#;
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
        vec!["props.a", "props.b", "props.c", "props.d", "props.e"],
        "Expression order must be left-to-right, depth-first"
    );
}

#[tokio::test]
async fn inline_expr_in_output() {
    let file = create_temp_zen("<h1>{props.x}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert!(
        result.entry_js.contains("const __zenith_expr"),
        "Output must contain __zenith_expr binding"
    );
    assert!(
        result.entry_js.contains("export {"),
        "Output must have Rolldown collected export"
    );
}

#[tokio::test]
async fn inline_html_in_output() {
    let file = create_temp_zen("<h1>{props.x}</h1>");
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    assert!(
        result.entry_js.contains("const __zenith_html"),
        "Output must contain __zenith_html binding"
    );
    assert!(
        result.entry_js.contains("export {"),
        "Output must have Rolldown collected export"
    );
}

#[tokio::test]
async fn inline_vs_inline_expression_sha_equal() {
    let content =
        r#"<div><h1>{props.title}</h1><button on:click={props.handler}>Go</button></div>"#;
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

#[tokio::test]
async fn concurrent_compile_no_overlap() {
    let file_a = create_temp_zen("<div>{props.page_a_var}</div>");
    let file_b = create_temp_zen("<div>{props.page_b_var}</div>");

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

    assert_eq!(result_a.expressions, vec!["props.page_a_var"]);
    assert_eq!(result_b.expressions, vec!["props.page_b_var"]);

    assert!(result_a.entry_js.contains("props.page_a_var"));
    assert!(!result_a.entry_js.contains("props.page_b_var"));
    assert!(result_b.entry_js.contains("props.page_b_var"));
    assert!(!result_b.entry_js.contains("props.page_a_var"));
}
