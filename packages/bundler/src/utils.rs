//! Utility functions for the bundler.
//!
//! - Virtual module ID construction and parsing
//! - JS string escaping (injection-safe)
//! - Post-build validation helpers

use regex::Regex;

use crate::{BundleError, CompilerOutput, Diagnostic, DiagnosticLevel};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use zenith_compiler::deterministic::sha256_hex;
use zenith_compiler::script::ExtractedStyleBlock;

use oxc_allocator::Allocator;
use oxc_ast::{VisitMut, ast};
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

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

// ---------------------------------------------------------------------------
// JS String Escaping
// ---------------------------------------------------------------------------

/// Escape a string for safe embedding inside a JS template literal (backtick string).
/// Prevents injection by escaping backticks, backslashes, and `${`.
pub fn escape_js_template_literal(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        match chars[i] {
            '\\' => {
                out.push_str("\\\\");
            }
            '`' => {
                out.push_str("\\`");
            }
            '$' if i + 1 < len && chars[i + 1] == '{' => {
                out.push_str("\\${");
                i += 1; // skip the '{'
            }
            c => {
                out.push(c);
            }
        }
        i += 1;
    }
    out
}

/// Escape a string for safe embedding inside a JS double-quoted string literal.
pub fn escape_js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out
}

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
    let html_escaped = escape_js_template_literal(&output.html);

    let expr_items: Vec<String> = output
        .expressions
        .iter()
        .map(|e| format!("\"{}\"", escape_js_string(e)))
        .collect();

    let expr_array = expr_items.join(", ");

    format!(
        r#"export const __zenith_html = `{}`;
export const __zenith_expr = [{}];
export const __zenith_contract = "v0";
export default function __zenith_page() {{
  return {{ html: __zenith_html, expressions: __zenith_expr, contract: __zenith_contract }};
}}"#,
        html_escaped, expr_array
    )
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

fn tailwind_cli_candidates(project_root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(override_path) = env::var("ZENITH_TAILWIND_BIN") {
        if !override_path.trim().is_empty() {
            candidates.push(PathBuf::from(override_path));
        }
    }

    let mut cursor = Some(project_root);
    while let Some(dir) = cursor {
        candidates.push(dir.join("node_modules/.bin/tailwindcss"));
        candidates.push(dir.join("node_modules/.bin/tailwindcss.cmd"));
        candidates.push(dir.join("node_modules/.bin/tailwindcss.ps1"));
        cursor = dir.parent();
    }

    candidates
}

fn resolve_tailwind_cli(project_root: &Path) -> Result<PathBuf, String> {
    for candidate in tailwind_cli_candidates(project_root) {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Tailwind CSS integration error: could not locate the Tailwind v4 CLI binary.\n  project_root: {}\n  expected: node_modules/.bin/tailwindcss (or set ZENITH_TAILWIND_BIN)\n  fix: install tailwindcss and @tailwindcss/cli in the app project",
        project_root.display()
    ))
}

pub fn compile_tailwind_entry(
    project_root: &Path,
    input_path: &Path,
    source: &str,
) -> Result<String, String> {
    if !contains_raw_tailwind_import(source) {
        return Ok(source.to_string());
    }

    let cli_bin = resolve_tailwind_cli(project_root)?;
    let hash_seed = format!("{}:{}", input_path.display(), sha256_hex(source.as_bytes()));
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp_name = format!(
        "zenith-tailwind-{}-{}-{}.css",
        stable_hash_8(&hash_seed),
        std::process::id(),
        unique_suffix
    );
    let out_path = env::temp_dir().join(tmp_name);

    let output = Command::new(&cli_bin)
        .current_dir(project_root)
        .arg("-i")
        .arg(input_path)
        .arg("-o")
        .arg(&out_path)
        .arg("--minify")
        .output()
        .map_err(|err| {
            format!(
                "Tailwind CSS integration error: failed to spawn CLI.\n  project_root: {}\n  input: {}\n  cli: {}\n  reason: {err}",
                project_root.display(),
                input_path.display(),
                cli_bin.display()
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Tailwind CSS integration error: CLI compilation failed.\n  project_root: {}\n  input: {}\n  cli: {}\n  status: {}\n  stdout: {}\n  stderr: {}",
            project_root.display(),
            input_path.display(),
            cli_bin.display(),
            output.status,
            stdout.trim(),
            stderr.trim()
        ));
    }

    let compiled = fs::read_to_string(&out_path).map_err(|err| {
        format!(
            "Tailwind CSS integration error: failed to read compiled output.\n  input: {}\n  output: {}\n  reason: {err}",
            input_path.display(),
            out_path.display()
        )
    })?;
    let _ = fs::remove_file(&out_path);

    if compiled.trim().is_empty() {
        return Err(format!(
            "Tailwind CSS integration error: compiled CSS was empty.\n  input: {}\n  output: {}",
            input_path.display(),
            out_path.display()
        ));
    }

    if contains_raw_tailwind_import(&compiled) {
        return Err(format!(
            "Tailwind CSS integration error: raw @import \"tailwindcss\" survived internal compilation.\n  input: {}\n  output: {}",
            input_path.display(),
            out_path.display()
        ));
    }

    Ok(compiled)
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

// ---------------------------------------------------------------------------
// AST Rewriting
// ---------------------------------------------------------------------------

/// Parse JS source and rewrite import specifiers based on a replacement map.
///
/// Use `oxc` for robust AST-based transformation.
/// - Rewrites static `ImportDeclaration` sources.
/// - Rewrites dynamic `import('...')` sources if they are string literals.
/// - Preserves everything else (comments, formatting as much as codegen allows).
struct ImportRewriter<'a> {
    replacements: &'a BTreeMap<String, String>,
}

impl<'a> VisitMut<'a> for ImportRewriter<'a> {
    fn visit_import_declaration(&mut self, decl: &mut ast::ImportDeclaration<'a>) {
        let spec = decl.source.value.as_str();
        if let Some(replacement) = self.replacements.get(spec) {
            decl.source.value = oxc_span::Atom::from(replacement.as_str());
        }
    }

    fn visit_export_named_declaration(&mut self, decl: &mut ast::ExportNamedDeclaration<'a>) {
        if let Some(inner_decl) = &mut decl.declaration {
            self.visit_declaration(inner_decl);
        }
        if let Some(source_lit) = &mut decl.source {
            let spec = source_lit.value.as_str();
            if let Some(replacement) = self.replacements.get(spec) {
                source_lit.value = oxc_span::Atom::from(replacement.as_str());
            }
        }
    }

    fn visit_export_all_declaration(&mut self, decl: &mut ast::ExportAllDeclaration<'a>) {
        let spec = decl.source.value.as_str();
        if let Some(replacement) = self.replacements.get(spec) {
            decl.source.value = oxc_span::Atom::from(replacement.as_str());
        }
    }

    fn visit_import_expression(&mut self, expr: &mut ast::ImportExpression<'a>) {
        if let ast::Expression::StringLiteral(lit) = &mut expr.source {
            let spec = lit.value.as_str();
            if let Some(replacement) = self.replacements.get(spec) {
                lit.value = oxc_span::Atom::from(replacement.as_str());
            }
        }
        self.visit_expression(&mut expr.source);
        for argument in expr.arguments.iter_mut() {
            self.visit_expression(argument);
        }
    }
}

pub fn rewrite_js_imports_ast(
    source: &str,
    replacements: &BTreeMap<String, String>,
) -> Result<String, String> {
    if replacements.is_empty() {
        return Ok(source.to_string());
    }

    let allocator = Allocator::default();
    let source_type = SourceType::default().with_module(true);

    let parser = Parser::new(&allocator, source, source_type);
    let parse_result = parser.parse();

    if !parse_result.errors.is_empty() {
        let errs = parse_result
            .errors
            .iter()
            .map(|e| format!("{e}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("Failed to parse JS for rewriting:\n{}", errs));
    }

    let mut program = parse_result.program;

    let mut rewriter = ImportRewriter { replacements };
    rewriter.visit_program(&mut program);

    let codegen = Codegen::<false>::new(source, CodegenOptions::default());
    let compiled = codegen.build(&program);

    Ok(compiled.source_text)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_virtual_entry_id() {
        assert_eq!(virtual_entry_id("home"), "\0zenith:entry:home");
    }

    #[test]
    fn test_virtual_css_id() {
        assert_eq!(virtual_css_id("home"), "\0zenith:css:home");
    }

    #[test]
    fn test_extract_page_id() {
        assert_eq!(extract_page_id("\0zenith:entry:home"), Some("home"));
        assert_eq!(extract_page_id("\0zenith:css:about"), Some("about"));
        assert_eq!(extract_page_id("other"), None);
    }

    #[test]
    fn test_is_zen_file() {
        assert!(is_zen_file("page.zen"));
        assert!(is_zen_file("/foo/bar.zen"));
        assert!(!is_zen_file("page.tsx"));
    }

    #[test]
    fn test_escape_js_template_literal() {
        assert_eq!(escape_js_template_literal("hello"), "hello");
        assert_eq!(escape_js_template_literal("a`b"), "a\\`b");
        assert_eq!(escape_js_template_literal("${x}"), "\\${x}");
        assert_eq!(escape_js_template_literal("a\\b"), "a\\\\b");
    }

    #[test]
    fn test_escape_js_string() {
        assert_eq!(escape_js_string(r#"he said "hi""#), r#"he said \"hi\""#);
        assert_eq!(escape_js_string("line1\nline2"), "line1\\nline2");
    }

    #[test]
    fn test_canonicalize_page_id() {
        assert_eq!(canonicalize_page_id("index.zen"), "index");
        assert_eq!(canonicalize_page_id("/pages/About.zen"), "about");
    }

    #[test]
    fn test_validate_expressions_match() {
        let compiled = vec!["a".into(), "b".into()];
        let metadata = vec!["a".into(), "b".into()];
        assert!(validate_expressions(&compiled, &metadata).is_ok());
    }

    #[test]
    fn test_validate_expressions_length_mismatch() {
        let compiled = vec!["a".into()];
        let metadata = vec!["a".into(), "b".into()];
        assert!(validate_expressions(&compiled, &metadata).is_err());
    }

    #[test]
    fn test_validate_expressions_content_mismatch() {
        let compiled = vec!["a".into(), "c".into()];
        let metadata = vec!["a".into(), "b".into()];
        let err = validate_expressions(&compiled, &metadata).unwrap_err();
        match err {
            BundleError::ExpressionContentMismatch { index, .. } => assert_eq!(index, 1),
            _ => panic!("Expected ExpressionContentMismatch"),
        }
    }

    #[test]
    fn test_generate_virtual_entry() {
        let output = CompilerOutput {
            ir_version: 1,
            graph_hash: String::new(),
            graph_edges: Vec::new(),
            graph_nodes: Vec::new(),
            html: "<div data-zx-e=\"0\"></div>".into(),
            expressions: vec!["title".into()],
            imports: Default::default(),
            server_script: Default::default(),
            prerender: false,
            ssr_data: Default::default(),
            hoisted: Default::default(),
            components_scripts: Default::default(),
            component_instances: Default::default(),
            signals: Default::default(),
            expression_bindings: Default::default(),
            marker_bindings: Default::default(),
            event_bindings: Default::default(),
            ref_bindings: Default::default(),
            style_blocks: Default::default(),
        };
        let entry = generate_virtual_entry(&output);
        assert!(entry.contains("__zenith_html"));
        assert!(entry.contains("__zenith_expr"));
        assert!(entry.contains("\"title\""));
        // Inside a JS template literal, double quotes are NOT escaped
        assert!(entry.contains("data-zx-e=\"0\""));
    }

    #[test]
    fn test_validate_placeholders_all_present() {
        let html = r#"<div data-zx-e="0"><span data-zx-e="1"></span></div>"#;
        assert!(validate_placeholders(html, 2).is_ok());
    }

    #[test]
    fn test_validate_placeholders_with_events() {
        let html = r#"<button data-zx-on-click="0"></button>"#;
        assert!(validate_placeholders(html, 1).is_ok());
    }

    #[test]
    fn test_validate_placeholders_with_comment_markers() {
        let html =
            r#"<option>Prefix <!--zx-e:0--></option><button data-zx-on-click="1">Save</button>"#;
        assert!(validate_placeholders(html, 2).is_ok());
    }

    #[test]
    fn test_validate_placeholders_missing() {
        let html = r#"<div data-zx-e="0"></div>"#;
        let result = validate_placeholders(html, 2);
        assert!(result.is_err());
        let diagnostics = result.unwrap_err();
        assert_eq!(diagnostics.len(), 1);
        assert!(diagnostics[0].message.contains("index 1"));
    }

    #[test]
    fn test_rewrite_js_imports_ast_rewrites_static_export_and_dynamic() {
        let source = "import { gsap } from 'gsap'; export { format } from 'date-fns'; export async function load() { return import('gsap'); }";
        let mut replacements = BTreeMap::new();
        replacements.insert("gsap".to_string(), "/assets/vendor.mock.js".to_string());
        replacements.insert("date-fns".to_string(), "/assets/vendor.mock.js".to_string());

        let rewritten = rewrite_js_imports_ast(source, &replacements).expect("rewrite source");
        assert!(rewritten.contains("/assets/vendor.mock.js"));
        assert!(!rewritten.contains("'gsap'"));
        assert!(!rewritten.contains("\"gsap\""));
        assert!(!rewritten.contains("'date-fns'"));
        assert!(!rewritten.contains("\"date-fns\""));
    }
}
