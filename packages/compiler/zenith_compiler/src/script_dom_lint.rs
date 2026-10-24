use regex::Regex;
use std::sync::OnceLock;

fn dom_query_selector_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"querySelector\s*\(").expect("valid querySelector regex"))
}

fn dom_query_selector_all_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"querySelectorAll\s*\(").expect("valid querySelectorAll regex"))
}

fn dom_get_element_by_id_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"getElementById\s*\(").expect("valid getElementById regex"))
}

fn dom_add_event_listener_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\.addEventListener\s*\(").expect("valid addEventListener regex"))
}

fn dom_typeof_eq_undefined_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"typeof\s+(?:window|document)\s*===\s*["']undefined["']"#)
            .expect("valid typeof undefined eq regex")
    })
}

fn dom_typeof_neq_undefined_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"typeof\s+(?:window|document)\s*!==\s*["']undefined["']"#)
            .expect("valid typeof undefined neq regex")
    })
}

fn dom_global_this_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"globalThis\.(?:window|document)\b")
            .expect("valid globalThis window/document regex")
    })
}

/// DOM lint warning emitted by script scan. Same shape as CompileWarning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptDomLint {
    pub code: String,
    pub message: String,
    pub line: usize,
    pub column: usize,
}

/// Collect ZEN-DOM-* lint warnings from script source. Does not fail compilation.
pub fn collect_dom_lint_warnings(
    source: &str,
    _source_path: &str,
    _script_id: usize,
    line_offset: usize,
) -> Vec<ScriptDomLint> {
    let mut warnings = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        let line_num = line_offset + i + 1;
        let prev_line = if i > 0 { lines[i - 1] } else { "" };

        // ZEN-DOM-QUERY (with escape hatch)
        for (re, name, needle) in [
            (dom_query_selector_re(), "querySelector", "querySelector"),
            (
                dom_query_selector_all_re(),
                "querySelectorAll",
                "querySelectorAll",
            ),
            (
                dom_get_element_by_id_re(),
                "getElementById",
                "getElementById",
            ),
        ] {
            if line.contains(needle) && re.is_match(line) {
                let suppressed =
                    prev_line.trim().starts_with("//") && prev_line.contains("zen-allow:dom-query");
                if !suppressed {
                    let col = line.find(name).unwrap_or(0) + 1;
                    warnings.push(ScriptDomLint {
                        code: "ZEN-DOM-QUERY".to_string(),
                        message: "Use ref<T>() + zenMount for DOM nodes, or collectRefs() for multiple refs. Suppress with // zen-allow:dom-query <reason>".to_string(),
                        line: line_num,
                        column: col,
                    });
                }
            }
        }

        // ZEN-DOM-LISTENER
        if line.contains(".addEventListener") && dom_add_event_listener_re().is_match(line) {
            let col = line.find(".addEventListener").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-LISTENER".to_string(),
                message: "Use zenOn(target, eventName, handler, options?) and register disposer via zenMount ctx.cleanup.".to_string(),
                line: line_num,
                column: col,
            });
        }

        // ZEN-DOM-WRAPPER: detect SSR guard patterns (typeof window/document === 'undefined' ? ... : ...)
        if line.contains("typeof")
            && line.contains("undefined")
            && (line.contains("window") || line.contains("document"))
            && (dom_typeof_eq_undefined_re().is_match(line)
                || dom_typeof_neq_undefined_re().is_match(line))
        {
            let col = line.find("typeof").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-WRAPPER".to_string(),
                message: "Use zenWindow() / zenDocument().".to_string(),
                line: line_num,
                column: col,
            });
        }
        if line.contains("globalThis") && dom_global_this_re().is_match(line) {
            let col = line.find("globalThis").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-WRAPPER".to_string(),
                message: "Use zenWindow() / zenDocument().".to_string(),
                line: line_num,
                column: col,
            });
        }
    }

    warnings
}
