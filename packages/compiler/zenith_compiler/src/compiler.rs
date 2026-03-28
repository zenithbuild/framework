use crate::ast::SourceSpan;
use crate::codegen::generate;
use crate::expression_scope::analyze_scoped_expression;
use crate::parser::{Parser, ParserProfileMetrics};
use crate::script::{
    extract_script_blocks_with_profile, ComponentInstanceBinding, ComponentScriptAsset,
    ExtractedStyleBlock, HoistedOutput, HoistedStateBinding, ScriptProfileMetrics,
};
use crate::transform::{
    transform, EventBinding, MarkerBinding, MarkerKind, RefBinding, TransformWarning,
};
use regex::Regex;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;
use std::time::Instant;

pub const IR_VERSION: u32 = 1;

#[derive(Debug, Clone, Default)]
struct CompileInternalTimings {
    extract_script_blocks_ms: f64,
    strip_html_comments_ms: f64,
    parse_ms: f64,
    transform_ms: f64,
    parser_profile: Option<ParserProfileMetrics>,
    script_profile: Option<ScriptProfileMetrics>,
}

fn round_ms(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn identifier_match_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[A-Za-z_$][A-Za-z0-9_$]*$").expect("valid identifier regex"))
}

fn primitive_number_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$").expect("valid primitive number regex")
    })
}

fn safe_member_chain_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^(?:params|data|ssr|props)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
            .expect("valid member chain regex")
    })
}

fn compiler_profile_enabled() -> bool {
    matches!(std::env::var("ZENITH_COMPILER_PROFILE").as_deref(), Ok("1"))
}

fn emit_compiler_profile(
    source_path: &str,
    internal: &CompileInternalTimings,
    compile_internal_ms: f64,
    html_ms: f64,
    map_signals_ms: f64,
    map_marker_bindings_ms: f64,
    map_expression_bindings_ms: f64,
    map_hoisted_ms: f64,
    map_component_scripts_ms: f64,
    map_component_instances_ms: f64,
    map_event_bindings_ms: f64,
    map_ref_bindings_ms: f64,
    map_warnings_ms: f64,
    total_ms: f64,
) {
    if !compiler_profile_enabled() {
        return;
    }

    let payload = format!(
        concat!(
            "{{",
            "\"sourcePath\":{},",
            "\"totalMs\":{:.2},",
            "\"compileInternalMs\":{:.2},",
            "\"extractScriptBlocksMs\":{:.2},",
            "\"stripHtmlCommentsMs\":{:.2},",
            "\"parseMs\":{:.2},",
            "\"transformMs\":{:.2},",
            "\"generateHtmlMs\":{:.2},",
            "\"mapSignalsMs\":{:.2},",
            "\"mapMarkerBindingsMs\":{:.2},",
            "\"mapExpressionBindingsMs\":{:.2},",
            "\"mapHoistedMs\":{:.2},",
            "\"mapComponentScriptsMs\":{:.2},",
            "\"mapComponentInstancesMs\":{:.2},",
            "\"mapEventBindingsMs\":{:.2},",
            "\"mapRefBindingsMs\":{:.2},",
            "\"mapWarningsMs\":{:.2}",
            "}}"
        ),
        format!("{source_path:?}"),
        round_ms(total_ms),
        round_ms(compile_internal_ms),
        round_ms(internal.extract_script_blocks_ms),
        round_ms(internal.strip_html_comments_ms),
        round_ms(internal.parse_ms),
        round_ms(internal.transform_ms),
        round_ms(html_ms),
        round_ms(map_signals_ms),
        round_ms(map_marker_bindings_ms),
        round_ms(map_expression_bindings_ms),
        round_ms(map_hoisted_ms),
        round_ms(map_component_scripts_ms),
        round_ms(map_component_instances_ms),
        round_ms(map_event_bindings_ms),
        round_ms(map_ref_bindings_ms),
        round_ms(map_warnings_ms),
    );

    eprintln!("[zenith-compiler-profile] {}", payload);

    if let Some(parser_profile) = &internal.parser_profile {
        let parser_payload = format!(
            concat!(
                "{{",
                "\"sourcePath\":{},",
                "\"trimWhitespaceMs\":{:.2},",
                "\"syncCurrentTokenMs\":{:.2},",
                "\"locationLookupMs\":{:.2},",
                "\"locationLookupCalls\":{},",
                "\"spanConstructionMs\":{:.2},",
                "\"parseNodeMs\":{:.2},",
                "\"parseExpressionMs\":{:.2},",
                "\"parseElementMs\":{:.2},",
                "\"parseAttributesMs\":{:.2},",
                "\"parseChildrenMs\":{:.2},",
                "\"contractGateMs\":{:.2},",
                "\"containsMarkupMs\":{:.2},",
                "\"lowerEmbeddedMarkupMs\":{:.2},",
                "\"lexerNextTokenMs\":{:.2},",
                "\"lexerLexTextMs\":{:.2},",
                "\"lexerLexTagMs\":{:.2},",
                "\"lexerLexStringMs\":{:.2},",
                "\"lexerLexIdentifierMs\":{:.2},",
                "\"lexerSkipWhitespaceMs\":{:.2},",
                "\"lexerLexExpressionContentMs\":{:.2}",
                "}}"
            ),
            format!("{source_path:?}"),
            round_ms(parser_profile.trim_whitespace_ms),
            round_ms(parser_profile.sync_current_token_ms),
            round_ms(parser_profile.location_lookup_ms),
            parser_profile.location_lookup_calls,
            round_ms(parser_profile.span_construction_ms),
            round_ms(parser_profile.parse_node_ms),
            round_ms(parser_profile.parse_expression_ms),
            round_ms(parser_profile.parse_element_ms),
            round_ms(parser_profile.parse_attributes_ms),
            round_ms(parser_profile.parse_children_ms),
            round_ms(parser_profile.contract_gate_ms),
            round_ms(parser_profile.contains_markup_ms),
            round_ms(parser_profile.lower_embedded_markup_ms),
            round_ms(parser_profile.lexer.next_token_ms),
            round_ms(parser_profile.lexer.lex_text_ms),
            round_ms(parser_profile.lexer.lex_tag_ms),
            round_ms(parser_profile.lexer.lex_string_ms),
            round_ms(parser_profile.lexer.lex_identifier_ms),
            round_ms(parser_profile.lexer.skip_whitespace_ms),
            round_ms(parser_profile.lexer.lex_expression_content_ms),
        );
        eprintln!("[zenith-parser-profile] {}", parser_payload);
    }

    if let Some(script_profile) = &internal.script_profile {
        let script_payload = format!(
            concat!(
                "{{",
                "\"sourcePath\":{},",
                "\"openTagScanMs\":{:.2},",
                "\"openTagCloseSearchMs\":{:.2},",
                "\"updateTagDepthMs\":{:.2},",
                "\"validateTagMs\":{:.2},",
                "\"validateAttrExtractMs\":{:.2},",
                "\"validateAttrCountMs\":{:.2},",
                "\"closeTagSearchMs\":{:.2},",
                "\"analyzeScriptMs\":{:.2},",
                "\"analyzeSetupRegexMs\":{:.2},",
                "\"analyzeImportWorkMs\":{:.2},",
                "\"analyzeDeclScanMs\":{:.2},",
                "\"analyzeBindingKindMs\":{:.2},",
                "\"analyzeFunctionScanMs\":{:.2},",
                "\"analyzeStateDeclScanMs\":{:.2},",
                "\"analyzeRenameRewriteMs\":{:.2},",
                "\"analyzeStateLowerMs\":{:.2},",
                "\"analyzeLowerStateReadsMs\":{:.2},",
                "\"analyzeDeclarationCollectMs\":{:.2},",
                "\"analyzeFactoryCodeMs\":{:.2},",
                "\"lineOffsetMs\":{:.2},",
                "\"domLintMs\":{:.2}",
                "}}"
            ),
            format!("{source_path:?}"),
            round_ms(script_profile.open_tag_scan_ms),
            round_ms(script_profile.open_tag_close_search_ms),
            round_ms(script_profile.update_tag_depth_ms),
            round_ms(script_profile.validate_tag_ms),
            round_ms(script_profile.validate_attr_extract_ms),
            round_ms(script_profile.validate_attr_count_ms),
            round_ms(script_profile.close_tag_search_ms),
            round_ms(script_profile.analyze_script_ms),
            round_ms(script_profile.analyze_setup_regex_ms),
            round_ms(script_profile.analyze_import_work_ms),
            round_ms(script_profile.analyze_decl_scan_ms),
            round_ms(script_profile.analyze_binding_kind_ms),
            round_ms(script_profile.analyze_function_scan_ms),
            round_ms(script_profile.analyze_state_decl_scan_ms),
            round_ms(script_profile.analyze_rename_rewrite_ms),
            round_ms(script_profile.analyze_state_lower_ms),
            round_ms(script_profile.analyze_lower_state_reads_ms),
            round_ms(script_profile.analyze_declaration_collect_ms),
            round_ms(script_profile.analyze_factory_code_ms),
            round_ms(script_profile.line_offset_ms),
            round_ms(script_profile.dom_lint_ms),
        );
        eprintln!("[zenith-script-profile] {}", script_payload);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct CompileOptions {
    pub embedded_markup_expressions: bool,
    pub strict_dom_lints: bool,
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
    pub image_materialization: Vec<crate::image_materialization::ImageMaterializationEntry>,
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

/// Compile a template into the structured bundler output.
/// This is the primary entry point for programmatic use.
pub fn compile_structured(input: &str) -> Result<CompilerOutput, String> {
    compile_structured_with_source(input, "<inline>")
}

pub fn compile_structured_with_source(
    input: &str,
    source_path: &str,
) -> Result<CompilerOutput, String> {
    compile_structured_with_source_options(input, source_path, CompileOptions::default())
}

pub fn compile_structured_with_source_options(
    input: &str,
    source_path: &str,
    options: CompileOptions,
) -> Result<CompilerOutput, String> {
    compile_structured_with_source_options_and_warnings(input, source_path, options)
        .map(|(output, _warnings)| output)
}

pub fn compile_structured_with_source_options_and_warnings(
    input: &str,
    source_path: &str,
    options: CompileOptions,
) -> Result<(CompilerOutput, Vec<CompileWarning>), String> {
    compile_capture(input, source_path, options)
}

pub fn compile_structured_with_source_options_and_report(
    input: &str,
    source_path: &str,
    options: CompileOptions,
) -> CompileReport {
    match compile_capture(input, source_path, options) {
        Ok((output, warnings)) => CompileReport {
            diagnostics: warnings
                .iter()
                .map(map_warning_diagnostic)
                .collect::<Vec<_>>(),
            output: Some(output),
            warnings,
        },
        Err(message) => CompileReport {
            output: None,
            warnings: Vec::new(),
            diagnostics: vec![diagnostic_from_error_message(&message, input)],
        },
    }
}

#[deprecated(note = "Use compile_structured_with_source instead.")]
pub fn compile_structured_with_source_result(
    input: &str,
    source_path: &str,
) -> Result<CompilerOutput, String> {
    compile_structured_with_source(input, source_path)
}

#[deprecated(
    note = "Unchecked API may panic on compiler errors. Use compile_structured_with_source instead."
)]
pub fn compile_structured_with_source_unchecked(input: &str, source_path: &str) -> CompilerOutput {
    compile_structured_with_source(input, source_path)
        .unwrap_or_else(|message| panic!("{}", message))
}

/// Compile a template into a full TypeScript module string.
/// Used by the CLI and for human-readable output.
pub fn compile(input: &str) -> Result<String, String> {
    let result = std::panic::catch_unwind(|| {
        let options = CompileOptions::default();
        let (
            ast,
            _raw_expressions,
            expressions,
            _hoisted,
            _component_scripts,
            _component_instances,
            _markers,
            _events,
            _ref_bindings,
            _warnings,
        ) = compile_internal_result(input, "<inline>", options, None)?;
        Ok(generate(ast, expressions))
    });

    match result {
        Ok(inner) => inner,
        Err(payload) => Err(panic_payload_to_string(payload)),
    }
}

#[deprecated(note = "Use compile instead.")]
pub fn compile_result(input: &str) -> Result<String, String> {
    compile(input)
}

#[deprecated(note = "Unchecked API may panic on compiler errors. Use compile instead.")]
pub fn compile_unchecked(input: &str) -> String {
    compile(input).unwrap_or_else(|message| panic!("{}", message))
}

fn compile_internal_result(
    input: &str,
    source_path: &str,
    options: CompileOptions,
    mut timings: Option<&mut CompileInternalTimings>,
) -> Result<
    (
        crate::ast::Node,
        Vec<String>,
        Vec<String>,
        HoistedOutput,
        BTreeMap<String, ComponentScriptAsset>,
        Vec<ComponentInstanceBinding>,
        Vec<MarkerBinding>,
        Vec<EventBinding>,
        Vec<RefBinding>,
        Vec<TransformWarning>,
    ),
    String,
> {
    let extract_script_blocks_started_at = Instant::now();
    let (preprocessed, scripts, dom_lints, script_profile) =
        extract_script_blocks_with_profile(input, source_path, compiler_profile_enabled())
            .map_err(|err| err.message)?;
    if let Some(timings) = timings.as_deref_mut() {
        timings.extract_script_blocks_ms =
            extract_script_blocks_started_at.elapsed().as_secs_f64() * 1000.0;
        timings.script_profile = Some(script_profile);
    }

    let strip_html_comments_started_at = Instant::now();
    let normalized = strip_html_comments(&preprocessed);
    if let Some(timings) = timings.as_deref_mut() {
        timings.strip_html_comments_ms =
            strip_html_comments_started_at.elapsed().as_secs_f64() * 1000.0;
    }

    let parse_started_at = Instant::now();
    let mut parser = Parser::new_with_profile_options(
        &normalized,
        options.embedded_markup_expressions,
        compiler_profile_enabled(),
    );
    let ast = parser.parse();
    if let Some(timings) = timings.as_deref_mut() {
        timings.parse_ms = parse_started_at.elapsed().as_secs_f64() * 1000.0;
        timings.parser_profile = Some(parser.profile_metrics());
    }

    let transform_started_at = Instant::now();
    let (
        ast,
        raw_expressions,
        expressions,
        hoisted,
        component_scripts,
        component_instances,
        markers,
        events,
        ref_bindings,
        mut warnings,
    ) = transform(ast, &scripts);
    if let Some(timings) = timings.as_deref_mut() {
        timings.transform_ms = transform_started_at.elapsed().as_secs_f64() * 1000.0;
    }
    warnings.extend(dom_lints.into_iter().map(|l| TransformWarning {
        code: l.code,
        message: l.message,
        line: l.line,
        column: l.column,
    }));
    Ok((
        ast,
        raw_expressions,
        expressions,
        hoisted,
        component_scripts,
        component_instances,
        markers,
        events,
        ref_bindings,
        warnings,
    ))
}

fn panic_payload_to_string(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<String>() {
        return s.clone();
    }
    if let Some(s) = payload.downcast_ref::<&str>() {
        return s.to_string();
    }
    "Compiler failed with non-string panic payload".to_string()
}

fn compile_capture(
    input: &str,
    source_path: &str,
    options: CompileOptions,
) -> Result<(CompilerOutput, Vec<CompileWarning>), String> {
    let result = std::panic::catch_unwind(|| {
        let (
            html,
            expressions,
            hoisted,
            component_scripts,
            component_instances,
            signals,
            marker_bindings,
            expression_bindings,
            event_bindings,
            ref_bindings,
            warnings,
        ) = {
            let mut internal_timings = CompileInternalTimings::default();
            let compile_internal_started_at = Instant::now();
            let (
                ast,
                raw_expressions,
                expressions,
                hoisted,
                component_scripts,
                component_instances,
                markers,
                events,
                ref_bindings,
                warnings,
            ) = compile_internal_result(input, source_path, options, Some(&mut internal_timings))?;
            let compile_internal_ms = compile_internal_started_at.elapsed().as_secs_f64() * 1000.0;

            let html_started_at = Instant::now();
            let html = crate::codegen::generate_html(&ast);
            let html_ms = html_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_signals_started_at = Instant::now();
            let signals = map_signals(&hoisted);
            let map_signals_ms = map_signals_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_marker_bindings_started_at = Instant::now();
            let marker_bindings = map_markers(markers, source_path, input);
            let map_marker_bindings_ms =
                map_marker_bindings_started_at.elapsed().as_secs_f64() * 1000.0;

            let marker_sources = marker_bindings
                .iter()
                .map(|marker| (marker.index, marker.source.clone()))
                .collect::<BTreeMap<_, _>>();

            let map_expression_bindings_started_at = Instant::now();
            let expression_bindings = map_expression_bindings(
                &raw_expressions,
                &expressions,
                &hoisted,
                &signals,
                &marker_sources,
            );
            let map_expression_bindings_ms =
                map_expression_bindings_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_hoisted_started_at = Instant::now();
            let hoisted_payload = map_hoisted(hoisted);
            let map_hoisted_ms = map_hoisted_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_component_scripts_started_at = Instant::now();
            let component_scripts_payload = map_component_scripts(component_scripts);
            let map_component_scripts_ms =
                map_component_scripts_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_component_instances_started_at = Instant::now();
            let component_instances_payload = map_component_instances(component_instances);
            let map_component_instances_ms =
                map_component_instances_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_event_bindings_started_at = Instant::now();
            let event_bindings_payload = map_events(events, source_path, input);
            let map_event_bindings_ms =
                map_event_bindings_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_ref_bindings_started_at = Instant::now();
            let ref_bindings_payload = map_ref_bindings(ref_bindings, source_path, input);
            let map_ref_bindings_ms = map_ref_bindings_started_at.elapsed().as_secs_f64() * 1000.0;

            let map_warnings_started_at = Instant::now();
            let warnings_payload = map_warnings(warnings);
            let map_warnings_ms = map_warnings_started_at.elapsed().as_secs_f64() * 1000.0;

            emit_compiler_profile(
                source_path,
                &internal_timings,
                compile_internal_ms,
                html_ms,
                map_signals_ms,
                map_marker_bindings_ms,
                map_expression_bindings_ms,
                map_hoisted_ms,
                map_component_scripts_ms,
                map_component_instances_ms,
                map_event_bindings_ms,
                map_ref_bindings_ms,
                map_warnings_ms,
                compile_internal_ms
                    + html_ms
                    + map_signals_ms
                    + map_marker_bindings_ms
                    + map_expression_bindings_ms
                    + map_hoisted_ms
                    + map_component_scripts_ms
                    + map_component_instances_ms
                    + map_event_bindings_ms
                    + map_ref_bindings_ms
                    + map_warnings_ms,
            );

            (
                html,
                expressions,
                hoisted_payload,
                component_scripts_payload,
                component_instances_payload,
                signals,
                marker_bindings,
                expression_bindings,
                event_bindings_payload,
                ref_bindings_payload,
                warnings_payload,
            )
        };

        let output = CompilerOutput {
            ir_version: IR_VERSION,
            graph_hash: String::new(),
            graph_edges: Vec::new(),
            graph_nodes: Vec::new(),
            html,
            expressions,
            imports: Vec::new(),
            server_script: None,
            prerender: false,
            ssr_data: None,
            hoisted,
            components_scripts: component_scripts,
            component_instances,
            signals,
            expression_bindings,
            marker_bindings,
            event_bindings,
            ref_bindings,
            style_blocks: Vec::new(),
            image_materialization: Vec::new(),
        };

        Ok((output, warnings))
    });

    match result {
        Ok(inner) => inner,
        Err(payload) => Err(panic_payload_to_string(payload)),
    }
}

fn strip_html_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0usize;

    while let Some(rel_start) = input[cursor..].find("<!--") {
        let start = cursor + rel_start;
        out.push_str(&input[cursor..start]);

        let after_open = start + 4;
        if let Some(rel_end) = input[after_open..].find("-->") {
            cursor = after_open + rel_end + 3;
        } else {
            // Unterminated comment: treat the remainder as comment and stop.
            return out;
        }
    }

    out.push_str(&input[cursor..]);
    out
}

fn map_hoisted(output: HoistedOutput) -> HoistedPayload {
    HoistedPayload {
        imports: output.imports,
        declarations: output.declarations,
        functions: output.functions,
        signals: output.signals,
        state: output
            .state_bindings
            .into_iter()
            .map(|binding: HoistedStateBinding| HoistedState {
                key: binding.key,
                value: binding.value,
            })
            .collect(),
        code: output.code,
    }
}

fn map_component_scripts(
    scripts: BTreeMap<String, ComponentScriptAsset>,
) -> BTreeMap<String, ComponentScriptPayload> {
    let mut out = BTreeMap::new();
    for (key, script) in scripts {
        out.insert(
            key,
            ComponentScriptPayload {
                hoist_id: script.hoist_id,
                factory: script.factory,
                imports: script.imports,
                code: script.code,
            },
        );
    }
    out
}

fn map_component_instances(
    instances: Vec<ComponentInstanceBinding>,
) -> Vec<ComponentInstancePayload> {
    instances
        .into_iter()
        .map(|instance| ComponentInstancePayload {
            instance: instance.instance,
            hoist_id: instance.hoist_id,
            selector: instance.selector,
        })
        .collect()
}

fn map_signals(hoisted: &HoistedOutput) -> Vec<SignalPayload> {
    let state_index_by_key = hoisted
        .state_bindings
        .iter()
        .enumerate()
        .map(|(idx, item)| (item.key.clone(), idx))
        .collect::<BTreeMap<_, _>>();

    let mut signals = Vec::new();
    for key in &hoisted.signals {
        let Some(state_index) = state_index_by_key.get(key) else {
            continue;
        };
        signals.push(SignalPayload {
            id: signals.len(),
            kind: "signal".to_string(),
            state_index: *state_index,
        });
    }
    signals
}

fn map_expression_bindings(
    raw_expressions: &[String],
    expressions: &[String],
    hoisted: &HoistedOutput,
    signals: &[SignalPayload],
    marker_sources: &BTreeMap<usize, Option<SourceSpanPayload>>,
) -> Vec<ExpressionBindingPayload> {
    let signal_index_by_state = signals
        .iter()
        .map(|signal| (signal.state_index, signal.id))
        .collect::<BTreeMap<_, _>>();
    let runtime_replacements =
        build_runtime_expression_replacements(&hoisted.state_bindings, &signal_index_by_state);

    expressions
        .iter()
        .enumerate()
        .map(|(index, expr)| {
            let trimmed = expr.trim();
            let source = marker_sources.get(&index).cloned().unwrap_or(None);
            let raw_expr = raw_expressions
                .get(index)
                .map(String::as_str)
                .unwrap_or(expr);
            let raw_literal = resolve_raw_expression_literal(raw_expr, expr, source.as_ref());

            if let Some(state_index) = resolve_direct_state_index(trimmed, &hoisted.state_bindings)
            {
                let signal_indices = signal_index_by_state
                    .get(&state_index)
                    .copied()
                    .into_iter()
                    .collect::<Vec<_>>();
                return ExpressionBindingPayload {
                    marker_index: index,
                    signal_index: signal_indices.first().copied(),
                    signal_indices,
                    state_index: Some(state_index),
                    component_instance: None,
                    component_binding: None,
                    literal: Some(raw_literal.clone()),
                    compiled_expr: None,
                    source,
                };
            }

            if let Some((instance, binding)) = parse_component_binding(trimmed) {
                return ExpressionBindingPayload {
                    marker_index: index,
                    signal_index: None,
                    signal_indices: Vec::new(),
                    state_index: None,
                    component_instance: Some(instance),
                    component_binding: Some(binding),
                    literal: Some(raw_literal.clone()),
                    compiled_expr: None,
                    source,
                };
            }

            if is_safe_literal_binding(trimmed) {
                return ExpressionBindingPayload {
                    marker_index: index,
                    signal_index: None,
                    signal_indices: Vec::new(),
                    state_index: None,
                    component_instance: None,
                    component_binding: None,
                    literal: Some(raw_literal.clone()),
                    compiled_expr: None,
                    source,
                };
            }

            let analysis = analyze_scoped_expression(trimmed, &runtime_replacements);
            let state_index = resolve_state_index_from_free_identifiers(
                &analysis.free_identifiers,
                &hoisted.state_bindings,
            );
            let signal_indices = collect_signal_indices_from_free_identifiers(
                &analysis.free_identifiers,
                &hoisted.state_bindings,
                &signal_index_by_state,
            );
            ExpressionBindingPayload {
                marker_index: index,
                signal_index: if signal_indices.len() == 1 {
                    signal_indices.first().copied()
                } else {
                    None
                },
                signal_indices,
                state_index,
                component_instance: None,
                component_binding: None,
                literal: Some(raw_literal),
                compiled_expr: Some(finalize_runtime_expression(&analysis.rewritten)),
                source,
            }
        })
        .collect()
}

fn resolve_raw_expression_literal(
    raw_expr: &str,
    rewritten_expr: &str,
    source: Option<&SourceSpanPayload>,
) -> String {
    let trimmed_raw = raw_expr.trim();
    if !trimmed_raw.is_empty() {
        return trimmed_raw.to_string();
    }

    let snippet = source
        .and_then(|value| value.snippet.as_deref())
        .map(str::trim)
        .unwrap_or("");

    if let Some(inner) = snippet.strip_prefix('{').and_then(|value| value.strip_suffix('}')) {
        let trimmed = inner.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    rewritten_expr.to_string()
}

fn resolve_direct_state_index(expr: &str, state_bindings: &[HoistedStateBinding]) -> Option<usize> {
    if !is_identifier(expr) {
        return None;
    }
    let free_identifiers = [expr.to_string()].into_iter().collect::<BTreeSet<_>>();
    resolve_state_index_from_free_identifiers(&free_identifiers, state_bindings)
}

fn is_safe_literal_binding(expr: &str) -> bool {
    is_primitive_literal(expr) || is_safe_member_chain_literal(expr)
}

fn is_identifier(expr: &str) -> bool {
    identifier_match_re().is_match(expr)
}

fn is_primitive_literal(expr: &str) -> bool {
    if matches!(expr, "true" | "false" | "null" | "undefined") {
        return true;
    }
    if primitive_number_re().is_match(expr) {
        return true;
    }
    if expr.len() >= 2 {
        let bytes = expr.as_bytes();
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"')
            || (first == b'\'' && last == b'\'')
            || (first == b'`' && last == b'`')
        {
            return true;
        }
    }
    false
}

fn is_safe_member_chain_literal(expr: &str) -> bool {
    safe_member_chain_re().is_match(expr)
}

fn collect_signal_indices_from_free_identifiers(
    free_identifiers: &BTreeSet<String>,
    state_bindings: &[HoistedStateBinding],
    signal_index_by_state: &BTreeMap<usize, usize>,
) -> Vec<usize> {
    let mut signal_indices = BTreeSet::new();
    for ident in free_identifiers {
        let Some(state_index) = resolve_direct_state_index(ident, state_bindings) else {
            continue;
        };
        let Some(signal_index) = signal_index_by_state.get(&state_index).copied() else {
            continue;
        };
        signal_indices.insert(signal_index);
    }
    signal_indices.into_iter().collect()
}

fn build_runtime_expression_replacements(
    state_bindings: &[HoistedStateBinding],
    signal_index_by_state: &BTreeMap<usize, usize>,
) -> BTreeMap<String, String> {
    let mut alias_usage = BTreeMap::new();
    for (state_index, binding) in state_bindings.iter().enumerate() {
        let Some(alias) = derive_state_alias(&binding.key) else {
            continue;
        };
        if alias == binding.key {
            continue;
        }
        let entry = alias_usage.entry(alias).or_insert((0usize, 0usize));
        if signal_index_by_state.contains_key(&state_index) {
            entry.0 += 1;
        } else {
            entry.1 += 1;
        }
    }

    let mut replacements = BTreeMap::new();
    for (state_index, binding) in state_bindings.iter().enumerate() {
        let Some(signal_id) = signal_index_by_state.get(&state_index).copied() else {
            continue;
        };
        replacements.insert(
            binding.key.clone(),
            format!("signalMap.get({signal_id}).get()"),
        );
        if let Some(alias) = derive_state_alias(&binding.key) {
            if alias != binding.key && matches!(alias_usage.get(&alias), Some((1, 0))) {
                replacements.insert(alias, format!("signalMap.get({signal_id}).get()"));
            }
        }
    }
    replacements
}

fn finalize_runtime_expression(compiled_expr: &str) -> String {
    let replacements = BTreeMap::from([(
        "__zenith_fragment".to_string(),
        "__ctx.fragment".to_string(),
    )]);
    analyze_scoped_expression(compiled_expr, &replacements).rewritten
}

fn derive_state_alias(key: &str) -> Option<String> {
    if key.is_empty() || !key.starts_with("__") || key.starts_with("__z_frag_") {
        return None;
    }
    let segments = key.split('_').filter(|segment| !segment.is_empty());
    for candidate in segments.rev() {
        if is_identifier(candidate) {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Extract identifiers from an expression and resolve to state_index if exactly one
/// state binding matches (by key suffix `_ident`).
fn resolve_state_index_from_free_identifiers(
    free_identifiers: &BTreeSet<String>,
    state_bindings: &[HoistedStateBinding],
) -> Option<usize> {
    let mut matched_index: Option<usize> = None;
    for ident in free_identifiers {
        if ident == "true" || ident == "false" || ident == "null" || ident == "undefined" {
            continue;
        }
        for (idx, binding) in state_bindings.iter().enumerate() {
            if binding.key == *ident
                || derive_state_alias(&binding.key).as_deref() == Some(ident.as_str())
            {
                if matched_index.is_some() && matched_index != Some(idx) {
                    return None;
                }
                matched_index = Some(idx);
                break;
            }
        }
    }
    matched_index
}

fn parse_component_binding(expr: &str) -> Option<(String, String)> {
    let mut segments = expr.split('.');
    let instance = segments.next()?;
    let binding = segments.next()?;
    if segments.next().is_some() {
        return None;
    }
    if !instance.starts_with('c') || instance.len() < 2 {
        return None;
    }
    if !instance[1..].chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    if binding.is_empty()
        || !binding
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '$')
    {
        return None;
    }
    Some((instance.to_string(), binding.to_string()))
}

fn map_markers(markers: Vec<MarkerBinding>, source_path: &str, source_input: &str) -> Vec<MarkerPayload> {
    markers
        .into_iter()
        .map(|marker| MarkerPayload {
            index: marker.index,
            kind: match marker.kind {
                MarkerKind::Text => "text",
                MarkerKind::Attr => "attr",
                MarkerKind::Event => "event",
            }
            .to_string(),
            selector: marker.selector,
            attr: marker.attr,
            source: map_source_span(source_path, source_input, marker.source),
        })
        .collect()
}

fn map_events(events: Vec<EventBinding>, source_path: &str, source_input: &str) -> Vec<EventPayload> {
    events
        .into_iter()
        .map(|event| EventPayload {
            index: event.index,
            event: event.event,
            selector: event.selector,
            source: map_source_span(source_path, source_input, event.source),
        })
        .collect()
}

fn map_ref_bindings(
    bindings: Vec<RefBinding>,
    source_path: &str,
    source_input: &str,
) -> Vec<RefBindingPayload> {
    bindings
        .into_iter()
        .map(|binding| RefBindingPayload {
            index: binding.index,
            identifier: binding.identifier,
            selector: binding.selector,
            source: map_source_span(source_path, source_input, binding.source),
        })
        .collect()
}

fn map_source_span(
    source_path: &str,
    source_input: &str,
    source: Option<SourceSpan>,
) -> Option<SourceSpanPayload> {
    source.map(|span| SourceSpanPayload {
        file: source_path.to_string(),
        start: SourcePositionPayload {
            line: span.start.line,
            column: span.start.column,
        },
        end: SourcePositionPayload {
            line: span.end.line,
            column: span.end.column,
        },
        snippet: extract_source_span_snippet(source_input, &span),
    })
}

fn extract_source_span_snippet(source_input: &str, span: &SourceSpan) -> Option<String> {
    let lines = source_input.lines().collect::<Vec<_>>();
    let start_line = span.start.line.checked_sub(1)?;
    let end_line = span.end.line.checked_sub(1)?;
    if start_line >= lines.len() || end_line >= lines.len() || start_line > end_line {
        return None;
    }

    let mut snippet = String::new();
    for line_index in start_line..=end_line {
        let line = lines[line_index];
        let start_column = if line_index == start_line {
            span.start.column.saturating_sub(1)
        } else {
            0
        };
        let end_column = if line_index == end_line {
            span.end.column.saturating_sub(1)
        } else {
            line.chars().count()
        };
        if end_column < start_column {
            return None;
        }
        snippet.push_str(&slice_columns(line, start_column, end_column));
        if line_index != end_line {
            snippet.push('\n');
        }
    }

    Some(snippet)
}

fn slice_columns(line: &str, start_column: usize, end_column: usize) -> String {
    line.chars()
        .enumerate()
        .filter_map(|(index, ch)| {
            if index >= start_column && index < end_column {
                Some(ch)
            } else {
                None
            }
        })
        .collect()
}

fn map_warnings(warnings: Vec<TransformWarning>) -> Vec<CompileWarning> {
    warnings
        .into_iter()
        .map(|warning| CompileWarning {
            code: warning.code,
            message: warning.message,
            line: warning.line,
            column: warning.column,
        })
        .collect()
}

fn map_warning_diagnostic(warning: &CompileWarning) -> CompileDiagnostic {
    CompileDiagnostic {
        code: warning.code.clone(),
        message: warning.message.clone(),
        severity: CompileDiagnosticSeverity::Warning,
        range: single_char_range(warning.line, warning.column),
        source: "compiler".to_string(),
        suggestion: warning_suggestion(warning),
        fixes: Vec::new(),
        related_information: Vec::new(),
        tags: Vec::new(),
        docs_path: warning_docs_path(warning),
    }
}

fn warning_suggestion(warning: &CompileWarning) -> Option<String> {
    if warning.code == "ZEN-EVT-UNKNOWN" {
        let re = Regex::new(r"Did you mean '([^']+)'\?").ok()?;
        let candidate = re
            .captures(&warning.message)
            .and_then(|captures| captures.get(1))
            .map(|m| m.as_str())?;
        return Some(format!("Use on:{candidate}={{handler}}."));
    }

    None
}

fn warning_docs_path(warning: &CompileWarning) -> Option<String> {
    if warning.code.starts_with("ZEN-DOM-") {
        return Some("docs/documentation/reactivity/dom-and-environment.md".to_string());
    }
    if warning.code == "ZEN-EVT-UNKNOWN" {
        return Some("docs/documentation/syntax/events.md".to_string());
    }
    None
}

fn diagnostic_from_error_message(message: &str, input: &str) -> CompileDiagnostic {
    if let Some(diagnostic) = script_contract_diagnostic_from_message(message, input) {
        return diagnostic;
    }
    if let Some(diagnostic) = event_contract_diagnostic_from_message(message) {
        return diagnostic;
    }

    CompileDiagnostic {
        code: "ZENITH-COMPILER".to_string(),
        message: message.to_string(),
        severity: CompileDiagnosticSeverity::Error,
        range: single_char_range(1, 1),
        source: "compiler".to_string(),
        suggestion: None,
        fixes: Vec::new(),
        related_information: Vec::new(),
        tags: Vec::new(),
        docs_path: Some("docs/documentation/guides/troubleshooting.md".to_string()),
    }
}

fn script_contract_diagnostic_from_message(
    message: &str,
    input: &str,
) -> Option<CompileDiagnostic> {
    if !message.starts_with("Zenith requires TypeScript scripts. Add lang=\"ts\".") {
        return None;
    }

    let script_re = Regex::new(r"#script(\d+)").ok()?;
    let script_id = script_re
        .captures(message)
        .and_then(|captures| captures.get(1))
        .and_then(|m| m.as_str().parse::<usize>().ok())
        .unwrap_or(0);
    let reason = message
        .lines()
        .find_map(|line| line.strip_prefix("Reason: "))
        .unwrap_or("Compiler contract failure");
    let range = locate_script_range(input, script_id).unwrap_or_else(|| single_char_range(1, 1));

    let (code, suggestion, docs_path) = if reason.contains("missing lang=\"ts\" annotation") {
        (
            "ZEN-SCRIPT-MISSING-TS",
            Some("Use <script lang=\"ts\">.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("invalid script language annotation") {
        (
            "ZEN-SCRIPT-INVALID-LANG",
            Some("Use lang=\"ts\" on the script block.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("invalid script setup annotation") {
        (
            "ZEN-SCRIPT-INVALID-SETUP",
            Some("Use setup=\"ts\" or switch to lang=\"ts\".".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("malformed `lang` attribute") {
        (
            "ZEN-SCRIPT-MALFORMED-LANG",
            Some("Fix the lang attribute syntax and set it to \"ts\".".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("malformed `setup` attribute") {
        (
            "ZEN-SCRIPT-MALFORMED-SETUP",
            Some("Fix the setup attribute syntax and set it to \"ts\".".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("duplicate `lang` attribute") {
        (
            "ZEN-SCRIPT-DUP-LANG",
            Some("Keep a single lang=\"ts\" attribute.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("duplicate `setup` attribute") {
        (
            "ZEN-SCRIPT-DUP-SETUP",
            Some("Keep a single setup=\"ts\" attribute.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("ambiguous script attributes") {
        (
            "ZEN-SCRIPT-AMBIGUOUS-ATTRS",
            Some("Use either lang=\"ts\" or setup=\"ts\", not both.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("nested <script> tags inside markup") {
        (
            "ZEN-SCRIPT-NESTED",
            Some("Keep script blocks at the file root.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("missing closing </script>") {
        (
            "ZEN-SCRIPT-UNCLOSED",
            Some("Add the missing </script> closing tag.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("missing closing `>`") {
        (
            "ZEN-SCRIPT-MALFORMED-TAG",
            Some("Close the opening <script> tag with `>`.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    } else if reason.contains("Component scripts cannot create runtime scope boundaries") {
        (
            "ZEN-SCRIPT-RUNTIME-BOUNDARY",
            Some("Remove runtime boundary primitives from component scripts.".to_string()),
            "docs/documentation/contracts/component-script-hoisting.md",
        )
    } else {
        (
            "ZEN-SCRIPT-CONTRACT",
            Some("Follow the Zenith script boundary contract.".to_string()),
            "docs/documentation/contracts/script-boundary.md",
        )
    };

    Some(CompileDiagnostic {
        code: code.to_string(),
        message: message.to_string(),
        severity: CompileDiagnosticSeverity::Error,
        range,
        source: "compiler".to_string(),
        suggestion,
        fixes: Vec::new(),
        related_information: Vec::new(),
        tags: Vec::new(),
        docs_path: Some(docs_path.to_string()),
    })
}

fn event_contract_diagnostic_from_message(message: &str) -> Option<CompileDiagnostic> {
    let (code, suggestion) =
        if message.starts_with("Event handlers must not be direct call expressions.") {
            (
                "ZEN-EVT-DIRECT-CALL",
                Some("Pass a function reference or inline function expression.".to_string()),
            )
        } else if message.starts_with("Event attributes do not accept string handlers.") {
            (
                "ZEN-EVT-STRING-HANDLER",
                Some("Use on:event={handler} with a function-valued expression.".to_string()),
            )
        } else {
            return None;
        };

    let line_col_re = Regex::new(r"at line (\d+), column (\d+)").ok()?;
    let captures = line_col_re.captures(message)?;
    let line = captures
        .get(1)
        .and_then(|m| m.as_str().parse::<usize>().ok())
        .unwrap_or(1);
    let column = captures
        .get(2)
        .and_then(|m| m.as_str().parse::<usize>().ok())
        .unwrap_or(1);

    Some(CompileDiagnostic {
        code: code.to_string(),
        message: message.to_string(),
        severity: CompileDiagnosticSeverity::Error,
        range: single_char_range(line, column),
        source: "compiler".to_string(),
        suggestion,
        fixes: Vec::new(),
        related_information: Vec::new(),
        tags: Vec::new(),
        docs_path: Some("docs/documentation/syntax/events.md".to_string()),
    })
}

fn locate_script_range(input: &str, script_id: usize) -> Option<CompileDiagnosticRange> {
    let mut cursor = 0usize;
    let mut index = 0usize;

    while let Some(relative_start) = input[cursor..].find("<script") {
        let start_offset = cursor + relative_start;
        if index == script_id {
            let end_offset_exclusive = input[start_offset..]
                .find('>')
                .map(|relative_end| start_offset + relative_end + 1)
                .unwrap_or_else(|| (start_offset + "<script".len()).min(input.len()));
            return Some(range_from_offsets(
                input,
                start_offset,
                end_offset_exclusive,
            ));
        }
        cursor = start_offset + "<script".len();
        index += 1;
    }

    None
}

fn range_from_offsets(
    input: &str,
    start_offset: usize,
    end_offset_exclusive: usize,
) -> CompileDiagnosticRange {
    let start = offset_to_position(input, start_offset);
    let inclusive_end = if end_offset_exclusive > start_offset {
        end_offset_exclusive.saturating_sub(1)
    } else {
        start_offset
    };
    let end = offset_to_position(input, inclusive_end);

    CompileDiagnosticRange { start, end }
}

fn offset_to_position(input: &str, offset: usize) -> CompileDiagnosticPosition {
    let safe_offset = offset.min(input.len());
    let prefix = &input[..safe_offset];
    let line = prefix.matches('\n').count() + 1;
    let column = prefix
        .rsplit('\n')
        .next()
        .map(|segment| segment.chars().count() + 1)
        .unwrap_or(1);

    CompileDiagnosticPosition { line, column }
}

fn single_char_range(line: usize, column: usize) -> CompileDiagnosticRange {
    CompileDiagnosticRange {
        start: CompileDiagnosticPosition { line, column },
        end: CompileDiagnosticPosition {
            line,
            column: column.saturating_add(1),
        },
    }
}
