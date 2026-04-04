use crate::ast::SourceSpan;
use crate::compiler_types::{
    CompileWarning, ComponentInstancePayload, ComponentScriptPayload, EventPayload, HoistedPayload,
    HoistedState, MarkerPayload, RefBindingPayload, SignalPayload, SourcePositionPayload,
    SourceSpanPayload,
};
use crate::script::{
    ComponentInstanceBinding, ComponentScriptAsset, HoistedOutput, HoistedStateBinding,
};
use crate::transform::{EventBinding, MarkerBinding, MarkerKind, RefBinding, TransformWarning};
use std::collections::BTreeMap;

pub(crate) fn strip_html_comments(input: &str) -> String {
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

pub(crate) fn map_hoisted(output: HoistedOutput) -> HoistedPayload {
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

pub(crate) fn map_component_scripts(
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

pub(crate) fn map_component_instances(
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

pub(crate) fn map_signals(hoisted: &HoistedOutput) -> Vec<SignalPayload> {
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

pub(crate) fn map_markers(
    markers: Vec<MarkerBinding>,
    source_path: &str,
    source_input: &str,
) -> Vec<MarkerPayload> {
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

pub(crate) fn map_events(
    events: Vec<EventBinding>,
    source_path: &str,
    source_input: &str,
) -> Vec<EventPayload> {
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

pub(crate) fn map_ref_bindings(
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

pub(crate) fn map_warnings(warnings: Vec<TransformWarning>) -> Vec<CompileWarning> {
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
