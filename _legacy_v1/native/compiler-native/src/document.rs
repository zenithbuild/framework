//! # Zenith Document Compilation Module
//!
//! This module handles compilation of Document Modules — `.zen` files where the root
//! node is `<html>`. Document modules follow a fundamentally different compilation
//! path than component modules:
//!
//! ## Key Invariants
//!
//! 1. **Document Detection**: A file is a Document Module iff root node is `<html>`
//! 2. **Compile-Time Resolution**: ALL expressions in document must resolve at compile time
//! 3. **Static Script Execution**: Script is executed once at compile time to produce scope
//! 4. **Zero Runtime Mutation**: No hydration, no runtime patching of `<head>` or `<html>`
//! 5. **View-Source Correctness**: Output HTML is final without JavaScript execution
//!
//! ## Forbidden in Document Script
//! - `state` declarations
//! - `effects` or lifecycle hooks
//! - Browser APIs (`window`, `document`, etc.)
//! - Async code
//! - Runtime mutation

use regex::Regex;
use std::collections::HashMap;

use crate::validate::TemplateNode;

/// Document compilation scope containing resolved props and locals
#[derive(Debug, Clone, Default)]
pub struct DocumentScope {
    /// Props passed to the document (e.g., from page/route)
    pub props: HashMap<String, String>,
    /// Local const declarations from script
    pub locals: HashMap<String, String>,
}

impl DocumentScope {
    pub fn with_props(props: HashMap<String, String>) -> Self {
        Self {
            props,
            locals: HashMap::new(),
        }
    }

    /// Look up a value in the scope (locals first, then props)
    pub fn get(&self, name: &str) -> Option<&String> {
        self.locals.get(name).or_else(|| self.props.get(name))
    }

    /// Add a local variable to the scope
    pub fn add_local(&mut self, name: String, value: String) {
        self.locals.insert(name, value);
    }
}

/// Errors that can occur during document compilation
#[derive(Debug, Clone)]
pub enum DocumentCompileError {
    UnresolvedExpression {
        expr: String,
        reason: String,
    },
    ForbiddenScriptConstruct {
        construct: String,
        line: Option<usize>,
    },
}

impl std::fmt::Display for DocumentCompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnresolvedExpression { expr, reason } => {
                write!(f, "Cannot resolve expression '{}': {}", expr, reason)
            }
            Self::ForbiddenScriptConstruct { construct, line } => {
                if let Some(l) = line {
                    write!(f, "Forbidden construct '{}' at line {}", construct, l)
                } else {
                    write!(f, "Forbidden construct '{}' in document script", construct)
                }
            }
        }
    }
}

/// Check if a template represents a Document Module
/// A Document Module has `<html>` as its root node
pub fn is_document_module(nodes: &[TemplateNode]) -> bool {
    // Check if first element is <html>
    for node in nodes.iter() {
        match node {
            TemplateNode::Element(elem) => {
                return elem.tag.eq_ignore_ascii_case("html");
            }
            TemplateNode::Text(text) => {
                // Skip whitespace-only text nodes
                if text.value.trim().is_empty() {
                    continue;
                }
                // Non-whitespace text before any element = not a document
                return false;
            }
            TemplateNode::Doctype(_) => {
                // DOCTYPE is allowed before <html>
                continue;
            }
            TemplateNode::Component(c) => {
                // Component nodes after resolution - check if first child is <html>
                // Recurse into component children
                return is_document_module(&c.children);
            }
            _ => {
                // Any other node type before <html> = not a document
                return false;
            }
        }
    }
    false
}

/// Analyze document script for forbidden constructs
/// Returns Ok(()) if script is valid for document compilation
/// Returns Err with the forbidden construct if invalid
pub fn validate_document_script(script: &str) -> Result<(), DocumentCompileError> {
    // Forbidden patterns in document scripts
    let forbidden_patterns = [
        (r"\bstate\s*[=({]", "state declarations"),
        (r"\blet\s+\w+\s*=\s*state\b", "state bindings"),
        (r"\$effect\s*\(", "$effect() lifecycle"),
        (r"\$mount\s*\(", "$mount() lifecycle"),
        (r"\$unmount\s*\(", "$unmount() lifecycle"),
        (r"\bonMount\s*\(", "onMount() lifecycle"),
        (r"\bonDestroy\s*\(", "onDestroy() lifecycle"),
        (r"\bwindow\.", "window API access"),
        (r"\bdocument\.", "document API access"),
        (r"\blocalStorage\b", "localStorage access"),
        (r"\bsessionStorage\b", "sessionStorage access"),
        (r"\bfetch\s*\(", "fetch() calls"),
        (r"\bawait\s+", "async/await"),
        (r"\basync\s+function", "async functions"),
        (r"\basync\s*\(", "async arrow functions"),
        (r"new\s+Promise\s*\(", "Promise construction"),
        (r"setTimeout\s*\(", "setTimeout"),
        (r"setInterval\s*\(", "setInterval"),
        (r"requestAnimationFrame\s*\(", "requestAnimationFrame"),
    ];

    for (pattern, name) in forbidden_patterns {
        let re = Regex::new(pattern).unwrap();
        if re.is_match(script) {
            return Err(DocumentCompileError::ForbiddenScriptConstruct {
                construct: name.to_string(),
                line: None,
            });
        }
    }

    Ok(())
}

/// Extract const declarations from document script
/// Returns a map of variable name -> expression string
pub fn extract_const_declarations(script: &str) -> HashMap<String, String> {
    let mut consts = HashMap::new();

    // Match: const name = expression;
    // Also match: const name = `template ${literal}`;
    let const_re = Regex::new(r"(?m)^\s*const\s+(\w+)\s*=\s*(.+?)(?:;|\n|$)").unwrap();

    for cap in const_re.captures_iter(script) {
        let name = cap
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let expr = cap
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();

        if !name.is_empty() && !expr.is_empty() {
            consts.insert(name, expr);
        }
    }

    consts
}

/// Execute document script at compile time to build scope
/// This resolves const declarations using the provided props
pub fn execute_document_script(
    script: &str,
    props: &HashMap<String, String>,
) -> Result<DocumentScope, DocumentCompileError> {
    // First validate the script
    validate_document_script(script)?;

    // Create scope with props
    let mut scope = DocumentScope::with_props(props.clone());

    // Extract const declarations
    let consts = extract_const_declarations(script);

    // Resolve each const declaration
    // Note: Order matters - consts may reference earlier consts
    for (name, expr) in &consts {
        match resolve_const_expression(expr, &scope) {
            Some(value) => {
                scope.add_local(name.clone(), value);
            }
            None => {
                return Err(DocumentCompileError::UnresolvedExpression {
                    expr: expr.clone(),
                    reason: format!("Cannot statically resolve const '{}'", name),
                });
            }
        }
    }

    Ok(scope)
}

/// Resolve a const expression using the current scope
/// Returns Some(resolved_string) if successful, None if cannot resolve
fn resolve_const_expression(expr: &str, scope: &DocumentScope) -> Option<String> {
    let trimmed = expr.trim();

    // Template literal: `Zenith | ${props.title}`
    if trimmed.starts_with('`') && trimmed.ends_with('`') {
        return resolve_template_literal(trimmed, scope);
    }

    // String literal
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return Some(trimmed[1..trimmed.len() - 1].to_string());
    }

    // Ternary: condition ? consequent : alternate
    if let Some(result) = resolve_ternary(trimmed, scope) {
        return Some(result);
    }

    // Concatenation: "A" + "B"
    if trimmed.contains(" + ") {
        return resolve_concatenation(trimmed, scope);
    }

    // Variable reference: props.title or just title
    if let Some(value) = resolve_variable_reference(trimmed, scope) {
        return Some(value);
    }

    None
}

/// Resolve template literal with interpolations
fn resolve_template_literal(expr: &str, scope: &DocumentScope) -> Option<String> {
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
                if let Some(resolved) = resolve_const_expression(&interpolation, scope) {
                    result.push_str(&resolved);
                } else {
                    return None; // Cannot resolve interpolation
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

/// Resolve ternary expression
fn resolve_ternary(expr: &str, scope: &DocumentScope) -> Option<String> {
    // Find top-level ? and :
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
        let consequent = expr[q_idx + 1..c_idx].trim();
        let alternate = expr[c_idx + 1..].trim();

        // Evaluate condition
        if let Some(cond_value) = resolve_const_expression(condition, scope) {
            let is_truthy = !cond_value.is_empty()
                && cond_value != "false"
                && cond_value != "null"
                && cond_value != "undefined"
                && cond_value != "0";

            if is_truthy {
                return resolve_const_expression(consequent, scope);
            } else {
                return resolve_const_expression(alternate, scope);
            }
        }
    }

    None
}

/// Resolve string concatenation
fn resolve_concatenation(expr: &str, scope: &DocumentScope) -> Option<String> {
    let mut result = String::new();

    for part in expr.split(" + ") {
        let part = part.trim();
        if let Some(resolved) = resolve_const_expression(part, scope) {
            result.push_str(&resolved);
        } else {
            return None;
        }
    }

    Some(result)
}

/// Resolve variable reference (props.X, locals.X, or bare identifier)
fn resolve_variable_reference(expr: &str, scope: &DocumentScope) -> Option<String> {
    let trimmed = expr.trim();

    // props.name
    if trimmed.starts_with("props.") {
        let name = &trimmed[6..];
        return scope.props.get(name).cloned();
    }

    // locals.name (explicit)
    if trimmed.starts_with("locals.") {
        let name = &trimmed[7..];
        return scope.locals.get(name).cloned();
    }

    // Bare identifier - lookup in scope (locals first, then props)
    if is_valid_identifier(trimmed) {
        return scope.get(trimmed).cloned();
    }

    None
}

/// Check if string is a valid JavaScript identifier
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

/// Resolve an expression using the document scope
/// This is the main entry point for expression resolution in document templates
pub fn resolve_document_expression(
    expr: &str,
    scope: &DocumentScope,
) -> Result<String, DocumentCompileError> {
    // Strip Zenith qualification if present
    let mut expr_clean = expr.trim().to_string();

    // Remove trailing semicolon/newline
    while expr_clean.ends_with(';') || expr_clean.ends_with('\n') || expr_clean.ends_with('\r') {
        expr_clean.pop();
    }

    // Strip __ZENITH_SCOPES__ prefix if present
    if expr_clean.contains("__ZENITH_SCOPES__") {
        if let Some(last_dot) = expr_clean.rfind('.') {
            expr_clean = expr_clean[last_dot + 1..].to_string();
        }
    }

    // Strip scope. prefix
    if expr_clean.starts_with("scope.") {
        expr_clean = expr_clean[6..].to_string();
    }

    // Strip locals./props. prefix for direct lookup
    let lookup_name = if expr_clean.starts_with("locals.") {
        &expr_clean[7..]
    } else if expr_clean.starts_with("props.") {
        &expr_clean[6..]
    } else {
        &expr_clean
    };

    // Try to resolve
    match resolve_const_expression(lookup_name, scope) {
        Some(value) => Ok(value),
        None => Err(DocumentCompileError::UnresolvedExpression {
            expr: expr.to_string(),
            reason: "Expression cannot be statically resolved".to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_detection() {
        use crate::validate::{ElementNode, SourceLocation};

        let html_node = TemplateNode::Element(ElementNode {
            tag: "html".to_string(),
            attributes: vec![],
            children: vec![],
            location: SourceLocation { line: 1, column: 1 },
            loop_context: None,
        });

        let div_node = TemplateNode::Element(ElementNode {
            tag: "div".to_string(),
            attributes: vec![],
            children: vec![],
            location: SourceLocation { line: 1, column: 1 },
            loop_context: None,
        });

        assert!(is_document_module(&[html_node.clone()]));
        assert!(!is_document_module(&[div_node]));
    }

    #[test]
    fn test_script_validation() {
        assert!(validate_document_script("const title = 'Home';").is_ok());
        assert!(validate_document_script("const x = state({});").is_err());
        assert!(validate_document_script("$effect(() => {});").is_err());
        assert!(validate_document_script("window.location").is_err());
    }

    #[test]
    fn test_const_extraction() {
        let script = r#"
            const title = "Home";
            const pageTitle = `Zenith | ${title}`;
        "#;
        let consts = extract_const_declarations(script);
        assert_eq!(consts.get("title"), Some(&"\"Home\"".to_string()));
    }

    #[test]
    fn test_scope_resolution() {
        let mut scope = DocumentScope::default();
        scope.props.insert("title".to_string(), "Home".to_string());
        scope
            .locals
            .insert("pageTitle".to_string(), "Zenith | Home".to_string());

        assert_eq!(scope.get("title"), Some(&"Home".to_string()));
        assert_eq!(scope.get("pageTitle"), Some(&"Zenith | Home".to_string()));
    }

    #[test]
    fn test_template_literal_resolution() {
        let mut scope = DocumentScope::default();
        scope.props.insert("title".to_string(), "Home".to_string());

        let result = resolve_template_literal("`Zenith | ${props.title}`", &scope);
        assert_eq!(result, Some("Zenith | Home".to_string()));
    }
}
