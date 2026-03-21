//! Arrow-parameter TypeScript annotation stripper.
//!
//! Scans a compiled expression string, identifies arrow-function
//! parameter lists `(params) =>`, and strips TypeScript type
//! annotations from those parameters only.
//!
//! Everything outside arrow parameter lists is left untouched:
//! ternaries (`a ? b : c`), object literals (`{ key: value }`),
//! string/template literals, etc.

/// Strip TypeScript type annotations from arrow function parameter
/// lists within a JavaScript expression string.
///
/// Only modifies text inside `(...)` immediately followed by `=>`.
pub fn strip_ts_param_annotations(expr: &str) -> String {
    let chars: Vec<char> = expr.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(n);
    let mut i = 0;

    while i < n {
        // Skip string literals verbatim.
        if chars[i] == '"' || chars[i] == '\'' {
            i = copy_string_literal(&chars, i, &mut out);
            continue;
        }
        if chars[i] == '`' {
            i = copy_template_literal(&chars, i, &mut out);
            continue;
        }

        // When we see `(`, probe ahead for `(params) =>`.
        if chars[i] == '(' {
            if let Some((close, arrow)) = probe_arrow_params(&chars, i) {
                let params: String = chars[i + 1..close].iter().collect();
                if params.contains(':') {
                    let cleaned = strip_params(&params);
                    out.push('(');
                    out.push_str(&cleaned);
                    out.push(')');
                    // Preserve whitespace between ) and =>
                    for j in (close + 1)..arrow {
                        out.push(chars[j]);
                    }
                    out.push('=');
                    out.push('>');
                    i = arrow + 2;
                    continue;
                }
            }
        }

        out.push(chars[i]);
        i += 1;
    }

    out
}

// ── String literal helpers ──────────────────────────────────────

fn copy_string_literal(chars: &[char], start: usize, out: &mut String) -> usize {
    let quote = chars[start];
    out.push(quote);
    let mut i = start + 1;
    let n = chars.len();
    while i < n {
        if chars[i] == '\\' && i + 1 < n {
            out.push(chars[i]);
            out.push(chars[i + 1]);
            i += 2;
            continue;
        }
        out.push(chars[i]);
        if chars[i] == quote {
            i += 1;
            break;
        }
        i += 1;
    }
    i
}

fn copy_template_literal(chars: &[char], start: usize, out: &mut String) -> usize {
    out.push('`');
    let mut i = start + 1;
    let n = chars.len();
    while i < n {
        if chars[i] == '\\' && i + 1 < n {
            out.push(chars[i]);
            out.push(chars[i + 1]);
            i += 2;
            continue;
        }
        if chars[i] == '`' {
            out.push('`');
            i += 1;
            break;
        }
        if chars[i] == '$' && i + 1 < n && chars[i + 1] == '{' {
            out.push('$');
            out.push('{');
            i += 2;
            let mut depth = 1u32;
            while i < n && depth > 0 {
                if chars[i] == '{' {
                    depth += 1;
                }
                if chars[i] == '}' {
                    depth -= 1;
                }
                out.push(chars[i]);
                i += 1;
            }
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    i
}

// ── Arrow detection ─────────────────────────────────────────────

/// Starting at `(` at position `open`, find matching `)` then check
/// for `=>` after optional whitespace.
/// Returns `Some((close_pos, arrow_pos))` or `None`.
fn probe_arrow_params(chars: &[char], open: usize) -> Option<(usize, usize)> {
    let n = chars.len();
    debug_assert!(chars[open] == '(');

    let mut depth = 1u32;
    let mut i = open + 1;
    while i < n && depth > 0 {
        match chars[i] {
            '"' | '\'' => {
                i = skip_string(chars, i);
                continue;
            }
            '`' => {
                i = skip_template(chars, i);
                continue;
            }
            '(' => depth += 1,
            ')' => depth -= 1,
            _ => {}
        }
        i += 1;
    }
    if depth != 0 {
        return None;
    }
    let close = i - 1; // position of matching ')'

    // Skip whitespace after ')'
    let mut j = close + 1;
    while j < n && chars[j].is_ascii_whitespace() {
        j += 1;
    }

    // Check for '=>'
    if j + 1 < n && chars[j] == '=' && chars[j + 1] == '>' {
        Some((close, j))
    } else {
        None
    }
}

fn skip_string(chars: &[char], start: usize) -> usize {
    let quote = chars[start];
    let n = chars.len();
    let mut i = start + 1;
    while i < n {
        if chars[i] == '\\' && i + 1 < n {
            i += 2;
            continue;
        }
        if chars[i] == quote {
            return i + 1; // one past closing quote
        }
        i += 1;
    }
    i
}

fn skip_template(chars: &[char], start: usize) -> usize {
    let n = chars.len();
    let mut i = start + 1;
    while i < n {
        if chars[i] == '\\' && i + 1 < n {
            i += 2;
            continue;
        }
        if chars[i] == '`' {
            return i + 1; // one past closing backtick
        }
        if chars[i] == '$' && i + 1 < n && chars[i + 1] == '{' {
            i += 2;
            let mut depth = 1u32;
            while i < n && depth > 0 {
                if chars[i] == '{' {
                    depth += 1;
                }
                if chars[i] == '}' {
                    depth -= 1;
                }
                i += 1;
            }
            continue;
        }
        i += 1;
    }
    i
}

// ── Parameter annotation stripping ──────────────────────────────

/// Strip TS annotations from a comma-separated parameter list.
fn strip_params(params: &str) -> String {
    let chars: Vec<char> = params.chars().collect();
    let n = chars.len();
    let mut parts: Vec<String> = Vec::new();
    let mut start = 0;
    let mut depth = 0u32;
    let mut i = 0;

    while i < n {
        match chars[i] {
            '(' | '[' | '{' => {
                depth += 1;
                i += 1;
            }
            ')' | ']' | '}' => {
                depth = depth.saturating_sub(1);
                i += 1;
            }
            '<' => {
                depth += 1;
                i += 1;
            }
            '>' => {
                depth = depth.saturating_sub(1);
                i += 1;
            }
            '"' | '\'' | '`' => {
                let q = chars[i];
                i += 1;
                while i < n {
                    if chars[i] == '\\' && i + 1 < n {
                        i += 2;
                        continue;
                    }
                    if chars[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            ',' if depth == 0 => {
                let param: String = chars[start..i].iter().collect();
                parts.push(strip_single_param(&param));
                start = i + 1;
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    // Last parameter
    if start <= n {
        let param: String = chars[start..n].iter().collect();
        parts.push(strip_single_param(&param));
    }

    parts.join(",")
}

/// Strip a TS type annotation from a single parameter.
///
/// `" item: string"` → `" item"`
/// `" item: any = 5"` → `" item = 5"`
/// `" ...args: string[]"` → `" ...args"`
/// `" { a, b }: Props"` → `" { a, b }"`
fn strip_single_param(param: &str) -> String {
    let chars: Vec<char> = param.chars().collect();
    let n = chars.len();
    let mut i = 0;

    // Skip leading whitespace
    while i < n && chars[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= n {
        return param.to_string();
    }

    // Skip rest-param prefix `...`
    if i + 2 < n && chars[i] == '.' && chars[i + 1] == '.' && chars[i + 2] == '.' {
        i += 3;
    }

    // Skip the parameter name / destructuring pattern
    if i < n && (chars[i] == '{' || chars[i] == '[') {
        let open = chars[i];
        let close = if open == '{' { '}' } else { ']' };
        let mut depth = 1u32;
        i += 1;
        while i < n && depth > 0 {
            if chars[i] == open {
                depth += 1;
            }
            if chars[i] == close {
                depth -= 1;
            }
            i += 1;
        }
    } else {
        // Simple identifier
        while i < n && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$') {
            i += 1;
        }
    }

    // Optional `?` for optional params
    if i < n && chars[i] == '?' {
        i += 1;
    }

    // Skip whitespace before potential `:`
    while i < n && chars[i].is_ascii_whitespace() {
        i += 1;
    }

    // If no `:`, nothing to strip
    if i >= n || chars[i] != ':' {
        return param.to_string();
    }

    let colon_pos = i;
    i += 1;

    // Scan past the type annotation.
    // Ends at depth-0 `,`, depth-0 `=` (default), or end of param.
    let mut depth = 0u32;
    while i < n {
        match chars[i] {
            '(' | '[' | '{' | '<' => {
                depth += 1;
                i += 1;
            }
            ')' | ']' | '}' | '>' => {
                depth = depth.saturating_sub(1);
                i += 1;
            }
            '=' if depth == 0 => {
                // Distinguish `=>` (function type) from `=` (default)
                if i + 1 < n && chars[i + 1] == '>' {
                    i += 2;
                    continue;
                }
                break; // default value — stop scanning type
            }
            ',' if depth == 0 => break,
            '"' | '\'' | '`' => {
                let q = chars[i];
                i += 1;
                while i < n {
                    if chars[i] == '\\' && i + 1 < n {
                        i += 2;
                        continue;
                    }
                    if chars[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            _ => {
                i += 1;
            }
        }
    }

    // Rebuild: everything before colon + everything from current pos
    let before: String = chars[..colon_pos].iter().collect();
    let after: String = if i < n {
        chars[i..].iter().collect()
    } else {
        String::new()
    };

    // Trim trailing whitespace from `before` and add a space before
    // default `=` if needed
    let before_trimmed = before.trim_end();
    if after.starts_with('=') && !after.starts_with("=>") {
        format!("{} {}", before_trimmed, after.trim_start())
    } else {
        format!("{}{}", before_trimmed, after)
    }
}

#[cfg(test)]
mod tests {
    use super::strip_ts_param_annotations;

    // ── Positive: annotations that must be stripped ──────────────

    #[test]
    fn single_string_param() {
        assert_eq!(
            strip_ts_param_annotations("items.map((item: string) => item)"),
            "items.map((item) => item)"
        );
    }

    #[test]
    fn two_params() {
        assert_eq!(
            strip_ts_param_annotations("items.map((item: any, index: number) => item)"),
            "items.map((item, index) => item)"
        );
    }

    #[test]
    fn generic_type() {
        assert_eq!(
            strip_ts_param_annotations("items.map((item: Record<string, any>) => item)"),
            "items.map((item) => item)"
        );
    }

    #[test]
    fn array_type() {
        assert_eq!(
            strip_ts_param_annotations("items.map((item: Array<string>) => item)"),
            "items.map((item) => item)"
        );
    }

    #[test]
    fn rest_param() {
        assert_eq!(
            strip_ts_param_annotations("fn((...args: string[]) => args)"),
            "fn((...args) => args)"
        );
    }

    #[test]
    fn destructured_param() {
        assert_eq!(
            strip_ts_param_annotations("fn(({ a, b }: Props) => a)"),
            "fn(({ a, b }) => a)"
        );
    }

    #[test]
    fn default_value_preserved() {
        assert_eq!(
            strip_ts_param_annotations("fn((x: string = \"hi\") => x)"),
            "fn((x = \"hi\") => x)"
        );
    }

    #[test]
    fn nested_arrows() {
        assert_eq!(
            strip_ts_param_annotations(
                "a.map((x: string) => b.filter((y: number) => y))"
            ),
            "a.map((x) => b.filter((y) => y))"
        );
    }

    // ── Negative: expressions that must NOT be changed ──────────

    #[test]
    fn ternary_untouched() {
        let expr = "a ? b : c";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn object_literal_untouched() {
        let expr = "({ key: value })";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn string_colon_untouched() {
        let expr = "\"text:text\"";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn template_colon_untouched() {
        let expr = "`text:text`";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn no_annotation_passthrough() {
        let expr = "items.map((item) => item)";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn no_arrow_passthrough() {
        let expr = "foo(bar, baz)";
        assert_eq!(strip_ts_param_annotations(expr), expr);
    }

    #[test]
    fn mixed_expression_only_arrow_stripped() {
        assert_eq!(
            strip_ts_param_annotations(
                "condition ? items.map((x: string) => x) : fallback"
            ),
            "condition ? items.map((x) => x) : fallback"
        );
    }

    #[test]
    fn function_type_annotation_stripped() {
        assert_eq!(
            strip_ts_param_annotations(
                "fn((cb: (a: number) => void) => cb)"
            ),
            "fn((cb) => cb)"
        );
    }
}
