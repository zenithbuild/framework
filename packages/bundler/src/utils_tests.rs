use super::*;

fn assert_module_parses(source: &str) {
    let allocator = Allocator::default();
    let source_type = SourceType::default().with_module(true);
    let parser = Parser::new(&allocator, source, source_type);
    let parse_result = parser.parse();

    assert!(
        parse_result.errors.is_empty(),
        "expected emitted module to parse, errors: {:?}\nsource:\n{}",
        parse_result.errors,
        source
    );
}

#[test]
fn test_virtual_entry_id() {
    assert_eq!(virtual_entry_id("home"), "\0zenith:entry:home");
}

#[test]
fn test_virtual_css_id() {
    assert_eq!(virtual_css_id("home"), "\0zenith:css:home");
}

#[test]
fn test_extract_page_id() {
    assert_eq!(extract_page_id("\0zenith:entry:home"), Some("home"));
    assert_eq!(extract_page_id("\0zenith:css:about"), Some("about"));
    assert_eq!(extract_page_id("other"), None);
}

#[test]
fn test_is_zen_file() {
    assert!(is_zen_file("page.zen"));
    assert!(is_zen_file("/foo/bar.zen"));
    assert!(!is_zen_file("page.tsx"));
}

#[test]
fn test_canonicalize_page_id() {
    assert_eq!(canonicalize_page_id("index.zen"), "index");
    assert_eq!(canonicalize_page_id("/pages/About.zen"), "about");
}

#[test]
fn test_validate_expressions_match() {
    let compiled = vec!["a".into(), "b".into()];
    let metadata = vec!["a".into(), "b".into()];
    assert!(validate_expressions(&compiled, &metadata).is_ok());
}

#[test]
fn test_validate_expressions_length_mismatch() {
    let compiled = vec!["a".into()];
    let metadata = vec!["a".into(), "b".into()];
    assert!(validate_expressions(&compiled, &metadata).is_err());
}

#[test]
fn test_validate_expressions_content_mismatch() {
    let compiled = vec!["a".into(), "c".into()];
    let metadata = vec!["a".into(), "b".into()];
    let err = validate_expressions(&compiled, &metadata).unwrap_err();
    match err {
        BundleError::ExpressionContentMismatch { index, .. } => assert_eq!(index, 1),
        _ => panic!("Expected ExpressionContentMismatch"),
    }
}

#[test]
fn test_generate_virtual_entry() {
    let output = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<div data-zx-e=\"0\"></div>".into(),
        expressions: vec!["title".into()],
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
    let entry = generate_virtual_entry(&output);
    assert!(entry.contains("__zenith_html"));
    assert!(entry.contains("__zenith_expr"));
    assert!(entry.contains("\"title\""));
    assert!(entry.contains("data-zx-e=\"0\""));
}

#[test]
fn test_generate_virtual_entry_uses_compiler_owned_serialization() {
    let output = CompilerOutput {
        ir_version: 1,
        graph_hash: String::new(),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<div data-note=\"`tick` ${hole}\u{2028}\"></div>".into(),
        expressions: vec![
            "\"quote\"".into(),
            "line1\nline2".into(),
            "\\slash\\u{2029}".into(),
        ],
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

    let entry = generate_virtual_entry(&output);
    assert!(entry.contains(r#"<div data-note="\`tick\` \${hole}\u2028"></div>"#));
    assert!(entry.contains(r#"\"quote\""#));
    assert!(entry.contains(r#""line1\nline2""#));
    assert!(entry.contains(r#""\\slash\\u{2029}""#));
    assert_module_parses(&entry);
}

#[test]
fn test_emit_runtime_expression_function_canonicalizes_compiled_expression_output() {
    let function_source = emit_runtime_expression_function(
        "(() => {\n  const note = `raw ${props.note}`;\n  return note + \" \\\\\" + \"quote\\\"\" + \"line\\u2028sep\\u2029tail\";\n})()",
    )
    .expect("compiled expression function should emit");

    assert!(function_source.starts_with("function(__ctx)"));
    assert!(function_source.contains("const props = __ctx.props;"));
    assert!(!function_source.contains("const signalMap = __ctx.signalMap;"));
    assert!(function_source.contains("const note = `raw ${props.note}`;"));
    assert_module_parses(&format!("const __zenith_expr_fns = [{}];", function_source));
}

#[test]
fn test_validate_placeholders_all_present() {
    let html = r#"<div data-zx-e="0"><span data-zx-e="1"></span></div>"#;
    assert!(validate_placeholders(html, 2).is_ok());
}

#[test]
fn test_validate_placeholders_with_events() {
    let html = r#"<button data-zx-on-click="0"></button>"#;
    assert!(validate_placeholders(html, 1).is_ok());
}

#[test]
fn test_validate_placeholders_with_comment_markers() {
    let html = r#"<option>Prefix <!--zx-e:0--></option><button data-zx-on-click="1">Save</button>"#;
    assert!(validate_placeholders(html, 2).is_ok());
}

#[test]
fn test_validate_placeholders_missing() {
    let html = r#"<div data-zx-e="0"></div>"#;
    let result = validate_placeholders(html, 2);
    assert!(result.is_err());
    let diagnostics = result.unwrap_err();
    assert_eq!(diagnostics.len(), 1);
    assert!(diagnostics[0].message.contains("index 1"));
}

#[test]
fn test_rewrite_js_imports_ast_rewrites_static_export_and_dynamic() {
    let source = "import { gsap } from 'gsap'; export { format } from 'date-fns'; export async function load() { return import('gsap'); }";
    let mut replacements = BTreeMap::new();
    replacements.insert("gsap".to_string(), "/assets/vendor.mock.js".to_string());
    replacements.insert("date-fns".to_string(), "/assets/vendor.mock.js".to_string());

    let rewritten = rewrite_js_imports_ast(source, &replacements).expect("rewrite source");
    assert!(rewritten.contains("/assets/vendor.mock.js"));
    assert!(!rewritten.contains("'gsap'"));
    assert!(!rewritten.contains("\"gsap\""));
    assert!(!rewritten.contains("'date-fns'"));
    assert!(!rewritten.contains("\"date-fns\""));
}
