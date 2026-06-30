//! Utility functions for the bundler.
//!
//! - Virtual module ID construction and parsing
//! - JS literal serialization through compiler-owned helpers
//! - Post-build validation helpers

use regex::Regex;

use crate::{BundleError, CompilerOutput, Diagnostic, DiagnosticLevel};
use zenith_compiler::deterministic::sha256_hex;
use zenith_compiler::js_serialize::{serialize_js_string_literal, serialize_js_template_literal};
use zenith_compiler::script::ExtractedStyleBlock;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

#[path = "utils_import_rewrite.rs"]
mod import_rewrite;
pub use self::import_rewrite::rewrite_js_imports_ast;

// ---------------------------------------------------------------------------
// Virtual Module IDs
// ---------------------------------------------------------------------------

/// Prefix for all Zenith virtual modules.
/// The `\0` prefix prevents filesystem resolution collisions.
pub const VIRTUAL_PREFIX: &str = "\0zenith:";

/// Create the virtual entry module ID for a page.
pub fn virtual_entry_id(page_id: &str) -> String {
    format!("\0zenith:entry:{}", page_id)
}

/// Create the virtual CSS module ID for a page.
pub fn virtual_css_id(page_id: &str) -> String {
    format!("\0zenith:css:{}", page_id)
}

/// Create the virtual page-script module ID.
pub fn virtual_page_script_id(page_id: &str) -> String {
    format!("\0zenith:page-script:{}", page_id)
}

/// Extract the page ID from a virtual module ID.
/// Returns `None` if the ID doesn't match the expected pattern.
pub fn extract_page_id(virtual_id: &str) -> Option<&str> {
    if let Some(rest) = virtual_id.strip_prefix("\0zenith:entry:") {
        Some(rest)
    } else if let Some(rest) = virtual_id.strip_prefix("\0zenith:css:") {
        Some(rest)
    } else if let Some(rest) = virtual_id.strip_prefix("\0zenith:page-script:") {
        Some(rest)
    } else {
        None
    }
}

/// Check if a module ID is a Zenith virtual module.
pub fn is_virtual(id: &str) -> bool {
    id.starts_with(VIRTUAL_PREFIX)
}

/// Check if a file path is a `.zen` file.
pub fn is_zen_file(path: &str) -> bool {
    path.ends_with(".zen")
}

/// Check if a module ID is a Zenith internal virtual module.
/// These use the `\0zenith:` prefix and must never be user-resolvable.
pub fn is_zenith_virtual_id(id: &str) -> bool {
    id.starts_with(VIRTUAL_PREFIX)
}

/// Reject user-space imports that attempt to use the `\0zenith:` namespace.
/// Returns `Err` if the specifier collides with internal virtual IDs.
/// This prevents namespace pollution and ensures virtual modules are hermetically sealed.
pub fn reject_external_zenith_import(specifier: &str) -> Result<(), BundleError> {
    // User specifiers should never start with \0 (null byte prefix)
    // Any specifier containing "zenith:" after a null byte is an internal ID
    if specifier.starts_with('\0') {
        return Err(BundleError::ValidationError(format!(
            "Cannot import internal virtual module '{}' — \\0zenith: namespace is reserved",
            specifier
        )));
    }
    // Also reject literal string "\0zenith:" in non-null-prefixed specifiers
    // (e.g. someone trying to escape the prefix)
    if specifier.contains("\\0zenith:") || specifier.contains("%00zenith:") {
        return Err(BundleError::ValidationError(format!(
            "Cannot reference internal virtual namespace in specifier '{}'",
            specifier
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Rolldown Commit Pin
// ---------------------------------------------------------------------------

/// Expected Rolldown git commit. If the actual Rolldown version differs,
/// determinism guarantees may be invalidated.
pub const EXPECTED_ROLLDOWN_COMMIT: &str = "67a1f58";

/// Clean a path string by resolving . and .. components purely textually.
/// Does NOT touch the filesystem.
pub fn clean_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let mut out = Vec::new();

    for segment in path.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            out.pop();
        } else {
            out.push(segment);
        }
    }

    let result = out.join("/");
    if path.starts_with('/') {
        format!("/{}", result)
    } else {
        result
    }
}

// ---------------------------------------------------------------------------
// Virtual Entry Generation
// ---------------------------------------------------------------------------

/// Generate the virtual entry module JS source for a compiled page.
///
/// The entry contains:
/// - `__zenith_html` — the HTML template string
/// - `__zenith_expr` — the expression table
/// - A default export function (hydration stub)
pub fn generate_virtual_entry(output: &CompilerOutput) -> String {
    let html_literal = serialize_js_template_literal(&output.html);

    let expr_items: Vec<String> = output
        .expressions
        .iter()
        .map(|e| serialize_js_string_literal(e))
        .collect();

    let expr_array = expr_items.join(", ");

    format!(
        r#"export const __zenith_html = {};
export const __zenith_expr = [{}];
export const __zenith_contract = "v0";
export default function __zenith_page() {{
  return {{ html: __zenith_html, expressions: __zenith_expr, contract: __zenith_contract }};
}}"#,
        html_literal, expr_array
    )
}

/// Emit a runtime expression function through AST parse/codegen instead of
/// splicing compiler output directly into generated JS.
pub fn emit_runtime_expression_function(compiled_expr: &str) -> Result<String, String> {
    let uses_signal_map = expression_references_identifier(compiled_expr, "signalMap");
    let uses_params = expression_references_identifier(compiled_expr, "params");
    let uses_props = expression_references_identifier(compiled_expr, "props");
    let uses_data = expression_references_identifier(compiled_expr, "data");
    let uses_ssr = expression_references_identifier(compiled_expr, "ssr");
    let uses_ssr_data = expression_references_identifier(compiled_expr, "ssrData");
    let uses_component_bindings = expression_references_identifier(compiled_expr, "componentBindings");
    let needs_ssr_data = uses_ssr_data || uses_data || uses_ssr;

    let mut source = String::new();
    source.push_str("const __zenith_expr_fn = function(__ctx) {\n");
    if uses_signal_map {
        source.push_str("  const signalMap = __ctx.signalMap;\n");
    }
    if uses_params {
        source.push_str("  const params = __ctx.params;\n");
    }
    if uses_props {
        source.push_str("  const props = __ctx.props;\n");
    }
    if needs_ssr_data {
        source.push_str("  const ssrData = __ctx.ssrData;\n");
    }
    if uses_data {
        source.push_str("  const data = ssrData;\n");
    }
    if uses_ssr {
        source.push_str("  const ssr = ssrData;\n");
    }
    if uses_component_bindings {
        source.push_str("  const componentBindings = __ctx.componentBindings;\n");
    }
    source.push_str("  return (");
    source.push_str(compiled_expr);
    source.push_str(");\n};\n");

    let allocator = Allocator::default();
    let source_type = SourceType::default().with_module(true);
    let parser = Parser::new(&allocator, &source, source_type);
    let parse_result = parser.parse();

    if !parse_result.errors.is_empty() {
        let errs = parse_result
            .errors
            .iter()
            .map(|error| format!("{error}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "failed to emit runtime expression function from compiler expression:\n{}",
            errs
        ));
    }

    let codegen = Codegen::<false>::new(&source, CodegenOptions::default());
    let compiled = codegen.build(&parse_result.program);
    let rendered = compiled.source_text.trim();
    let prefix = "const __zenith_expr_fn = ";
    let initializer = rendered
        .strip_prefix(prefix)
        .and_then(|value| value.strip_suffix(';'))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "failed to extract canonical runtime expression function source".to_string()
        })?;

    Ok(initializer.to_string())
}

fn expression_references_identifier(compiled_expr: &str, identifier: &str) -> bool {
    let pattern = format!(r"\b{}\b", regex::escape(identifier));
    match Regex::new(&pattern) {
        Ok(re) => re.is_match(compiled_expr),
        Err(_) => false,
    }
}

// ---------------------------------------------------------------------------
// Canonicalize Page ID
// ---------------------------------------------------------------------------

/// Derive a deterministic page ID from a file path.
/// Strips extensions, normalizes separators, and lowercases.
pub fn canonicalize_page_id(page_path: &str) -> String {
    let path = std::path::Path::new(page_path);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    // Use the stem as the page ID, lowercased
    stem.to_lowercase()
}

// ---------------------------------------------------------------------------
// Post-Build Validation
// ---------------------------------------------------------------------------

/// Validate that the bundled output contains all expected expression placeholders.
pub fn validate_placeholders(html: &str, expression_count: usize) -> Result<(), Vec<Diagnostic>> {
    let mut found_indices = std::collections::HashSet::new();

    // Regex to find all data-zx-* attributes and capture their values (quoted or unquoted)
    // Matches: data-zx-something="value" OR data-zx-something='value' OR data-zx-something=value
    let re = Regex::new(r#"data-zx-[a-z-]+=(?:"([^"]+)"|'([^']+)'|([^\s>"']+))"#).unwrap();
    let comment_re = Regex::new(r#"<!--\s*zx-e:(\d+)\s*-->"#).unwrap();

    for cap in re.captures_iter(html) {
        // Value is in group 1, 2, or 3
        let val = cap
            .get(1)
            .or(cap.get(2))
            .or(cap.get(3))
            .map(|m| m.as_str())
            .unwrap_or("");

        // Parse space-separated indices
        for part in val.split_whitespace() {
            if let Ok(idx) = part.parse::<usize>() {
                found_indices.insert(idx);
            }
        }
    }

    for cap in comment_re.captures_iter(html) {
        let val = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        if let Ok(idx) = val.parse::<usize>() {
            found_indices.insert(idx);
        }
    }

    let mut missing = Vec::new();
    for i in 0..expression_count {
        if !found_indices.contains(&i) {
            missing.push(Diagnostic {
                level: DiagnosticLevel::Error,
                message: format!("Missing placeholder for expression index {}", i),
                context: Some(format!(
                    "Expected index {} in a data-zx-e, data-zx-on-*, or comment placeholder",
                    i
                )),
            });
        }
    }

    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
}

/// Validate that compiled expressions match metadata expressions exactly.
pub fn validate_expressions(compiled: &[String], metadata: &[String]) -> Result<(), BundleError> {
    if compiled.len() != metadata.len() {
        return Err(BundleError::ExpressionMismatch {
            expected: metadata.len(),
            got: compiled.len(),
        });
    }

    for (i, (got, expected)) in compiled.iter().zip(metadata.iter()).enumerate() {
        if got != expected {
            return Err(BundleError::ExpressionContentMismatch {
                index: i,
                expected: expected.clone(),
                got: got.clone(),
            });
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// CSS Processing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessedCss {
    pub hash: String,
    pub content: String,
}

pub fn contains_raw_tailwind_import(content: &str) -> bool {
    content.contains("@import \"tailwindcss\"") || content.contains("@import 'tailwindcss'")
}

pub fn process_css(
    style_blocks: &[ExtractedStyleBlock],
    html: &str,
) -> Result<(Option<ProcessedCss>, String), String> {
    if style_blocks.is_empty() {
        let anchor = "<!-- ZENITH_STYLES_ANCHOR -->";
        if html.contains(anchor) {
            return Ok((None, html.replace(anchor, "")));
        }
        return Ok((None, html.to_string()));
    }

    let mut style_hashes = Vec::new();
    let mut clean_content = Vec::new();

    for block in style_blocks {
        let seed = format!("{}:{}:{}", block.module_id, block.order, block.content);
        let hash = sha256_hex(seed.as_bytes());
        style_hashes.push(hash);
        clean_content.push(block.content.clone());
    }

    let mut sorted_hashes = style_hashes.clone();
    sorted_hashes.sort();
    let bundle_seed = sorted_hashes.join("|");
    let bundle_hash = sha256_hex(bundle_seed.as_bytes());

    let final_content = clean_content.join("\n\n");

    if final_content.trim().is_empty() {
        return Err(
            "Determinism violation: style_blocks > 0 but final CSS content is empty.".to_string(),
        );
    }

    if contains_raw_tailwind_import(&final_content) {
        return Err(
            "Tailwind CSS contract violation: emitted CSS still contains raw @import \"tailwindcss\". \
             Zenith should compile local Tailwind entry CSS internally before emission. \
             Raw Tailwind imports are not valid browser CSS and will 404 if shipped.".to_string(),
        );
    }

    let anchor = "<!-- ZENITH_STYLES_ANCHOR -->";
    let count = html.matches(anchor).count();
    if count != 1 {
        return Err(format!(
            "Expected exactly one ZENITH_STYLES_ANCHOR, found {}",
            count
        ));
    }

    let link_tag = format!(
        "<link rel=\"stylesheet\" href=\"/assets/styles.{}.css\">",
        bundle_hash
    );
    let new_html = html.replace(anchor, &link_tag);

    Ok((
        Some(ProcessedCss {
            hash: bundle_hash,
            content: final_content,
        }),
        new_html,
    ))
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/// Compute a stable 8-character hex hash from a string.
/// Uses a simple polynomial rolling hash algorithm (Java-like) mixed to hex.
/// This matches the behavior expected by Zenith's legacy hashing.
pub fn stable_hash_8(content: &str) -> String {
    let mut hash: i32 = 0;
    for byte in content.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    let normalized = hash.wrapping_abs() as u32;
    format!("{normalized:08x}")
}

#[cfg(test)]
#[path = "utils_tests.rs"]
mod tests;
