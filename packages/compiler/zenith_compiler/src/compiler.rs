use crate::codegen::generate;
use crate::compiler_diagnostics::{diagnostic_from_error_message, map_warning_diagnostic};
use crate::compiler_expression_bindings::map_expression_bindings;
use crate::compiler_expression_validate::validate_unbound_expressions;
use crate::compiler_panic::catch_unwind_silent;
use crate::compiler_payload_map::{
    map_component_instances, map_component_scripts, map_events, map_hoisted, map_markers,
    map_ref_bindings, map_signals, map_warnings, strip_html_comments,
};
use crate::compiler_profile::{
    compiler_profile_enabled, emit_compiler_profile, CompileInternalTimings,
};
use crate::foreign_syntax::reject_foreign_zenith_syntax;
use crate::parser::Parser;
use crate::script::{
    extract_script_blocks_with_profile, ComponentInstanceBinding, ComponentScriptAsset,
    HoistedOutput,
};
use crate::transform::{transform, EventBinding, MarkerBinding, RefBinding, TransformWarning};
use std::collections::BTreeMap;
use std::time::Instant;

pub use crate::compiler_types::{
    CompileDiagnostic, CompileDiagnosticFix, CompileDiagnosticPosition, CompileDiagnosticRange,
    CompileDiagnosticRelatedInformation, CompileDiagnosticSeverity, CompileDiagnosticTag,
    CompileOptions, CompileReport, CompileWarning, CompilerOutput, ComponentInstancePayload,
    ComponentScriptPayload, EventPayload, ExpressionBindingPayload, GraphNodePayload,
    HoistedPayload, HoistedState, MarkerPayload, RefBindingPayload, SignalPayload,
    SourcePositionPayload, SourceSpanPayload, IR_VERSION,
};

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
    let result = catch_unwind_silent(|| {
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

    reject_foreign_zenith_syntax(&preprocessed)?;

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
    if !options.internal_allow_unbound_markup {
        validate_unbound_expressions(
            &raw_expressions,
            &scripts,
            &component_scripts,
            &markers,
            &ref_bindings,
            &component_instances,
        )?;
    }
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
    let result = catch_unwind_silent(|| {
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
