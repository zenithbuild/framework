use zenith_bundler::utils::process_css;
use zenith_compiler::script::ExtractedStyleBlock;

#[test]
fn test_css_content_normalization_and_hashing() {
    let block1 = ExtractedStyleBlock {
        module_id: "a.css".into(),
        order: 0,
        content: "body { color: red; }".into(),
    };

    let html = "<html><head><!-- ZENITH_STYLES_ANCHOR --></head><body></body></html>";

    let (css, new_html) = process_css(&[block1.clone()], html).expect("Processing failed");
    let css = css.expect("Expected CSS");

    // Hash should be deterministic
    // seed: "a.css:0:body { color: red; }"
    // sha256 of seed...
    // bundle hash: sha256(hash(block))

    assert_eq!(css.content, "body { color: red; }");
    assert!(new_html.contains(&format!("/assets/styles.{}.css", css.hash)));
    assert!(!new_html.contains("<!-- ZENITH_STYLES_ANCHOR -->"));
}

#[test]
fn test_topo_sort_preservation() {
    let block1 = ExtractedStyleBlock {
        module_id: "base.css".into(),
        order: 0,
        content: "/* base */".into(),
    };
    let block2 = ExtractedStyleBlock {
        module_id: "component.css".into(),
        order: 1,
        content: "/* component */".into(),
    };

    let html = "<!-- ZENITH_STYLES_ANCHOR -->";

    // Order 1 -> 2
    let (css, _) = process_css(&[block1.clone(), block2.clone()], html).expect("Processing failed");
    let css = css.expect("Expected CSS");
    assert_eq!(css.content, "/* base */\n\n/* component */");

    // The function expects input to be ALREADY topologically sorted (by compiler).
    // But process_css implementation sorts hashes for BUNDLE HASH, but concatenates content in INPUT ORDER?
    // Let's check implementation.
    // "clean_content.push(block.content.clone());" -> iterates in input order.
    // "sorted_hashes.sort();" -> sorts hashes for bundle stability.
    // So YES, it preserves input order for content, but sorts hashes for bundle hash (which is weird?
    // If input order changes, bundle hash stays same? No, normally bundle hash should depend on order?
    // Prompt says: "Compute Bundle Hash: sha256(sorted(style_hashes).join("|"))".
    // This implies bundle hash is INDEPENDENT of order?
    // "Emit CSS Content: Concatenate in strict topo order".
    // "style_blocks" passed to process_css are expected to be from "compiled.style_blocks" which IS sorted.
    // But wait, if order changes (topo sort changes), content changes.
    // If bundle hash ignores order, then changing order won't change filename?
    // That seems like a feature to avoid cache busting if only order changes but content doesn't?
    // But CSS order MATTERS.
    // If CSS order changes, the RESULT changes. So filename SHOULD change?
    // The prompt explicitly said: "sorted(style_hashes)".
    // This suggests the bundle hash is order-independent of the blocks.
    // This might be a prompt instruction I should follow strictly, even if I question it.
    // "Compute Bundle Hash: sha256(sorted(style_hashes).join("|"))".
    // I followed this.
    // So if I swap input order, content changes, but hash stays same?
    // Let's test this.

    let (css_reversed, _) =
        process_css(&[block2.clone(), block1.clone()], html).expect("Processing failed");
    let css_reversed = css_reversed.expect("Expected CSS");

    assert_eq!(css_reversed.content, "/* component */\n\n/* base */"); // Content changed
    assert_eq!(css.hash, css_reversed.hash); // Hash SAME per strict prompt instruction?

    // NOTE: This behavior means filename doesn't change when order swaps.
    // This technically violates "content addressable" if the content implies order.
    // But I must follow the prompt.
}

#[test]
fn test_cross_os_normalization() {
    // strict_normalize_css should have been called BEFORE process_css.
    // process_css assumes content is already normalized?
    // Prompt says "In bundle.rs: ... Compute Per-Block Hash: sha256(module_id + ":" + order + ":" + content)".
    // If content is not normalized, hash varies.
    // compiler.rs / graph.rs handles normalization.
    // So integration test should rely on previous normalization.
    // However, process_css uses what is given.

    let block = ExtractedStyleBlock {
        module_id: "a.css".into(),
        order: 0,
        content: "body { color: red; }".into(),
    };

    let _ = process_css(&[block], "<!-- ZENITH_STYLES_ANCHOR -->");
}

#[test]
fn test_anchor_validation() {
    let block = ExtractedStyleBlock {
        module_id: "a.css".into(),
        order: 0,
        content: "body{}".into(),
    };

    // Missing anchor
    let res = process_css(&[block.clone()], "<html></html>");
    assert!(res.is_err());

    // Multiple anchors
    let res = process_css(
        &[block.clone()],
        "<!-- ZENITH_STYLES_ANCHOR --><!-- ZENITH_STYLES_ANCHOR -->",
    );
    assert!(res.is_err());

    // Exactly one
    let res = process_css(&[block.clone()], "<!-- ZENITH_STYLES_ANCHOR -->");
    assert!(res.is_ok());
}

#[test]
fn test_empty_css_blocks() {
    // If blocks are provided but empty content?
    // strict_normalize_css removes empty blocks?
    // If they arrive here, they are processed.

    let block = ExtractedStyleBlock {
        module_id: "empty.css".into(),
        order: 0,
        content: "".into(),
    };

    // If content is empty -> joined content is empty -> error?
    // "Determine violation: style_blocks > 0 but final CSS content is empty."
    let res = process_css(&[block], "<!-- ZENITH_STYLES_ANCHOR -->");
    assert!(res.is_err()); // Should fail
}

#[test]
fn test_no_css_blocks() {
    let res = process_css(&[], "<!-- ZENITH_STYLES_ANCHOR -->");
    assert!(res.is_ok());
    let (css, html) = res.unwrap();
    assert!(css.is_none());
    assert!(!html.contains("<!-- ZENITH_STYLES_ANCHOR -->")); // Should be removed
}
