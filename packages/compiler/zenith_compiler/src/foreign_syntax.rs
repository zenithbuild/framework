use crate::event_contract;

#[path = "foreign_syntax_scan.rs"]
mod foreign_syntax_scan;

pub(crate) fn reject_foreign_zenith_syntax(input: &str) -> Result<(), String> {
    foreign_syntax_scan::ForeignSyntaxScanner::new(input).scan()
}

#[derive(Clone, Copy)]
pub(super) enum ForeignSyntaxKind {
    Control,
    Event,
}

pub(super) struct ForeignSyntaxViolation<'a> {
    pub(super) kind: ForeignSyntaxKind,
    pub(super) token: &'a str,
    pub(super) reason: &'static str,
    pub(super) hint: String,
    pub(super) offset: usize,
}

pub(super) fn classify_attribute_violation<'a>(
    attr_name: &'a str,
    offset: usize,
    is_component_tag: bool,
) -> Option<ForeignSyntaxViolation<'a>> {
    match attr_name {
        "v-if" | "v-else" => Some(control_violation(
            attr_name,
            "Zenith .zen files do not use Vue-style template directives.",
            "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
            offset,
        )),
        "v-for" => Some(control_violation(
            attr_name,
            "Zenith .zen files do not use Vue-style template directives.",
            "Rewrite this iteration using the canonical Zenith iteration syntax supported by the compiler.",
            offset,
        )),
        "@if" | "@else" | "@elseif" => Some(control_violation(
            attr_name,
            "Zenith .zen files do not use Blade/Twig-style directives.",
            "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
            offset,
        )),
        _ => classify_event_attribute_violation(attr_name, offset, is_component_tag),
    }
}

fn classify_event_attribute_violation<'a>(
    attr_name: &'a str,
    offset: usize,
    is_component_tag: bool,
) -> Option<ForeignSyntaxViolation<'a>> {
    if attr_name.starts_with("on:") {
        return None;
    }

    if let Some(event_name) = attr_name.strip_prefix('@') {
        let suggested_event = event_binding_name(event_name);
        let hint = format!(
            "Use on:{suggested_event}={{handle{}}}.",
            handler_suffix(&suggested_event)
        );
        return Some(ForeignSyntaxViolation {
            kind: ForeignSyntaxKind::Event,
            token: attr_name,
            reason: "Zenith binds events as on:<event>={handler}.",
            hint,
            offset,
        });
    }

    if let Some(event_name) = attr_name.strip_prefix("on") {
        if attr_name.len() > 2 && attr_name.as_bytes()[2].is_ascii_uppercase() {
            if is_component_tag {
                return None;
            }
            let suggested_event = event_binding_name(event_name);
            let hint = format!(
                "Use on:{suggested_event}={{handle{}}} instead.",
                handler_suffix(&suggested_event)
            );
            return Some(ForeignSyntaxViolation {
                kind: ForeignSyntaxKind::Event,
                token: attr_name,
                reason: "Zenith does not use camelCase DOM event props in .zen.",
                hint,
                offset,
            });
        }

        let normalized = event_contract::normalize_event_name(event_name);
        if event_contract::is_known_event(&normalized)
            || event_contract::suggest_known_event(&normalized).is_some()
        {
            let suggested_event = event_binding_name(event_name);
            let hint = format!(
                "Use on:{suggested_event}={{handle{}}} instead.",
                handler_suffix(&suggested_event)
            );
            return Some(ForeignSyntaxViolation {
                kind: ForeignSyntaxKind::Event,
                token: attr_name,
                reason: "Zenith does not use DOM event prop attributes in .zen.",
                hint,
                offset,
            });
        }
    }

    None
}

fn event_binding_name(event_name: &str) -> String {
    let normalized = event_contract::normalize_event_name(event_name);
    if event_contract::is_known_event(&normalized) {
        return normalized;
    }
    if let Some(suggested) = event_contract::suggest_known_event(&normalized) {
        return suggested;
    }
    normalized
}

fn handler_suffix(event_name: &str) -> String {
    let mut out = String::new();
    let mut uppercase_next = true;
    for ch in event_name.chars() {
        if ch == ':' || ch == '-' || ch == '_' {
            uppercase_next = true;
            continue;
        }
        if uppercase_next {
            out.extend(ch.to_uppercase());
            uppercase_next = false;
        } else {
            out.push(ch);
        }
    }
    if out.is_empty() {
        "Event".to_string()
    } else {
        out
    }
}

pub(super) fn control_violation<'a>(
    token: &'a str,
    reason: &'static str,
    hint: &'static str,
    offset: usize,
) -> ForeignSyntaxViolation<'a> {
    ForeignSyntaxViolation {
        kind: ForeignSyntaxKind::Control,
        token,
        reason,
        hint: hint.to_string(),
        offset,
    }
}

pub(super) fn format_violation(input: &str, violation: ForeignSyntaxViolation<'_>) -> String {
    let (line, column) = offset_to_line_col(input, violation.offset);
    let label = match violation.kind {
        ForeignSyntaxKind::Control => "control",
        ForeignSyntaxKind::Event => "event",
    };
    format!(
        "Invalid Zenith {label} syntax: {token}\n{reason}\nHint: {hint}\nFound at line {line}, column {column}.",
        token = violation.token,
        reason = violation.reason,
        hint = violation.hint,
    )
}

fn offset_to_line_col(input: &str, offset: usize) -> (usize, usize) {
    let safe_offset = offset.min(input.len());
    let prefix = &input[..safe_offset];
    let line = prefix.matches('\n').count() + 1;
    let column = prefix
        .rsplit('\n')
        .next()
        .map(|segment| segment.chars().count() + 1)
        .unwrap_or(1);
    (line, column)
}

pub(super) fn boundary_before(input: &str, offset: usize) -> bool {
    if offset == 0 {
        return true;
    }
    let Some(prev) = input[..offset].chars().next_back() else {
        return true;
    };
    prev.is_whitespace() || prev == '>'
}

pub(super) fn boundary_after(input: &str, offset: usize) -> bool {
    let Some(next) = input[offset..].chars().next() else {
        return true;
    };
    next.is_whitespace() || next == '<' || next == '(' || next == '{' || next == '}'
}

pub(super) fn is_tag_name_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == ':'
}

pub(super) fn is_attribute_name_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == ':' || ch == '@'
}
