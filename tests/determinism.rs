use sha2::{Digest, Sha256};
use std::io::Write;
use zenith_bundler::{bundle_page, BuildMode, BundleOptions, BundlePlan, BundleResult};

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

async fn bundle(content: &str, _name: &str) -> (String, BundleResult) {
    let file = create_temp_zen(content);
    let plan = BundlePlan {
        page_path: file.path().to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();
    (result.entry_js.clone(), result)
}

fn sha256(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hex::encode(hasher.finalize())
}

// ============================================================================
// M2: Deterministic output
// ============================================================================

#[tokio::test]
async fn deterministic_build_identical_bytes() {
    let content = r#"<div id="app"><h1>{title}</h1><button on:click={go}>Go</button></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    // Build 1
    let plan1 = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result1 = bundle_page(plan1, BundleOptions::default()).await.unwrap();

    // Build 2
    let plan2 = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let result2 = bundle_page(plan2, BundleOptions::default()).await.unwrap();

    // Identical bytes
    let hash1 = sha256(&result1.entry_js);
    let hash2 = sha256(&result2.entry_js);
    assert_eq!(hash1, hash2, "Builds must produce identical bytes");
}

#[tokio::test]
async fn deterministic_expressions_order() {
    let content = r#"<div title={a}><span class={b}>{c}</span><p>{d}</p></div>"#;
    let file = create_temp_zen(content);
    let path = file.path().to_string_lossy().to_string();

    let plan = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Dev,
    };

    let result = bundle_page(plan, BundleOptions::default()).await.unwrap();

    // Must be left-to-right, depth-first (compiler guarantee preserved through bundler)
    assert_eq!(result.expressions, vec!["a", "b", "c", "d"]);
}

#[tokio::test]
async fn deterministic_static_page_hash() {
    let file = create_temp_zen("<div>Static Content</div>");
    let path = file.path().to_string_lossy().to_string();

    let plan1 = BundlePlan {
        page_path: path.clone(),
        out_dir: None,
        mode: BuildMode::Prod,
    };
    let result1 = bundle_page(plan1, BundleOptions::default()).await.unwrap();

    let plan2 = BundlePlan {
        page_path: path,
        out_dir: None,
        mode: BuildMode::Prod,
    };
    let result2 = bundle_page(plan2, BundleOptions::default()).await.unwrap();

    assert_eq!(sha256(&result1.entry_js), sha256(&result2.entry_js),);
}

#[tokio::test]
async fn different_input_different_output() {
    let file_a = create_temp_zen("<div>{a}</div>");
    let file_b = create_temp_zen("<div>{b}</div>");

    let plan_a = BundlePlan {
        page_path: file_a.path().to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let plan_b = BundlePlan {
        page_path: file_b.path().to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };

    let result_a = bundle_page(plan_a, BundleOptions::default()).await.unwrap();
    let result_b = bundle_page(plan_b, BundleOptions::default()).await.unwrap();

    assert_ne!(
        sha256(&result_a.entry_js),
        sha256(&result_b.entry_js),
        "Different inputs must produce different outputs"
    );
}
// ---------------------------------------------------------------------------
// Symbol Table Determinism
// ---------------------------------------------------------------------------

#[tokio::test]
async fn internal_binding_order_snapshot() {
    let (_, result) = bundle("<h1>{t}</h1>", "page.zen").await;
    let js = result.entry_js;

    // Rolldown ESM hoisting order must be stable
    let html_pos = js.find("const __zenith_html").unwrap();
    let expr_pos = js.find("const __zenith_expr").unwrap();
    let page_pos = js.find("function __zenith_page").unwrap();
    let export_pos = js.find("export {").unwrap();

    assert!(
        html_pos < expr_pos,
        "html binding must precede expr binding"
    );
    assert!(
        expr_pos < page_pos,
        "expr binding must precede page function"
    );
    assert!(
        page_pos < export_pos,
        "page function must precede export statement"
    );
}

// ---------------------------------------------------------------------------
// Escaping Determinism
// ---------------------------------------------------------------------------

#[tokio::test]
async fn template_literal_escape_snapshot() {
    // Backticks and ${ must be escaped in HTML template
    let (_, result) = bundle(
        r#"<div title="`backtick`" data-x="${expr}"></div>"#,
        "page.zen",
    )
    .await;

    // HTML matches exactly: backticks => \`, ${ => \${
    // Note: The HTML is inside a template literal `...`
    // So to include a backtick it must be `\`
    // To include ${ it must be $\
    // But wait, Zenith compiler output escaping logic:
    // escape_js_template_literal turns ` -> \` and ${ -> \${

    // In the emitted JS:
    // const __zenith_html = `<div title="\`backtick\`" data-x="\${expr}"></div>`;

    assert!(
        result.entry_js.contains(r#"\`backtick\`"#),
        "Backticks must be escaped in template literal"
    );
    assert!(
        result.entry_js.contains(r#"\${expr}"#),
        "${{ must be escaped in template literal"
    );
}

#[tokio::test]
async fn expression_string_escape_snapshot() {
    // Quotes, backslashes, newlines in EXPRESSIONS (strings)
    // " -> \"
    // \ -> \\
    // \n -> \n (literal slash n)
    // Let's try bundling a file with string literal expressions
    let (_, result) = bundle("<div>{ `quote \" \\ \n` }</div>", "page.zen").await;
    // The expression string is captured as-is: `quote " \ \n` (including quotes if it's a string literal?)
    // Wait, Zenith compiler `transform` captures the *content* of the expression brace.
    // Parser behavior: `{ ... }` -> captures content string.

    // If input is: <div>{ "a" }</div>
    // Expression is: ` "a" ` (with spaces/quotes)

    // Let's test with ` "a \" b" `
    let (_, r2) = bundle(r#"<div>{ "a \" b" }</div>"#, "quote.zen").await;
    // Expected expression: ` "a \" b" `
    // In injected JS string array: `[ "... "a \" b" ..." ]`
    // So the double quotes inside the string literal must be escaped.

    // Check if output contains escaped quote
    assert!(
        r2.entry_js.contains(r#"\"a \\\" b\""#),
        "Double quotes and backslashes must be escaped in expression array"
    );

    // Ensure first result didn't crash (semantics check only)
    assert!(result.entry_js.contains("quote"));
}

#[tokio::test]
async fn newline_normalization_stable() {
    // CRLF input vs LF input -> Identical Output SHA
    // Strategy: Use two separate temp dirs, but create a file with the SAME NAME in each.
    // This ensures `page_id` (derived from stem) is identical, so module IDs match.
    // But physically they are different files, avoiding lock contention/hanging.

    let dir_lf = tempfile::tempdir().unwrap();
    let dir_crlf = tempfile::tempdir().unwrap();

    let path_lf = dir_lf.path().join("page.zen");
    let path_crlf = dir_crlf.path().join("page.zen");

    let lf_input = "<div>\n<p>Hello</p>\n</div>";
    let crlf_input = "<div>\r\n<p>Hello</p>\r\n</div>";

    std::fs::write(&path_lf, lf_input).unwrap();
    std::fs::write(&path_crlf, crlf_input).unwrap();

    let plan_lf = BundlePlan {
        page_path: path_lf.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let res_lf = bundle_page(plan_lf, BundleOptions::default())
        .await
        .unwrap();

    let plan_crlf = BundlePlan {
        page_path: path_crlf.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let res_crlf = bundle_page(plan_crlf, BundleOptions::default())
        .await
        .unwrap();

    assert_eq!(
        sha256(&res_lf.entry_js),
        sha256(&res_crlf.entry_js),
        "Output must be identical regardless of input newline format (CRLF vs LF)"
    );
}

#[tokio::test]
async fn os_independent_hash_snapshot() {
    // Verify that bundling the same content from different directory structures
    // (simulating different OS paths or deep nesting) yields identical output hashes.
    // This confirms no absolute paths leak into the output.

    let dir_a = tempfile::tempdir().unwrap();
    let dir_b = tempfile::tempdir().unwrap();

    // Deeply nested structure A
    let path_a = dir_a.path().join("users/me/projects/zenith/page.zen");
    std::fs::create_dir_all(path_a.parent().unwrap()).unwrap();

    // Different structure B
    let path_b = dir_b.path().join("var/www/html/site/page.zen");
    std::fs::create_dir_all(path_b.parent().unwrap()).unwrap();

    let content = "<h1>Same Content</h1>";
    std::fs::write(&path_a, content).unwrap();
    std::fs::write(&path_b, content).unwrap();

    let plan_a = BundlePlan {
        page_path: path_a.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let res_a = bundle_page(plan_a, BundleOptions::default()).await.unwrap();

    let plan_b = BundlePlan {
        page_path: path_b.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Dev,
    };
    let res_b = bundle_page(plan_b, BundleOptions::default()).await.unwrap();

    assert_eq!(
        sha256(&res_a.entry_js),
        sha256(&res_b.entry_js),
        "Output hash must be identical regardless of directory structure (OS independence)"
    );
}

#[tokio::test]
async fn hash_stays_stable_when_compiler_normalizes_expression_whitespace() {
    // Process boundary contract: bundler consumes compiler IR as-is.
    // Current compiler output canonicalizes `{a}` and `{ a }` to the same expression token.
    // Bundler must therefore emit identical output for both sources.

    let dir = tempfile::tempdir().unwrap();
    let path_compact = dir.path().join("compact.zen");
    let path_loose = dir.path().join("loose.zen");

    std::fs::write(&path_compact, "<div>{a}</div>").unwrap();
    std::fs::write(&path_loose, "<div>{ a }</div>").unwrap();

    let plan_compact = BundlePlan {
        page_path: path_compact.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Prod,
    };
    let res_compact = bundle_page(plan_compact, BundleOptions::default())
        .await
        .unwrap();

    let plan_loose = BundlePlan {
        page_path: path_loose.to_string_lossy().to_string(),
        out_dir: None,
        mode: BuildMode::Prod,
    };
    let res_loose = bundle_page(plan_loose, BundleOptions::default())
        .await
        .unwrap();

    assert_eq!(
        sha256(&res_compact.entry_js),
        sha256(&res_loose.entry_js),
        "Output hash MUST remain identical when compiler emits canonicalized expression payloads."
    );

    // Verify canonicalized expression payload
    assert!(res_compact.entry_js.contains("\"a\""));
    assert!(res_loose.entry_js.contains("\"a\""));
}
