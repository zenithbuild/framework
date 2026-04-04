use super::*;

fn default_true() -> bool {
    true
}

fn default_root_base_path() -> String {
    "/".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BundlerInput {
    pub(crate) route: String,
    pub(crate) file: String,
    pub(crate) ir: CompilerIr,
    #[serde(default)]
    pub(crate) image_materialization: Vec<ImageMaterializationEntry>,
    #[serde(default)]
    pub(crate) router: bool,
    #[serde(default = "default_true")]
    pub(crate) requires_js: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BundlerBatchInput {
    pub(crate) inputs: Vec<BundlerInput>,
    #[serde(default)]
    pub(crate) image_runtime_payload: Option<ImageRuntimePayload>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CompilerIr {
    #[serde(rename = "schemaVersion", default)]
    #[allow(dead_code)]
    pub(crate) schema_version: Option<u32>,
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) warnings: Vec<serde_json::Value>,
    pub(crate) ir_version: u32,
    #[serde(default)]
    pub(crate) graph_hash: Option<String>,
    #[serde(default)]
    pub(crate) graph_edges: Vec<String>,
    #[serde(default)]
    pub(crate) graph_nodes: Vec<CompilerGraphNode>,
    pub(crate) html: String,
    pub(crate) expressions: Vec<String>,
    #[serde(default)]
    pub(crate) hoisted: CompilerHoisted,
    #[serde(default)]
    pub(crate) components_scripts: BTreeMap<String, CompilerComponentScript>,
    #[serde(default)]
    pub(crate) component_instances: Vec<CompilerComponentInstance>,
    #[serde(default)]
    pub(crate) imports: Vec<CompilerImport>,
    #[serde(default)]
    pub(crate) modules: Vec<CompilerModule>,
    #[serde(default)]
    pub(crate) server_script: Option<CompilerServerScript>,
    #[serde(default)]
    pub(crate) prerender: bool,
    #[serde(default)]
    pub(crate) ssr_data: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) signals: Vec<CompilerSignal>,
    #[serde(default)]
    pub(crate) expression_bindings: Vec<CompilerExpressionBinding>,
    #[serde(default)]
    pub(crate) marker_bindings: Vec<MarkerBinding>,
    #[serde(default)]
    pub(crate) event_bindings: Vec<EventBinding>,
    #[serde(default)]
    pub(crate) ref_bindings: Vec<CompilerRefBinding>,
    #[serde(default)]
    pub(crate) style_blocks: Vec<ExtractedStyleBlock>,
    #[serde(default)]
    pub(crate) has_guard: bool,
    #[serde(default)]
    pub(crate) has_load: bool,
    #[serde(default)]
    pub(crate) guard_module_ref: Option<String>,
    #[serde(default)]
    pub(crate) load_module_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerHoisted {
    #[serde(default)]
    pub(crate) imports: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    pub(crate) declarations: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    pub(crate) functions: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    pub(crate) signals: Vec<String>,
    #[serde(default)]
    pub(crate) state: Vec<CompilerStateBinding>,
    #[serde(default)]
    pub(crate) code: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerStateBinding {
    pub(crate) key: String,
    pub(crate) value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerComponentScript {
    pub(crate) hoist_id: String,
    #[serde(default)]
    pub(crate) module_id: String,
    pub(crate) factory: String,
    #[serde(default)]
    pub(crate) imports: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub(crate) deps: Vec<String>,
    pub(crate) code: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerModule {
    pub(crate) id: String,
    pub(crate) source: String,
    #[serde(default)]
    pub(crate) deps: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerComponentInstance {
    pub(crate) instance: String,
    #[serde(default)]
    pub(crate) instance_id: usize,
    pub(crate) hoist_id: String,
    #[serde(default)]
    pub(crate) import_index: Option<usize>,
    #[serde(default)]
    pub(crate) marker_index: usize,
    pub(crate) selector: String,
    #[serde(default)]
    pub(crate) props: Vec<CompilerComponentProp>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerImport {
    pub(crate) local: String,
    pub(crate) spec: String,
    pub(crate) hoist_id: String,
    pub(crate) file_hash: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerServerScript {
    pub(crate) source: String,
    pub(crate) prerender: bool,
    #[serde(default)]
    pub(crate) source_path: Option<String>,
    #[serde(default)]
    pub(crate) has_guard: bool,
    #[serde(default)]
    pub(crate) has_load: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerGraphNode {
    pub(crate) id: String,
    pub(crate) hoist_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerComponentProp {
    pub(crate) name: String,
    #[serde(rename = "type")]
    pub(crate) prop_type: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) value: Option<serde_json::Value>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerSignal {
    pub(crate) id: usize,
    pub(crate) kind: String,
    pub(crate) state_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerExpressionBinding {
    pub(crate) marker_index: usize,
    #[serde(default)]
    pub(crate) signal_index: Option<usize>,
    #[serde(default)]
    pub(crate) signal_indices: Vec<usize>,
    #[serde(default)]
    pub(crate) state_index: Option<usize>,
    #[serde(default)]
    pub(crate) component_instance: Option<String>,
    #[serde(default)]
    pub(crate) component_binding: Option<String>,
    #[serde(default)]
    pub(crate) literal: Option<String>,
    #[serde(default)]
    pub(crate) compiled_expr: Option<String>,
    #[serde(default)]
    pub(crate) source: Option<CompilerSourceSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RuntimeExpressionBinding {
    pub(crate) marker_index: usize,
    #[serde(default)]
    pub(crate) signal_index: Option<usize>,
    #[serde(default)]
    pub(crate) signal_indices: Vec<usize>,
    #[serde(default)]
    pub(crate) state_index: Option<usize>,
    #[serde(default)]
    pub(crate) component_instance: Option<String>,
    #[serde(default)]
    pub(crate) component_binding: Option<String>,
    #[serde(default)]
    pub(crate) literal: Option<String>,
    #[serde(default)]
    pub(crate) source: Option<CompilerSourceSpan>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) fn_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerSourcePosition {
    pub(crate) line: usize,
    pub(crate) column: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompilerSourceSpan {
    pub(crate) file: String,
    pub(crate) start: CompilerSourcePosition,
    pub(crate) end: CompilerSourcePosition,
    #[serde(default)]
    pub(crate) snippet: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RouterManifest {
    #[serde(default = "default_root_base_path")]
    pub(crate) base_path: String,
    pub(crate) routes: Vec<RouterRouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RouterRouteEntry {
    pub(crate) path: String,
    pub(crate) output: String,
    pub(crate) html: String,
    pub(crate) expressions: Vec<String>,
    #[serde(default)]
    pub(crate) page_asset: Option<String>,
    #[serde(default)]
    pub(crate) server_script: Option<String>,
    #[serde(default)]
    pub(crate) server_script_path: Option<String>,
    #[serde(default)]
    pub(crate) prerender: bool,
    #[serde(default)]
    pub(crate) ssr_data: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) has_guard: bool,
    #[serde(default)]
    pub(crate) has_load: bool,
    #[serde(default)]
    pub(crate) guard_module_ref: Option<String>,
    #[serde(default)]
    pub(crate) load_module_ref: Option<String>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) image_materialization: Vec<ImageMaterializationEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MarkerKind {
    Text,
    Attr,
    Event,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct MarkerBinding {
    pub(crate) index: usize,
    pub(crate) kind: MarkerKind,
    pub(crate) selector: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attr: Option<String>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<CompilerSourceSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct EventBinding {
    pub(crate) index: usize,
    pub(crate) event: String,
    pub(crate) selector: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<CompilerSourceSpan>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CompilerRefBinding {
    pub(crate) index: usize,
    pub(crate) identifier: String,
    pub(crate) selector: String,
    #[serde(default)]
    pub(crate) source: Option<CompilerSourceSpan>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RuntimeRefBinding {
    pub(crate) index: usize,
    pub(crate) state_index: usize,
    pub(crate) selector: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<CompilerSourceSpan>,
}

#[derive(Debug, Serialize)]
pub(crate) struct Manifest {
    pub(crate) entry: Option<String>,
    pub(crate) base_path: String,
    pub(crate) vendor: Option<String>,
    pub(crate) router: Option<String>,
    pub(crate) css: String,
    pub(crate) core: Option<String>,
    pub(crate) hash: String,
    pub(crate) chunks: BTreeMap<String, Option<String>>,
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub(crate) server_routes: BTreeSet<String>,
}
