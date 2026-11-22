use std::collections::BTreeMap;

use super::bundler_emit_page_tables::{
    event_bindings_for_output, map_runtime_ref_bindings, render_compacted_page_payload_tables_js,
};
use super::bundler_page_entry::generate_entry_js;
use super::maybe_minify_page_for_output;
use super::{
    CompilerExpressionBinding, CompilerHoisted, CompilerIr, CompilerRefBinding,
    CompilerSourcePosition, CompilerSourceSpan, CompilerStateBinding, EventBinding, MarkerBinding,
    MarkerKind, OutputMode,
};

const UNIX_SOURCE_FILE: &str = "/home/judahbsullivan/zenith-jud90-leak/src/pages/index.zen";
const UNIX_SNIPPET: &str = "open /home/judahbsullivan/zenith-jud90-leak/secret.txt";
const WINDOWS_SOURCE_FILE: &str = r"C:\Users\judahbsullivan\zenith-jud90-leak\index.zen";
const WINDOWS_SNIPPET: &str = r"C:\Users\judahbsullivan\zenith-jud90-leak\secret.txt";

fn span(file: &str, snippet: &str) -> CompilerSourceSpan {
    CompilerSourceSpan {
        file: file.to_string(),
        start: CompilerSourcePosition {
            line: 11,
            column: 1,
        },
        end: CompilerSourcePosition {
            line: 11,
            column: 24,
        },
        snippet: Some(snippet.to_string()),
    }
}

fn leaking_ir() -> CompilerIr {
    CompilerIr {
        schema_version: None,
        warnings: Vec::new(),
        ir_version: 1,
        graph_hash: Some("hash".to_string()),
        graph_edges: Vec::new(),
        graph_nodes: Vec::new(),
        html: "<div>Hello</div>".to_string(),
        expressions: vec!["count".to_string()],
        modules: Default::default(),
        imports: Default::default(),
        server_script: Default::default(),
        prerender: false,
        ssr_data: Default::default(),
        hoisted: CompilerHoisted {
            state: vec![CompilerStateBinding {
                key: "rootRef".to_string(),
                value: "null".to_string(),
            }],
            ..CompilerHoisted::default()
        },
        components_scripts: Default::default(),
        component_instances: Default::default(),
        signals: Default::default(),
        expression_bindings: vec![CompilerExpressionBinding {
            marker_index: 0,
            signal_index: None,
            signal_indices: Vec::new(),
            state_index: None,
            component_instance: None,
            component_binding: None,
            literal: Some("count".to_string()),
            compiled_expr: None,
            source: Some(span(UNIX_SOURCE_FILE, UNIX_SNIPPET)),
            scoped_data_key: None,
        }],
        marker_bindings: Vec::new(),
        event_bindings: Vec::new(),
        ref_bindings: vec![CompilerRefBinding {
            index: 0,
            identifier: "rootRef".to_string(),
            selector: r#"[data-zx-ref="0"]"#.to_string(),
            source: Some(span(UNIX_SOURCE_FILE, UNIX_SNIPPET)),
        }],
        style_blocks: Default::default(),
        import_records: Vec::new(),
        page_module_id: None,
        has_guard: false,
        has_load: false,
        guard_module_ref: None,
        load_module_ref: None,
        has_scoped_server_data: false,
        scoped_server_data: Vec::new(),
    }
}

fn leaking_markers() -> Vec<MarkerBinding> {
    vec![MarkerBinding {
        index: 0,
        kind: MarkerKind::Text,
        selector: r#"[data-zx-e~="0"]"#.to_string(),
        attr: None,
        source: Some(span(UNIX_SOURCE_FILE, UNIX_SNIPPET)),
    }]
}

fn leaking_events() -> Vec<EventBinding> {
    vec![EventBinding {
        index: 0,
        event: "click".to_string(),
        selector: r#"[data-zx-on-click="0"]"#.to_string(),
        source: Some(span(WINDOWS_SOURCE_FILE, WINDOWS_SNIPPET)),
    }]
}

fn assert_omits_build_machine_source(js: &str) {
    assert!(
        !js.contains("judahbsullivan"),
        "username leaked into client JS:\n{js}"
    );
    assert!(
        !js.contains("zenith-jud90-leak"),
        "source path leaked into client JS:\n{js}"
    );
    assert!(
        !js.contains("secret.txt"),
        "snippet leaked into client JS:\n{js}"
    );
    assert!(
        !js.contains("/home/"),
        "absolute home path leaked into client JS:\n{js}"
    );
    assert!(
        !js.contains("C:\\Users"),
        "windows home path leaked into client JS:\n{js}"
    );
}

#[test]
fn production_entry_omits_source_spans_and_dev_stable_keeps_them() {
    let ir = leaking_ir();
    let markers = leaking_markers();
    let events = leaking_events();
    let component_assets = BTreeMap::new();
    let page_helper_assets = BTreeMap::new();

    let production = generate_entry_js(
        &ir,
        "./runtime.js",
        &markers,
        &events,
        &component_assets,
        &page_helper_assets,
        "/",
        None,
        "hash",
        false,
        "/",
        OutputMode::Standard,
    )
    .expect("production entry should emit");
    assert_omits_build_machine_source(&production);
    assert!(production.contains("const __zenith_payload_files = [];"));
    assert!(production.contains("rootRef"));
    assert!(production.contains("__zenith_refs"));
    assert!(production.contains("__zenith_events"));
    let minified = maybe_minify_page_for_output(&production, OutputMode::Standard)
        .expect("production page minification should succeed");
    assert_omits_build_machine_source(&minified);
    assert!(minified.contains("rootRef"));

    let dev_stable = generate_entry_js(
        &ir,
        "./runtime.dev.js",
        &markers,
        &events,
        &component_assets,
        &page_helper_assets,
        "/",
        None,
        "hash",
        false,
        "/",
        OutputMode::DevStable,
    )
    .expect("dev-stable entry should emit");
    assert!(dev_stable.contains(UNIX_SOURCE_FILE));
    assert!(dev_stable.contains(UNIX_SNIPPET));
    assert!(dev_stable.contains("judahbsullivan"));
    assert!(dev_stable.contains("secret.txt"));
    assert!(!dev_stable.contains("const __zenith_payload_files = [];"));
}

#[test]
fn production_ref_and_event_tables_drop_source_while_dev_stable_keeps_it() {
    let ir = leaking_ir();
    let events = leaking_events();

    let production_refs = map_runtime_ref_bindings(&ir, false).expect("prod refs");
    assert!(production_refs[0].source.is_none());
    let production_events = event_bindings_for_output(&events, false);
    assert!(production_events[0].source.is_none());

    let dev_refs = map_runtime_ref_bindings(&ir, true).expect("dev refs");
    assert_eq!(
        dev_refs[0]
            .source
            .as_ref()
            .map(|source| source.file.as_str()),
        Some(UNIX_SOURCE_FILE)
    );
    assert_eq!(
        dev_refs[0]
            .source
            .as_ref()
            .and_then(|source| source.snippet.as_deref()),
        Some(UNIX_SNIPPET)
    );
    let dev_events = event_bindings_for_output(&events, true);
    assert_eq!(
        dev_events[0]
            .source
            .as_ref()
            .map(|source| source.file.as_str()),
        Some(WINDOWS_SOURCE_FILE)
    );
}

#[test]
fn compacted_tables_ignore_absolute_paths_inside_snippets() {
    let markers = leaking_markers();
    let runtime_expression_bindings = vec![serde_json::json!({
        "marker_index": 0,
        "signal_index": null,
        "signal_indices": [],
        "state_index": null,
        "component_instance": null,
        "component_binding": null,
        "literal": "count",
        "source": {
            "file": UNIX_SOURCE_FILE,
            "start": { "line": 11, "column": 1 },
            "end": { "line": 11, "column": 24 },
            "snippet": UNIX_SNIPPET
        }
    })];

    let scaffold = render_compacted_page_payload_tables_js(&markers, &runtime_expression_bindings)
        .expect("compact tables should render");
    assert_omits_build_machine_source(&scaffold);
    assert!(scaffold.contains("const __zenith_payload_files = [];"));
}
