use crate::compiler_types::{ExpressionBindingPayload, SignalPayload, SourceSpanPayload};
use crate::expression_scope::analyze_scoped_expression;
use crate::script::{HoistedOutput, HoistedStateBinding};
use regex::Regex;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

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

pub(crate) fn map_expression_bindings(
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

    if let Some(inner) = snippet
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
    {
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
