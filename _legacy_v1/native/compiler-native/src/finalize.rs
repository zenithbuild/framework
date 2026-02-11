//! Finalize Module for Zenith Compiler
//!
//! Port of finalizeOutput.ts to Rust.
//! Generates final HTML+JS and validation.

#[cfg(feature = "napi")]
use napi_derive::napi;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::codegen::{generate_runtime_code_internal, CodegenInput, ScriptImport};
use crate::validate::{ExpressionInput, LoopContextInput, TemplateNode, ZenIR};

/// Inject head directive elements into HTML <head> section at compile time
fn inject_head_elements(html: &str, head: &crate::validate::HeadDirective) -> String {
    let mut injected = String::new();

    // Inject title if present
    // Inject title if present
    if let Some(title) = &head.title {
        // Title is already statically resolved in component.rs or transform.rs.
        // We do strictly no runtime resolution here.
        let resolved = title.clone();
        injected.push_str(&format!("<title>{}</title>\n    ", resolved));
    }

    // Inject description meta tag if present
    // Inject description meta tag if present
    if let Some(desc) = &head.description {
        let resolved = desc.clone();
        injected.push_str(&format!(
            r#"<meta name="description" content="{}" />"#,
            resolved
        ));
        injected.push_str("\n    ");
    }

    // Inject additional meta tags
    for meta in &head.meta {
        if meta.name == Some("description".to_string()) {
            // Already handled above
            continue;
        }
        let content = meta.content.clone();

        if let Some(name) = &meta.name {
            injected.push_str(&format!(
                r#"<meta name="{}" content="{}" />"#,
                name, content
            ));
        } else if let Some(prop) = &meta.property {
            injected.push_str(&format!(
                r#"<meta property="{}" content="{}" />"#,
                prop, content
            ));
        }
        injected.push_str("\n    ");
    }

    // Inject link tags
    for link in &head.links {
        let mut link_tag = format!(r#"<link rel="{}" href="{}""#, link.rel, link.href);
        if let Some(t) = &link.r#type {
            link_tag.push_str(&format!(r#" type="{}""#, t));
        }
        link_tag.push_str(" />\n    ");
        injected.push_str(&link_tag);
    }

    if injected.is_empty() {
        return html.to_string();
    }

    // Find the </head> tag and inject before it
    if let Some(idx) = html.to_lowercase().find("</head>") {
        let mut result = html[..idx].to_string();
        result.push_str(&injected);
        result.push_str(&html[idx..]);
        result
    } else if let Some(idx) = html.to_lowercase().find("<head>") {
        // Inject after <head>
        let head_end = idx + 6;
        let mut result = html[..head_end].to_string();
        result.push_str("\n    ");
        result.push_str(&injected);
        result.push_str(&html[head_end..]);
        result
    } else {
        // No head tag found, just return as-is
        html.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledTemplate {
    pub html: String,
    pub styles: Vec<String>,
}

/// Manifest export for the bundler's capability-based chunking.
/// This is the Compiler → Bundler handshake contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
#[serde(rename_all = "camelCase")]
pub struct ZenManifestExport {
    /// Entry point path
    pub entry: String,
    /// Pre-rendered HTML template
    pub template: String,
    /// Whether this page uses reactive state
    pub uses_state: bool,
    /// Whether this page has event handlers
    pub has_events: bool,
    /// Whether this page is fully static
    pub is_static: bool,
    /// CSS classes used by this page (for pruning)
    pub css_classes: Vec<String>,
    /// Required runtime capabilities (as strings for JS interop)
    pub required_capabilities: Vec<String>,
    /// Compiled script content (author code)
    pub script: String,
    /// Full hydrated bundle
    pub bundle: String,
    /// Compiled expressions
    pub expressions: String,
    /// Compiled styles
    pub styles: String,
    /// NPM imports
    pub npm_imports: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
#[serde(rename_all = "camelCase")]
pub struct FinalizedOutput {
    pub html: String,
    pub has_errors: bool,
    pub errors: Vec<String>,
    /// Manifest for bundler's capability-based chunking
    pub manifest: Option<ZenManifestExport>,
}

fn emit_imports(imports: &[ScriptImport]) -> String {
    imports
        .iter()
        .map(|imp| {
            if imp.specifiers.is_empty() {
                format!("import '{}';", imp.source)
            } else {
                // Basic heuristic for default vs named imports
                // If specifiers starts with { or *, assume it's correct syntax
                if imp.specifiers.trim().starts_with('{') || imp.specifiers.trim().starts_with('*')
                {
                    format!("import {} from '{}';", imp.specifiers, imp.source)
                } else {
                    format!("import {} from '{}';", imp.specifiers, imp.source)
                }
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn verify_no_raw_expressions(html: &str, file_path: &str) -> Vec<String> {
    let mut errors = Vec::new();

    // STRIP SCRIPTS AND STYLES
    // We must ignore { ... } inside script/style tags as they are likely valid JS/CSS
    // Use DOTALL flag (?s) so . matches newlines
    let script_re = Regex::new(r"(?s)<script[^>]*>.*?</script>").unwrap();
    let style_re = Regex::new(r"(?s)<style[^>]*>.*?</style>").unwrap();

    let html_no_script = script_re.replace_all(html, "");
    let clean_html = style_re.replace_all(&html_no_script, "");

    let re = Regex::new(r"\{[^}]*\}").unwrap();

    let mut actual_expressions = Vec::new();
    for mat in re.find_iter(&clean_html) {
        let s = mat.as_str();

        // Exclusions matching TS logic
        if html.contains(&format!("<!--{}", s)) || html.contains(&format!("{}-->", s)) {
            continue;
        }
        if s.contains("data-zen-") {
            continue;
        }
        if s.starts_with("{<") || s.contains("\n") {
            continue;
        } // Rough heuristic for tags
        if s.contains(";") && s.contains(":") {
            continue;
        } // CSS-like

        // TS regex: /^\{[\s]*</
        if s.starts_with("{") && s[1..].trim_start().starts_with("<") {
            continue;
        }
        // TS regex: /<[a-zA-Z]/ inside
        if s.contains("<") {
            continue;
        }

        actual_expressions.push(s.to_string());
    }

    if !actual_expressions.is_empty() {
        errors.push(format!(
            "HTML contains raw expressions that were not compiled: {}\nFile: {}\nAll expressions must be replaced with hydration markers.",
            actual_expressions.join(", "),
            file_path
        ));
    }

    errors
}

/// Internal finalize function for use by parse_full_zen_native
pub fn finalize_output_internal(
    ir: ZenIR,
    compiled: CompiledTemplate,
) -> Result<FinalizedOutput, String> {
    // PHASE 3: Resolve HEAD_EXPR markers to static values
    let mut resolved_html = compiled.html.clone();

    // PHASE 3.5: Inject Head component content into HTML <head>
    if let Some(ref head_directive) = ir.head_directive {
        resolved_html = inject_head_elements(&resolved_html, head_directive);
    }

    // Verify HTML (after HEAD_EXPR resolution)
    let html_errors = verify_no_raw_expressions(&resolved_html, &ir.file_path);
    if !html_errors.is_empty() {
        return Ok(FinalizedOutput {
            has_errors: true,
            errors: html_errors,
            html: String::new(),
            manifest: None,
        });
    }

    // Prepare Codegen Input
    /*
    eprintln!(
        "[Zenith FINALIZE] IR script present: {}",
        ir.script.is_some()
    );
    */
    let script_content = ir
        .script
        .as_ref()
        .map(|s| {
            // eprintln!("[Zenith FINALIZE] Script length: {}", s.raw.len());
            s.raw.clone()
        })
        .unwrap_or_default();

    // Map expressions
    let expressions: Vec<ExpressionInput> = ir
        .template
        .expressions
        .iter()
        .map(|e| ExpressionInput {
            id: e.id.clone(),
            code: e.code.clone(),
            loop_context: e.loop_context.as_ref().map(|lc| LoopContextInput {
                variables: lc.variables.clone(),
                map_source: lc.map_source.clone(),
            }),
        })
        .collect();

    let codegen_input = CodegenInput {
        file_path: ir.file_path.clone(),
        script_content,
        expressions,
        styles: ir.styles.clone(),
        template_bindings: vec![],
        location: ir.file_path.clone(),
        nodes: ir.template.nodes.clone(),
        page_bindings: ir.page_bindings.clone(),
        page_props: ir.page_props.clone(),
        all_states: ir.all_states.clone(),
        locals: vec![],
    };

    let runtime_code = generate_runtime_code_internal(codegen_input);
    let final_imports = emit_imports(&runtime_code.npm_imports);

    // Scan for event handlers if not already detected
    let mut has_events = ir.has_events;
    if !has_events {
        has_events = check_for_events(&ir.template.nodes);
    }

    // Generate manifest for bundler
    let is_static = !ir.uses_state && !has_events && ir.all_states.is_empty();
    let mut required_capabilities = vec!["core".to_string()];

    if ir.uses_state || !ir.all_states.is_empty() {
        required_capabilities.push("reactivity".to_string());
    }
    if has_events || ir.uses_state || !ir.all_states.is_empty() {
        required_capabilities.push("hydration".to_string());
    }

    let manifest = ZenManifestExport {
        entry: ir.file_path.clone(),
        template: resolved_html.clone(),
        uses_state: ir.uses_state || !ir.all_states.is_empty(),
        has_events,
        is_static,
        css_classes: ir.css_classes.clone(),
        required_capabilities,
        script: runtime_code.script,
        bundle: runtime_code.bundle,
        expressions: runtime_code.expressions,
        styles: runtime_code.styles,
        npm_imports: final_imports,
    };

    Ok(FinalizedOutput {
        html: resolved_html,
        has_errors: false,
        errors: vec![],
        manifest: Some(manifest),
    })
}

fn check_for_events(nodes: &[TemplateNode]) -> bool {
    for node in nodes {
        match node {
            TemplateNode::Element(el) => {
                for attr in &el.attributes {
                    let name = attr.name.to_lowercase();
                    if name.starts_with("on")
                        || name.starts_with("data-zen-click")
                        || name.starts_with("data-zen-change")
                        || name.starts_with("data-zen-input")
                    {
                        return true;
                    }
                }
                if check_for_events(&el.children) {
                    return true;
                }
            }
            TemplateNode::Component(c) => {
                for attr in &c.attributes {
                    if attr.name.to_lowercase().starts_with("on") {
                        return true;
                    }
                }
                if check_for_events(&c.children) {
                    return true;
                }
            }
            TemplateNode::ConditionalFragment(cf) => {
                if check_for_events(&cf.consequent) || check_for_events(&cf.alternate) {
                    return true;
                }
            }
            TemplateNode::LoopFragment(lf) => {
                if check_for_events(&lf.body) {
                    return true;
                }
            }
            TemplateNode::OptionalFragment(of) => {
                if check_for_events(&of.fragment) {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}
