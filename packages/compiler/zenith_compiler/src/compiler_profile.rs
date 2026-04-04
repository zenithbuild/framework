use crate::parser::ParserProfileMetrics;
use crate::script::ScriptProfileMetrics;

#[derive(Debug, Clone, Default)]
pub(crate) struct CompileInternalTimings {
    pub(crate) extract_script_blocks_ms: f64,
    pub(crate) strip_html_comments_ms: f64,
    pub(crate) parse_ms: f64,
    pub(crate) transform_ms: f64,
    pub(crate) parser_profile: Option<ParserProfileMetrics>,
    pub(crate) script_profile: Option<ScriptProfileMetrics>,
}

fn round_ms(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

pub(crate) fn compiler_profile_enabled() -> bool {
    matches!(std::env::var("ZENITH_COMPILER_PROFILE").as_deref(), Ok("1"))
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn emit_compiler_profile(
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
