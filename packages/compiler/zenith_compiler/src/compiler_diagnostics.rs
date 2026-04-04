use crate::compiler_types::{
    CompileDiagnostic, CompileDiagnosticPosition, CompileDiagnosticRange,
    CompileDiagnosticSeverity, CompileWarning,
};
use regex::Regex;

pub(crate) fn map_warning_diagnostic(warning: &CompileWarning) -> CompileDiagnostic {
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

pub(crate) fn diagnostic_from_error_message(message: &str, input: &str) -> CompileDiagnostic {
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
