use super::bundler_emit_page::{derive_binding_tables, render_compacted_page_payload_tables_js};
use super::bundler_minify::{
    maybe_minify_page_for_output, maybe_minify_router_for_output, maybe_minify_runtime_for_output,
};
use super::bundler_page_entry::build_expression_fns_and_bindings;
use super::{
    CompilerExpressionBinding, CompilerIr, CompilerSourcePosition, CompilerSourceSpan,
    MarkerBinding, MarkerKind, OutputMode,
};
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

fn assert_module_parses(source: &str) {
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::default().with_module(true));
    let result = parser.parse();

    assert!(
        result.errors.is_empty(),
        "expected generated JS to parse, errors: {:?}\nsource:\n{}",
        result.errors,
        source
    );
}

#[test]
fn runtime_asset_minification_is_prod_only_and_deterministic() {
    let source = r#"
export function runtimeMinifyLock(value) {
    const entries = [1, 2, 3];
    const label = `${value}:${entries.join(',')}`;
    return label;
}
"#;

    let dev_source = maybe_minify_runtime_for_output(source, OutputMode::DevStable)
        .expect("dev-stable runtime emission should remain unmodified");
    assert_eq!(dev_source, source);

    let prod_left = maybe_minify_runtime_for_output(source, OutputMode::Standard)
        .expect("production runtime minification should succeed");
    let prod_right = maybe_minify_runtime_for_output(source, OutputMode::Standard)
        .expect("production runtime minification should be deterministic");

    assert_eq!(prod_left, prod_right);
    assert!(
        prod_left.len() < source.len(),
        "expected production minification to reduce runtime source bytes"
    );
    assert_module_parses(&prod_left);
}

#[test]
fn router_asset_minification_is_prod_only_and_deterministic() {
    let source = r#"
export async function routerMinifyLock(pathname) {
    const normalized = String(pathname || "/").trim();
    if (normalized.length === 0) {
        return "/";
    }
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
"#;

    let dev_source = maybe_minify_router_for_output(source, OutputMode::DevStable)
        .expect("dev-stable router emission should remain unmodified");
    assert_eq!(dev_source, source);

    let prod_left = maybe_minify_router_for_output(source, OutputMode::Standard)
        .expect("production router minification should succeed");
    let prod_right = maybe_minify_router_for_output(source, OutputMode::Standard)
        .expect("production router minification should be deterministic");

    assert_eq!(prod_left, prod_right);
    assert!(
        prod_left.len() < source.len(),
        "expected production minification to reduce router source bytes"
    );
    assert_module_parses(&prod_left);
}

#[test]
fn page_asset_compaction_and_minification_are_prod_only_and_deterministic() {
    let source = r#"
const __active_filter_zenith_src_pages_index_zen_script0_20b25584_items = [1, 2, 3];
export function pageMinifyLock() {
    return __active_filter_zenith_src_pages_index_zen_script0_20b25584_items.join(",");
}
"#;

    let dev_source = maybe_minify_page_for_output(source, OutputMode::DevStable)
        .expect("dev-stable page emission should remain unmodified");
    assert_eq!(dev_source, source);

    let prod_left = maybe_minify_page_for_output(source, OutputMode::Standard)
        .expect("production page compaction should succeed");
    let prod_right = maybe_minify_page_for_output(source, OutputMode::Standard)
        .expect("production page compaction should be deterministic");

    assert_eq!(prod_left, prod_right);
    assert!(
        prod_left.len() < source.len(),
        "expected production page compaction to reduce source bytes"
    );
    assert!(
        !prod_left.contains("__active_filter_zenith_src_pages_index_zen_script0_20b25584_items"),
        "expected production page compaction to replace generated scoped identifiers"
    );
    assert_module_parses(&prod_left);
}

#[test]
fn compact_page_payload_tables_emit_canonical_inflate_scaffold() {
    let markers = vec![MarkerBinding {
        index: 0,
        kind: MarkerKind::Text,
        selector: "[data-zx-marker=\"0\"]".to_string(),
        attr: None,
        source: Some(CompilerSourceSpan {
            file: "src/pages/index.zen".to_string(),
            start: CompilerSourcePosition { line: 9, column: 5 },
            end: CompilerSourcePosition {
                line: 9,
                column: 24,
            },
            snippet: Some("{count}".to_string()),
        }),
    }];
    let runtime_expression_bindings = vec![serde_json::json!({
        "marker_index": 0,
        "signal_index": null,
        "signal_indices": [],
        "state_index": null,
        "component_instance": null,
        "component_binding": null,
        "literal": "count",
        "source": {
            "file": "src/pages/index.zen",
            "start": { "line": 9, "column": 5 },
            "end": { "line": 9, "column": 24 },
            "snippet": "{count}"
        }
    })];

    let scaffold = render_compacted_page_payload_tables_js(&markers, &runtime_expression_bindings)
        .expect("compact page table scaffold should render");
    assert!(scaffold.contains("const __zenith_payload_files = ["));
    assert!(scaffold.contains("const __zenith_payload_expression_rows = ["));
    assert!(scaffold.contains("const __zenith_payload_marker_rows = ["));
    assert!(scaffold
        .contains("const __zenith_expression_bindings = __zenith_payload_expression_rows.map"));
    assert!(scaffold.contains("const __zenith_markers = __zenith_payload_marker_rows.map"));

    let module = format!(
        "{scaffold}\nexport const __page_payload_lock = [__zenith_expression_bindings, __zenith_markers];\n"
    );
    assert_module_parses(&module);
}

#[test]
fn compiled_expression_bindings_emit_fn_index_and_signal_indices() {
    let bindings = vec![
        CompilerExpressionBinding {
            marker_index: 0,
            signal_index: Some(0),
            signal_indices: vec![0, 2],
            state_index: Some(0),
            component_instance: None,
            component_binding: None,
            literal: Some("count ? \"on\" : \"off\"".to_string()),
            compiled_expr: Some("signalMap.get(0).get() ? \"on\" : \"off\"".to_string()),
            source: Some(CompilerSourceSpan {
                file: "src/pages/index.zen".to_string(),
                start: CompilerSourcePosition {
                    line: 12,
                    column: 5,
                },
                end: CompilerSourcePosition {
                    line: 12,
                    column: 30,
                },
                snippet: Some("count ? \"on\" : \"off\"".to_string()),
            }),
            scoped_data_key: None,
        },
        CompilerExpressionBinding {
            marker_index: 1,
            signal_index: None,
            signal_indices: Vec::new(),
            state_index: None,
            component_instance: None,
            component_binding: None,
            literal: Some("props.href".to_string()),
            compiled_expr: None,
            source: None,
            scoped_data_key: None,
        },
    ];

    let (js, runtime_bindings) =
        build_expression_fns_and_bindings(&bindings).expect("expression fns should emit");
    assert!(js.contains("const __zenith_expr_fns = ["));
    assert!(js.contains("const signalMap = __ctx.signalMap;"));
    assert_eq!(runtime_bindings[0]["fn_index"], serde_json::json!(0));
    assert_eq!(
        runtime_bindings[0]["signal_indices"],
        serde_json::json!([0, 2])
    );
    assert_eq!(
        runtime_bindings[0]["source"]["file"],
        serde_json::json!("src/pages/index.zen")
    );
    assert!(runtime_bindings[1].get("fn_index").is_none());
}

#[test]
fn scoped_expression_bindings_wrap_ssr_data_with_scoped_slice() {
    let bindings = vec![CompilerExpressionBinding {
        marker_index: 0,
        signal_index: None,
        signal_indices: Vec::new(),
        state_index: None,
        component_instance: None,
        component_binding: None,
        literal: Some("data.title".to_string()),
        compiled_expr: Some("data.title".to_string()),
        source: None,
        scoped_data_key: Some("component:src/components/Card.zen:o0".to_string()),
    }];

    let (js, runtime_bindings) =
        build_expression_fns_and_bindings(&bindings).expect("scoped expression fns should emit");

    assert!(js.contains("__zsd(__ctx.ssrData"));
    assert!(js.contains("component:src/components/Card.zen:o0"));
    assert_eq!(runtime_bindings[0]["fn_index"], serde_json::json!(0));
    assert_eq!(
        runtime_bindings[0]["scoped_data_key"],
        serde_json::json!("component:src/components/Card.zen:o0")
    );
    assert_module_parses(&js);
}

#[test]
fn compiled_expression_functions_parse_without_escape_cleanup() {
    let bindings = vec![CompilerExpressionBinding {
        marker_index: 0,
        signal_index: Some(0),
        signal_indices: vec![0],
        state_index: Some(0),
        component_instance: None,
        component_binding: None,
        literal: None,
        compiled_expr: Some(
            "(() => {\n  const note = `raw ${props.note}`;\n  return note + \" \\\\\" + \"quote\\\"\" + \"line\\u2028sep\\u2029tail\";\n})()"
                .to_string(),
        ),
        source: None,
        scoped_data_key: None,
    }];

    let (js, runtime_bindings) =
        build_expression_fns_and_bindings(&bindings).expect("expression fns should emit");

    assert!(js.contains("const __zenith_expr_fns = ["));
    assert!(js.contains("const props = __ctx.props;"));
    assert!(!js.contains("const signalMap = __ctx.signalMap;"));
    assert!(js.contains("const note = `raw ${props.note}`;"));
    assert_eq!(runtime_bindings[0]["fn_index"], serde_json::json!(0));
    assert_module_parses(&js);
}

#[test]
fn invalid_compiled_expression_functions_fail_hard() {
    let bindings = vec![CompilerExpressionBinding {
        marker_index: 0,
        signal_index: None,
        signal_indices: Vec::new(),
        state_index: None,
        component_instance: None,
        component_binding: None,
        literal: None,
        compiled_expr: Some("props.note +".to_string()),
        source: None,
        scoped_data_key: None,
    }];

    let err = build_expression_fns_and_bindings(&bindings)
        .expect_err("invalid compiled expression must fail emission");

    assert!(err.contains("failed to emit runtime expression function"));
}

#[test]
fn derive_binding_tables_supports_comment_text_markers() {
    let ir = CompilerIr {
        schema_version: None,
        warnings: Vec::new(),
        ir_version: 1,
        graph_hash: Some(String::new()),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<option>Prefix <!--zx-e:0--></option><button data-zx-on-click=\"1\">Save</button>"
            .to_string(),
        expressions: vec!["label".to_string(), "increment".to_string()],
        modules: Default::default(),
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
        import_records: Vec::new(),
        page_module_id: None,
        has_guard: false,
        has_load: false,
        guard_module_ref: None,
        load_module_ref: None,
        has_scoped_server_data: false,
        scoped_server_data: Vec::new(),
    };

    let (markers, events) = derive_binding_tables(&ir).expect("derive bindings");
    assert_eq!(markers.len(), 2);
    assert_eq!(markers[0].kind, MarkerKind::Text);
    assert_eq!(markers[0].selector, "comment:zx-e:0");
    assert_eq!(markers[1].kind, MarkerKind::Event);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].selector, r#"[data-zx-on-click="1"]"#);
}
