//! Static Expression Evaluator for Zenith Compiler
//!
//! Evaluates expressions at compile time to produce literal strings.
//! Used for resolving HEAD expressions that must be statically rendered.

use std::collections::HashMap;

/// Try to evaluate an expression to a static string value.
/// Returns Some(resolved_string) if successful, None if the expression
/// cannot be statically resolved.
pub fn static_eval(expr: &str, props: &HashMap<String, String>) -> Option<String> {
    let mut trimmed = expr.trim().to_string();

    // Strip trailing semicolon or newline escaped characters if present
    while trimmed.ends_with(';') || trimmed.ends_with('\n') || trimmed.ends_with('\r') {
        trimmed.pop();
    }
    let mut trimmed_str = trimmed.trim();

    // Aggressive Zenith Qualification Strip
    // window.__ZENITH_SCOPES__["..."] . (locals|state|props) . name
    // or just locals.name / state.name / props.name
    if trimmed_str.contains("__ZENITH_SCOPES__") {
        if let Some(last_dot) = trimmed_str.rfind('.') {
            trimmed_str = &trimmed_str[last_dot + 1..];
        }
    } else if trimmed_str.starts_with("locals.")
        || trimmed_str.starts_with("state.")
        || trimmed_str.starts_with("props.")
    {
        if let Some(first_dot) = trimmed_str.find('.') {
            trimmed_str = &trimmed_str[first_dot + 1..];
        }
    }

    // Handle array indexing in stripped string (e.g., "props.items[0]") - simplifies to "items" lookup for now?
    // Actually, for static head resolution, we expect simple identifiers or template literals.
    // Complex state access isn't supported anyway.

    // Final check for scope prefix if it slipped through (e.g., just "scope.x")
    if trimmed_str.starts_with("scope.") {
        trimmed_str = &trimmed_str[6..];
    }

    // Final trim after all stripping
    trimmed_str = trimmed_str.trim();

    // Empty expression
    if trimmed_str.is_empty() {
        return Some(String::new());
    }

    // String literals
    if let Some(literal) = try_parse_string_literal(trimmed_str) {
        return Some(literal);
    }

    // Number literals
    if let Ok(num) = trimmed_str.parse::<f64>() {
        return Some(num.to_string());
    }

    // Boolean/null literals
    match trimmed_str {
        "true" => return Some("true".to_string()),
        "false" => return Some("false".to_string()),
        "null" => return Some("null".to_string()),
        "undefined" => return Some("undefined".to_string()),
        _ => {}
    }

    // Identifiers and Prop lookup
    // If it's a valid identifier, look it up in props
    if is_valid_identifier(trimmed_str) {
        if let Some(value) = props.get(trimmed_str) {
            return Some(value.clone());
        }
        // STRICT MODE: Unknown identifiers are NOT allowed in head
        return None;
    }

    // Re-check ternary, concatenation, and template literals with the potentially stripped string
    if let Some(resolved) = try_resolve_ternary(trimmed_str, props) {
        return Some(resolved);
    }

    if let Some(resolved) = try_resolve_concatenation(trimmed_str, props) {
        return Some(resolved);
    }

    if let Some(resolved) = try_resolve_template_literal(trimmed_str, props) {
        return Some(resolved);
    }

    // STRICT MODE: If we can't resolve at all, return None to trigger compile error
    None
}

/// Try to parse a string literal (single, double, or backtick quoted)
fn try_parse_string_literal(s: &str) -> Option<String> {
    let trimmed = s.trim();

    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        // Remove quotes and unescape basic sequences
        let inner = &trimmed[1..trimmed.len() - 1];
        return Some(unescape_string(inner));
    }

    // Template literal without interpolations
    if trimmed.starts_with('`') && trimmed.ends_with('`') {
        let inner = &trimmed[1..trimmed.len() - 1];
        if !inner.contains("${") {
            return Some(unescape_string(inner));
        }
    }

    None
}

/// Unescape basic string escape sequences
fn unescape_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') => result.push('\n'),
                Some('r') => result.push('\r'),
                Some('t') => result.push('\t'),
                Some('\\') => result.push('\\'),
                Some('"') => result.push('"'),
                Some('\'') => result.push('\''),
                Some('`') => result.push('`'),
                Some(other) => {
                    result.push('\\');
                    result.push(other);
                }
                None => result.push('\\'),
            }
        } else {
            result.push(c);
        }
    }

    result
}

/// Try to resolve a ternary expression
fn try_resolve_ternary(expr: &str, props: &HashMap<String, String>) -> Option<String> {
    // Find the top-level ? and :
    let bytes = expr.as_bytes();
    let mut depth: i32 = 0;
    let mut question_idx = None;
    let mut colon_idx = None;

    let mut i = 0;

    while i < bytes.len() {
        match bytes[i] {
            b'(' | b'[' | b'{' => depth += 1,
            b')' | b']' | b'}' => depth = depth.saturating_sub(1),
            b'?' if depth == 0 && question_idx.is_none() => question_idx = Some(i),
            b':' if depth == 0 && question_idx.is_some() => {
                colon_idx = Some(i);
                break;
            }
            b'"' | b'\'' | b'`' => {
                // Skip string content
                let quote = bytes[i];
                i += 1;
                while i < bytes.len() && bytes[i] != quote {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    if let (Some(q_idx), Some(c_idx)) = (question_idx, colon_idx) {
        let condition = expr[..q_idx].trim();
        let _consequent = expr[q_idx + 1..c_idx].trim();
        let alternate = expr[c_idx + 1..].trim();

        // Try to evaluate condition
        if let Some(cond_value) = static_eval(condition, props) {
            // If condition is true-ish, we'd need the consequent
            // For static resolution, we default to the alternate (else) branch
            // since we can't evaluate runtime conditions
            if cond_value == "true"
                || (!cond_value.is_empty()
                    && cond_value != "false"
                    && cond_value != "null"
                    && cond_value != "undefined"
                    && cond_value != "0")
            {
                // Condition is truthy, try consequent
                if let Some(result) = static_eval(_consequent, props) {
                    return Some(result);
                }
            }
        }

        // Default to alternate branch
        return static_eval(alternate, props);
    }

    None
}

/// Try to resolve string concatenation
fn try_resolve_concatenation(expr: &str, props: &HashMap<String, String>) -> Option<String> {
    if !expr.contains(" + ") {
        return None;
    }

    let mut result = String::new();

    for part in expr.split(" + ") {
        let part = part.trim();
        if let Some(resolved) = static_eval(part, props) {
            result.push_str(&resolved);
        } else {
            return None;
        }
    }

    Some(result)
}

/// Try to resolve a template literal with interpolations
fn try_resolve_template_literal(expr: &str, props: &HashMap<String, String>) -> Option<String> {
    if !expr.starts_with('`') || !expr.ends_with('`') {
        return None;
    }

    let inner = &expr[1..expr.len() - 1];
    let mut result = String::new();
    let chars: Vec<char> = inner.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '$' && chars[i + 1] == '{' {
            // Find matching closing brace
            let start = i + 2;
            let mut depth = 1;
            let mut end = start;

            while end < chars.len() && depth > 0 {
                match chars[end] {
                    '{' => depth += 1,
                    '}' => depth -= 1,
                    _ => {}
                }
                end += 1;
            }

            if depth == 0 {
                let interpolation: String = chars[start..end - 1].iter().collect();
                if let Some(resolved) = static_eval(&interpolation, props) {
                    result.push_str(&resolved);
                } else {
                    return None;
                }
                i = end;
            } else {
                result.push(chars[i]);
                i += 1;
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }

    Some(result)
}

/// Check if a string is a valid JavaScript identifier
fn is_valid_identifier(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }

    let mut chars = s.chars();

    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }

    for c in chars {
        if !c.is_ascii_alphanumeric() && c != '_' && c != '$' {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_string_literals() {
        let props = HashMap::new();
        assert_eq!(static_eval("\"Hello\"", &props), Some("Hello".to_string()));
        assert_eq!(static_eval("'World'", &props), Some("World".to_string()));
    }

    #[test]
    fn test_prop_resolution() {
        let mut props = HashMap::new();
        props.insert("title".to_string(), "Home".to_string());

        assert_eq!(static_eval("title", &props), Some("Home".to_string()));
        assert_eq!(static_eval("props.title", &props), Some("Home".to_string()));
    }

    #[test]
    fn test_concatenation() {
        let mut props = HashMap::new();
        props.insert("title".to_string(), "Home".to_string());

        assert_eq!(
            static_eval("\"Zenith | \" + title", &props),
            Some("Zenith | Home".to_string())
        );
    }

    #[test]
    fn test_template_literal() {
        let mut props = HashMap::new();
        props.insert("title".to_string(), "Home".to_string());

        assert_eq!(
            static_eval("`Zenith | ${title}`", &props),
            Some("Zenith | Home".to_string())
        );
    }

    #[test]
    fn test_ternary() {
        let props = HashMap::new();

        assert_eq!(
            static_eval("true ? 'Yes' : 'No'", &props),
            Some("Yes".to_string())
        );
        assert_eq!(
            static_eval("false ? 'Yes' : 'No'", &props),
            Some("No".to_string())
        );
    }
}

#[test]
fn test_zenith_qualification() {
    let mut props = HashMap::new();
    props.insert("pageTitle".to_string(), "Zenith Home".to_string());

    assert_eq!(
        static_eval(
            "window.__ZENITH_SCOPES__[\"inst0\"].locals.pageTitle;\n",
            &props
        ),
        Some("Zenith Home".to_string())
    );
}
