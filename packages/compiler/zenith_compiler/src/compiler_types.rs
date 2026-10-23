use crate::image_materialization::ImageMaterializationEntry;
use crate::script::ExtractedStyleBlock;
use serde::Serialize;
use std::collections::BTreeMap;

pub const IR_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct CompileOptions {
    pub embedded_markup_expressions: bool,
    pub strict_dom_lints: bool,
    pub internal_allow_unbound_markup: bool,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct HoistedPayload {
    pub imports: Vec<String>,
    pub declarations: Vec<String>,
    pub functions: Vec<String>,
    pub signals: Vec<String>,
    pub state: Vec<HoistedState>,
    pub code: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct HoistedState {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ComponentScriptPayload {
    pub hoist_id: String,
    pub factory: String,
    pub imports: Vec<String>,
    pub code: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ComponentInstancePayload {
    pub instance: String,
    pub hoist_id: String,
    pub selector: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SignalPayload {
    pub id: usize,
    pub kind: String,
    pub state_index: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, serde::Deserialize)]
pub struct SourcePositionPayload {
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, serde::Deserialize)]
pub struct SourceSpanPayload {
    pub file: String,
    pub start: SourcePositionPayload,
    pub end: SourcePositionPayload,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ExpressionBindingPayload {
    pub marker_index: usize,
    pub signal_index: Option<usize>,
    pub signal_indices: Vec<usize>,
    pub state_index: Option<usize>,
    pub component_instance: Option<String>,
    pub component_binding: Option<String>,
    /// Compiler-owned source expression text for exact downstream lookup only.
    pub literal: Option<String>,
    /// Precompiled expression for compound expressions that reference signals.
    /// Replaces signal identifiers with `signalMap.get(id).get()` for runtime evaluation without eval.
    pub compiled_expr: Option<String>,
    pub source: Option<SourceSpanPayload>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, serde::Deserialize)]
pub struct MarkerPayload {
    pub index: usize,
    pub kind: String,
    pub selector: String,
    pub attr: Option<String>,
    pub source: Option<SourceSpanPayload>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct EventPayload {
    pub index: usize,
    pub event: String,
    pub selector: String,
    pub source: Option<SourceSpanPayload>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RefBindingPayload {
    pub index: usize,
    pub identifier: String,
    pub selector: String,
    pub source: Option<SourceSpanPayload>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GraphNodePayload {
    pub id: String,
    pub hoist_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CompileWarning {
    pub code: String,
    pub message: String,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompileDiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompileDiagnosticTag {
    Deprecated,
    Unnecessary,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct CompileDiagnosticPosition {
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct CompileDiagnosticRange {
    pub start: CompileDiagnosticPosition,
    pub end: CompileDiagnosticPosition,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDiagnosticFix {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<CompileDiagnosticRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDiagnosticRelatedInformation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    pub range: CompileDiagnosticRange,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: CompileDiagnosticSeverity,
    pub range: CompileDiagnosticRange,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub fixes: Vec<CompileDiagnosticFix>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub related_information: Vec<CompileDiagnosticRelatedInformation>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<CompileDiagnosticTag>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docs_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompileReport {
    pub output: Option<CompilerOutput>,
    pub warnings: Vec<CompileWarning>,
    pub diagnostics: Vec<CompileDiagnostic>,
}

/// The sealed public API for the bundler.
/// This is the ONLY interface the bundler sees.
/// The bundler must NOT reach into AST, modify nodes, or influence indexing.
#[derive(Debug, Clone, PartialEq)]
pub struct CompilerOutput {
    /// Versioned IR envelope contract.
    pub ir_version: u32,
    /// Deterministic graph hash for the page/module graph.
    pub graph_hash: String,
    /// Deterministic graph edges in canonical order.
    pub graph_edges: Vec<String>,
    /// Deterministic graph nodes in canonical order.
    pub graph_nodes: Vec<GraphNodePayload>,
    /// The compiled HTML template string.
    pub html: String,
    /// The expression table — ordered, deterministic, left-to-right depth-first.
    pub expressions: Vec<String>,
    /// Raw import metadata emitted by the compiler.
    pub imports: Vec<String>,
    /// Optional server-side script payload.
    pub server_script: Option<String>,
    /// Whether prerender is enabled for this output.
    pub prerender: bool,
    /// Optional serialized SSR data payload.
    pub ssr_data: Option<String>,
    /// Hoisted declarations from component/page script blocks.
    pub hoisted: HoistedPayload,
    /// Deduplicated component script modules keyed by stable hoist id.
    pub components_scripts: BTreeMap<String, ComponentScriptPayload>,
    /// Per-page component instance bindings in deterministic traversal order.
    pub component_instances: Vec<ComponentInstancePayload>,
    /// Explicit signal table consumed by runtime without name lookup.
    pub signals: Vec<SignalPayload>,
    /// Explicit expression table consumed by runtime without identifier lookup.
    pub expression_bindings: Vec<ExpressionBindingPayload>,
    /// Explicit marker bindings generated by compiler.
    pub marker_bindings: Vec<MarkerPayload>,
    /// Explicit event bindings generated by compiler.
    pub event_bindings: Vec<EventPayload>,
    /// Explicit ref bindings generated by compiler.
    pub ref_bindings: Vec<RefBindingPayload>,
    /// Compiler-emitted style blocks in deterministic order.
    pub style_blocks: Vec<ExtractedStyleBlock>,
    /// Static image materialization rows (selector + JSON props), filled when CLI merges props literals.
    pub image_materialization: Vec<ImageMaterializationEntry>,
}

impl Default for CompilerOutput {
    fn default() -> Self {
        Self {
            ir_version: IR_VERSION,
            graph_hash: String::new(),
            graph_edges: Vec::new(),
            graph_nodes: Vec::new(),
            html: String::new(),
            expressions: Vec::new(),
            imports: Vec::new(),
            server_script: None,
            prerender: false,
            ssr_data: None,
            hoisted: HoistedPayload::default(),
            components_scripts: BTreeMap::new(),
            component_instances: Vec::new(),
            signals: Vec::new(),
            expression_bindings: Vec::new(),
            marker_bindings: Vec::new(),
            event_bindings: Vec::new(),
            ref_bindings: Vec::new(),
            style_blocks: Vec::new(),
            image_materialization: Vec::new(),
        }
    }
}
