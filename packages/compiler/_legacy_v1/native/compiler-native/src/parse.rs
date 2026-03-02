//! Parse Module for Zenith Compiler
//!
//! Port of parseTemplate.ts and parseScript.ts to Rust.
//! Provides HTML5-compliant template parsing with expression extraction.

use html5ever::parse_document;
use html5ever::tendril::TendrilSink;
use lazy_static::lazy_static;
use markup5ever_rcdom::{Handle, NodeData, RcDom};
#[cfg(feature = "napi")]
use napi_derive::napi;
use regex::Regex;

#[cfg(feature = "napi")]
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use crate::validate::{
    AttributeIR, CompilerError, ComponentNode, DoctypeNode, ElementNode, ExpressionIR,
    ExpressionNode, LoopContext, ScriptIR, SourceLocation, TemplateIR, TemplateNode, TextNode,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ATTRIBUTE CASE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

lazy_static! {
    /// SVG attribute case mapping - parse5/html5ever lowercases all attributes,
    /// but SVG requires specific casing for these attributes.
    static ref SVG_ATTR_CASE_MAP: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        // Core SVG attributes with camelCase
        m.insert("viewbox", "viewBox");
        m.insert("preserveaspectratio", "preserveAspectRatio");
        m.insert("basefrequency", "baseFrequency");
        m.insert("baseprofile", "baseProfile");
        m.insert("clippathunits", "clipPathUnits");
        m.insert("diffuseconstant", "diffuseConstant");
        m.insert("edgemode", "edgeMode");
        m.insert("filterunits", "filterUnits");
        m.insert("glyphref", "glyphRef");
        m.insert("gradienttransform", "gradientTransform");
        m.insert("gradientunits", "gradientUnits");
        m.insert("kernelmatrix", "kernelMatrix");
        m.insert("kernelunitlength", "kernelUnitLength");
        m.insert("keypoints", "keyPoints");
        m.insert("keysplines", "keySplines");
        m.insert("keytimes", "keyTimes");
        m.insert("lengthadjust", "lengthAdjust");
        m.insert("limitingconeangle", "limitingConeAngle");
        m.insert("markerheight", "markerHeight");
        m.insert("markerunits", "markerUnits");
        m.insert("markerwidth", "markerWidth");
        m.insert("maskcontentunits", "maskContentUnits");
        m.insert("maskunits", "maskUnits");
        m.insert("numoctaves", "numOctaves");
        m.insert("pathlength", "pathLength");
        m.insert("patterncontentunits", "patternContentUnits");
        m.insert("patterntransform", "patternTransform");
        m.insert("patternunits", "patternUnits");
        m.insert("pointsatx", "pointsAtX");
        m.insert("pointsaty", "pointsAtY");
        m.insert("pointsatz", "pointsAtZ");
        m.insert("primitiveunits", "primitiveUnits");
        m.insert("refx", "refX");
        m.insert("refy", "refY");
        m.insert("repeatcount", "repeatCount");
        m.insert("repeatdur", "repeatDur");
        m.insert("requiredextensions", "requiredExtensions");
        m.insert("requiredfeatures", "requiredFeatures");
        m.insert("specularconstant", "specularConstant");
        m.insert("specularexponent", "specularExponent");
        m.insert("spreadmethod", "spreadMethod");
        m.insert("startoffset", "startOffset");
        m.insert("stddeviation", "stdDeviation");
        m.insert("stitchtiles", "stitchTiles");
        m.insert("surfacescale", "surfaceScale");
        m.insert("systemlanguage", "systemLanguage");
        m.insert("tablevalues", "tableValues");
        m.insert("targetx", "targetX");
        m.insert("targety", "targetY");
        m.insert("textlength", "textLength");
        m.insert("xchannelselector", "xChannelSelector");
        m.insert("ychannelselector", "yChannelSelector");
        m.insert("zoomandpan", "zoomAndPan");
        m.insert("attributename", "attributeName");
        m.insert("attributetype", "attributeType");
        m.insert("calcmode", "calcMode");
        m.insert("clippath", "clipPath");
        m
    };

    /// SVG tags set
    static ref SVG_TAGS: std::collections::HashSet<&'static str> = {
        let mut s = std::collections::HashSet::new();
        s.insert("svg");
        s.insert("path");
        s.insert("circle");
        s.insert("ellipse");
        s.insert("line");
        s.insert("polyline");
        s.insert("polygon");
        s.insert("rect");
        s.insert("g");
        s.insert("defs");
        s.insert("use");
        s.insert("symbol");
        s.insert("clippath");
        s.insert("mask");
        s.insert("pattern");
        s.insert("marker");
        s.insert("lineargradient");
        s.insert("radialgradient");
        s.insert("stop");
        s.insert("filter");
        s.insert("feblend");
        s.insert("fecolormatrix");
        s.insert("fecomponenttransfer");
        s.insert("fecomposite");
        s.insert("feconvolvematrix");
        s.insert("fediffuselighting");
        s.insert("fedisplacementmap");
        s.insert("fedropshadow");
        s.insert("feflood");
        s.insert("fefunca");
        s.insert("fefuncb");
        s.insert("fefuncg");
        s.insert("fefuncr");
        s.insert("fegaussianblur");
        s.insert("feimage");
        s.insert("femerge");
        s.insert("femergenode");
        s.insert("femorphology");
        s.insert("feoffset");
        s.insert("fespecularlighting");
        s.insert("fetile");
        s.insert("feturbulence");
        s.insert("foreignobject");
        s.insert("image");
        s.insert("switch");
        s.insert("text");
        s.insert("tspan");
        s.insert("textpath");
        s.insert("title");
        s.insert("desc");
        s.insert("metadata");
        s.insert("a");
        s.insert("view");
        s.insert("animate");
        s.insert("animatemotion");
        s.insert("animatetransform");
        s.insert("set");
        s.insert("mpath");
        s
    };

    /// Expression placeholder pattern for normalization
    static ref EXPR_PLACEHOLDER_RE: Regex = Regex::new(r"__ZENITH_EXPR_(\d+)__").unwrap();

    /// Script block regex - Simplified for robustness
    static ref SCRIPT_REGEX: Regex = Regex::new(r"(?is)<script.*?>([\s\S]*?)</script>").unwrap();

    /// Attribute regex for parsing script attributes
    static ref ATTR_REGEX: Regex = Regex::new(r#"(?i)([a-z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?"#).unwrap();

    /// Regex for extracting props: prop x = y
    static ref PROP_RE: Regex = Regex::new(r"(?m)^\s*prop\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*=\s*([^;\n]+))?").unwrap();

    /// Regex for extracting state: state x = y
    static ref STATE_RE: Regex = Regex::new(r"(?m)^\s*state\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*=\s*([^;\n]+))?").unwrap();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE IR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESSION ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESSION ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

// REMOVED: Global atomic counter caused hydration mismatches.
// IDs are now generated deterministically based on valid expression index.

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ATTRIBUTE CORRECTION
// ═══════════════════════════════════════════════════════════════════════════════

/// Correct SVG attribute casing - restores camelCase for SVG attributes
fn correct_svg_attribute_name(attr_name: &str, tag_name: &str) -> String {
    let lower_tag = tag_name.to_lowercase();
    let lower_attr = attr_name.to_lowercase();

    // Only apply SVG corrections for SVG elements
    if SVG_TAGS.contains(lower_tag.as_str()) {
        if let Some(&corrected) = SVG_ATTR_CASE_MAP.get(lower_attr.as_str()) {
            return corrected.to_string();
        }
    }

    attr_name.to_string()
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESSION NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/// Find the end of a balanced brace expression, handling strings and template literals.
/// Returns the index after the closing brace, or None if unbalanced.
fn find_balanced_brace_end(html: &str, start_index: usize) -> Option<usize> {
    let chars: Vec<char> = html.chars().collect();
    let mut depth = 0;
    let mut i = start_index;
    let mut in_string: Option<char> = None;
    let mut in_template_literal = false;
    let mut template_brace_depth = 0;

    while i < chars.len() {
        let c = chars[i];

        // Handle escape sequences
        if c == '\\' && i + 1 < chars.len() {
            i += 2;
            continue;
        }

        // Handle strings
        if in_string.is_some() {
            if Some(c) == in_string {
                in_string = None;
            }
            i += 1;
            continue;
        }

        // Handle template literals
        if in_template_literal {
            if c == '`' && template_brace_depth == 0 {
                in_template_literal = false;
            } else if c == '$' && i + 1 < chars.len() && chars[i + 1] == '{' {
                template_brace_depth += 1;
                i += 2;
                continue;
            } else if c == '}' && template_brace_depth > 0 {
                template_brace_depth -= 1;
            }
            i += 1;
            continue;
        }

        // Check for string delimiters
        if c == '"' || c == '\'' {
            in_string = Some(c);
            i += 1;
            continue;
        }

        // Check for template literal
        if c == '`' {
            in_template_literal = true;
            i += 1;
            continue;
        }

        // Track brace depth
        if c == '{' {
            depth += 1;
        } else if c == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(i + 1);
            }
        }

        i += 1;
    }

    None
}

/// Normalize expressions before parsing.
/// Replaces both attr={expr} and {textExpr} with placeholders so html5ever can parse correctly.
fn normalize_all_expressions(html: &str) -> (String, HashMap<String, String>) {
    let mut normalized = String::new();
    let mut expressions = HashMap::new();
    let mut expr_counter = 0;
    let chars: Vec<char> = html.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        // Check for opening brace that starts an expression
        if c == '{' {
            // Make sure it's not an escaped brace or inside a string
            if let Some(end) = find_balanced_brace_end(html, i) {
                let mut expr_content: String = chars[i + 1..end - 1].iter().collect();

                // STRIP HTML COMMENTS: Expressions like { items.map(i => ( <!-- comment --> <div/> )) }
                // contain HTML comments which are invalid in JS context.
                lazy_static! {
                    static ref HTML_COMMENT_RE: Regex = Regex::new(r"(?s)<!--.*?-->").unwrap();
                }
                expr_content = HTML_COMMENT_RE.replace_all(&expr_content, "").to_string();

                let placeholder = format!("__ZENITH_EXPR_{}__", expr_counter);
                expressions.insert(placeholder.clone(), expr_content);
                normalized.push_str(&placeholder);
                expr_counter += 1;
                i = end;
                continue;
            }
        }

        normalized.push(c);
        i += 1;
    }

    (normalized, expressions)
}

/// Convert self-closing component tags to properly closed tags.
/// HTML5/html5ever treats `<ComponentName />` as an opening tag,
/// causing following siblings to be incorrectly nested as children.
fn convert_self_closing_components(html: &str) -> String {
    lazy_static! {
        static ref SELF_CLOSING_RE: Regex =
            Regex::new(r"<([A-Z][a-zA-Z0-9]*)\s*([^>]*?)\s*/>").unwrap();
    }

    SELF_CLOSING_RE
        .replace_all(html, "<$1 $2></$1>")
        .to_string()
}

/// Strip script and style blocks from HTML before parsing.
/// Preserves external script tags (<script src="...">) but removes inline scripts.
/// Returns (HTML, map of inline script contents)
fn strip_blocks(html: &str) -> (String, HashMap<String, String>) {
    lazy_static! {
        static ref SCRIPT_RE: Regex =
            Regex::new(r"(?is)<script\b([^>]*)>([\s\S]*?)</script>").unwrap();
        static ref STYLE_RE: Regex = Regex::new(r"(?is)<style[^>]*>[\s\S]*?</style>").unwrap();
    }

    let mut inline_scripts = HashMap::new();
    let mut script_counter = 0;

    // Process scripts
    let result = SCRIPT_RE.replace_all(html, |caps: &regex::Captures| {
        let attrs = &caps[1];
        let content = &caps[2];

        if attrs.contains("src=") {
            caps[0].to_string() // Keep external scripts
        } else if attrs.contains("is:inline") {
            // Stash inline script content to protect from expression normalization
            let id = format!("zen_inline_script_{}", script_counter);
            inline_scripts.insert(id.clone(), content.to_string());
            script_counter += 1;

            // Return placeholder with ID
            format!("<script {} data-zen-inline-id=\"{}\"></script>", attrs, id)
        } else {
            String::new() // Remove other inline scripts (component logic)
        }
    });

    // Remove styles
    let final_html = STYLE_RE.replace_all(&result, "").to_string();

    (final_html, inline_scripts)
}

/// Strip HTML comments <!-- ... -->
fn strip_comments(html: &str) -> String {
    lazy_static! {
        static ref COMMENT_RE: Regex = Regex::new(r"(?s)<!--.*?-->").unwrap();
    }
    COMMENT_RE.replace_all(html, "").to_string()
}

// ═══════════════════════════════════════════════════════════════════════════════
// NODE PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/// Check if a tag name represents a component (starts with uppercase)
/// Pre-pass to mark component tags (uppercase) with a data attribute to preserve casing
/// because html5ever lowercases all tag names.
fn mark_component_tags(html: &str) -> String {
    lazy_static! {
        static ref TAG_OPEN_RE: Regex = Regex::new(r"<([A-Z][a-zA-Z0-9.]+)(\s|>)").unwrap();
        // Closing tags: </HeroSection>
        static ref TAG_CLOSE_RE: Regex = Regex::new(r"</([A-Z][a-zA-Z0-9.]*)>").unwrap();
    }

    let marked = TAG_OPEN_RE.replace_all(html, |caps: &regex::Captures| {
        let name = &caps[1];
        let sep = &caps[2];
        format!("<{} data-zen-orig-name=\"{}\"{}", name, name, sep)
    });

    TAG_CLOSE_RE.replace_all(&marked, "</$1>").to_string()
}

/// Check if a tag name represents a component (starts with uppercase)
pub fn is_component_tag(tag_name: &str) -> bool {
    tag_name
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false)
}

/// Parse DOM node to TemplateNode
fn parse_dom_node(
    handle: &Handle,
    expressions: &mut Vec<ExpressionIR>,
    normalized_exprs: &HashMap<String, String>,
    inline_scripts: &HashMap<String, String>,
    parent_loop_context: Option<&LoopContext>,
    file_path: &str,
    is_in_head: bool,
) -> Result<Vec<TemplateNode>, CompilerError> {
    let node = handle;
    // println!("[DEBUG] parse_dom_node: {:?}", node.data);

    match &node.data {
        NodeData::Document => {
            // Process children of document
            let children = node.children.borrow();
            let mut nodes = Vec::new();
            for child in children.iter() {
                nodes.extend(parse_dom_node(
                    child,
                    expressions,
                    normalized_exprs,
                    inline_scripts,
                    parent_loop_context,
                    file_path,
                    is_in_head,
                )?);
            }
            Ok(nodes)
        }

        NodeData::Doctype {
            name,
            public_id,
            system_id,
        } => Ok(vec![TemplateNode::Doctype(DoctypeNode {
            name: name.to_string(),
            public_id: public_id.to_string(),
            system_id: system_id.to_string(),
            location: SourceLocation { line: 1, column: 1 },
        })]),

        NodeData::Text { contents } => {
            let text = contents.borrow().to_string();

            // Process text that may contain multiple expressions.
            // process_text_with_expressions handles plain text, single expressions, and mixed content.
            Ok(process_text_with_expressions(
                &text,
                expressions,
                normalized_exprs,
                parent_loop_context,
                is_in_head,
                file_path,
            ))
        }

        NodeData::Element { name, attrs, .. } => {
            let mut tag_name = name.local.to_string();
            let attributes = attrs.borrow();

            // CASING RESTORATION: Check if we marked this tag's original casing
            for attr in attributes.iter() {
                if attr.name.local.to_string() == "data-zen-orig-name" {
                    tag_name = attr.value.to_string();
                    break;
                }
            }

            // INVARIANT: Rejects <template> tag (INV005)
            if tag_name.to_lowercase() == "template" {
                return Err(CompilerError::with_details(
                    "INV005",
                    "The <template> tag is not supported in Zenith. Use structural fragments or components instead.",
                    file_path,
                    1,
                    1,
                    Some("<template>".to_string()),
                    vec![],
                ));
            }
            // INLINE SCRIPT RESTORATION
            let mut script_content = None;
            if tag_name.to_lowercase() == "script" {
                for attr in attributes.iter() {
                    if attr.name.local.to_string() == "data-zen-inline-id" {
                        let id = attr.value.to_string();
                        if let Some(content) = inline_scripts.get(&id) {
                            script_content = Some(content.clone());
                        }
                    }
                }
            }

            // Parse attributes
            let mut parsed_attrs = Vec::new();
            for attr in attributes.iter() {
                let attr_name = correct_svg_attribute_name(&attr.name.local.to_string(), &tag_name);
                let attr_value = attr.value.to_string();

                // Check if attribute value contains an expression
                if let Some(caps) = EXPR_PLACEHOLDER_RE.captures(&attr_value) {
                    let placeholder = caps.get(0).unwrap().as_str();
                    if let Some(expr_code) = normalized_exprs.get(placeholder) {
                        // FIX: Deterministic ID generation based on index AND file path hash
                        let expr_id = generate_deterministic_id(file_path, expressions.len());
                        let expr_ir = ExpressionIR {
                            id: expr_id.clone(),
                            code: expr_code.clone(),
                            location: SourceLocation { line: 1, column: 1 },
                            loop_context: parent_loop_context.cloned(),
                        };
                        expressions.push(expr_ir.clone());
                        parsed_attrs.push(AttributeIR {
                            name: attr_name,
                            value: crate::validate::AttributeValue::Dynamic(expr_ir),
                            location: SourceLocation { line: 1, column: 1 },
                            loop_context: parent_loop_context.cloned(),
                        });
                        continue;
                    }
                }

                parsed_attrs.push(AttributeIR {
                    name: attr_name,
                    value: crate::validate::AttributeValue::Static(attr_value),
                    location: SourceLocation { line: 1, column: 1 },
                    loop_context: parent_loop_context.cloned(),
                });
            }

            // Parse children
            let children_handles = node.children.borrow();
            let mut children = Vec::new();

            // Detect if we're entering <head> element
            let child_is_in_head = is_in_head || tag_name.to_lowercase() == "head";

            for child in children_handles.iter() {
                children.extend(parse_dom_node(
                    child,
                    expressions,
                    normalized_exprs,
                    inline_scripts,
                    parent_loop_context,
                    file_path,
                    child_is_in_head,
                )?);
            }

            // Check if this is a component (uppercase first letter)
            if is_component_tag(&tag_name) {
                Ok(vec![TemplateNode::Component(ComponentNode {
                    name: tag_name,
                    attributes: parsed_attrs,
                    children,
                    location: SourceLocation { line: 1, column: 1 },
                    loop_context: parent_loop_context.cloned(),
                })])
            } else {
                Ok(vec![TemplateNode::Element(ElementNode {
                    tag: tag_name,
                    attributes: parsed_attrs
                        .into_iter()
                        .filter(|a| a.name != "data-zen-inline-id")
                        .collect(),
                    children: if let Some(content) = script_content {
                        vec![TemplateNode::Text(TextNode {
                            value: content,
                            location: SourceLocation { line: 1, column: 1 },
                            loop_context: parent_loop_context.cloned(),
                        })]
                    } else {
                        children
                    },
                    location: SourceLocation { line: 1, column: 1 },
                    loop_context: parent_loop_context.cloned(),
                })])
            }
        }

        NodeData::Comment { .. } => Ok(vec![]),
        NodeData::ProcessingInstruction { .. } => Ok(vec![]),
    }
}

fn generate_deterministic_id(file_path: &str, index: usize) -> String {
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    let hash = hasher.finish();
    format!("expr_{:x}_{}", hash, index)
}

/// Process text that may contain multiple expression placeholders
fn process_text_with_expressions(
    text: &str,
    expressions: &mut Vec<ExpressionIR>,
    normalized_exprs: &HashMap<String, String>,
    loop_context: Option<&LoopContext>,
    is_in_head: bool,
    file_path: &str,
) -> Vec<TemplateNode> {
    let mut nodes = Vec::new();
    let mut last_end = 0;

    for caps in EXPR_PLACEHOLDER_RE.captures_iter(text) {
        let m = caps.get(0).unwrap();

        // Add text before this expression
        if m.start() > last_end {
            let before_text = &text[last_end..m.start()];
            if !before_text.trim().is_empty() {
                nodes.push(TemplateNode::Text(TextNode {
                    value: before_text.to_string(),
                    location: SourceLocation { line: 1, column: 1 },
                    loop_context: loop_context.cloned(),
                }));
            }
        }

        // Add expression node
        let placeholder = m.as_str();
        if let Some(expr_code) = normalized_exprs.get(placeholder) {
            // FIX: Deterministic ID generation based on index AND file path hash
            let expr_id = generate_deterministic_id(file_path, expressions.len());
            expressions.push(ExpressionIR {
                id: expr_id.clone(),
                code: expr_code.clone(),
                location: SourceLocation { line: 1, column: 1 },
                loop_context: loop_context.cloned(),
            });
            nodes.push(TemplateNode::Expression(ExpressionNode {
                expression: expr_id,
                location: SourceLocation { line: 1, column: 1 },
                loop_context: loop_context.cloned(),
                is_in_head,
            }));
        }

        last_end = m.end();
    }

    // Add remaining text
    if last_end < text.len() {
        let after_text = &text[last_end..];
        if !after_text.trim().is_empty() {
            nodes.push(TemplateNode::Text(TextNode {
                value: after_text.to_string(),
                location: SourceLocation { line: 1, column: 1 },
                loop_context: loop_context.cloned(),
            }));
        }
    }

    nodes
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/// Parse template from HTML string
pub fn parse_template(html: &str, file_path: &str) -> Result<TemplateIR, CompilerError> {
    // Step 1: Convert self-closing components
    let html_self = convert_self_closing_components(html);

    // Step 2: Strip script and style blocks
    let (html_strip, inline_scripts) = strip_blocks(&html_self);

    // Step 3: Preserve component casing (html5ever lowercases all tag names)
    let casing_preserved = mark_component_tags(&html_strip);

    // Step 4: Normalize expressions to placeholders
    let (normalized, normalized_exprs) = normalize_all_expressions(&casing_preserved);

    // INVARIANT: Rejects <template> tag (INV005) - Pre-parse check for safety
    if normalized.to_lowercase().contains("<template") {
        return Err(CompilerError::with_details(
            "INV005",
            "The <template> tag is not supported in Zenith. Use structural fragments or components instead.",
            file_path,
            1,
            1,
            Some("<template>".to_string()),
            vec![],
        ));
    }

    // Step 5: Parse with html5ever
    let dom = parse_document(RcDom::default(), Default::default())
        .from_utf8()
        .read_from(&mut normalized.as_bytes())
        .map_err(|e| {
            CompilerError::new(
                "PARSE_ERROR",
                &format!("Failed to parse HTML: {}", e),
                file_path,
                0,
                0,
            )
        })?;

    // Step 5: Convert DOM to TemplateNodes
    let mut expressions = Vec::new();
    let mut nodes = Vec::new();

    // Check if original source had document tags (after stripping blocks to avoid comments/scripts)
    // IMPORTANT: We must also strip HTML comments which might contain <html, otherwise we get false positives
    // leading to Double Head issues.
    let html_no_comments = strip_comments(&html_strip);
    let has_html_in_src = html_no_comments.to_lowercase().contains("<html");

    fn collect_body_content(
        handle: &Handle,
        nodes: &mut Vec<TemplateNode>,
        expressions: &mut Vec<ExpressionIR>,
        normalized_exprs: &HashMap<String, String>,
        inline_scripts: &HashMap<String, String>,
        file_path: &str,
        has_html_in_src: bool,
    ) -> Result<(), CompilerError> {
        let node = handle;
        match &node.data {
            NodeData::Document => {
                for child in node.children.borrow().iter() {
                    collect_body_content(
                        child,
                        nodes,
                        expressions,
                        normalized_exprs,
                        inline_scripts,
                        file_path,
                        has_html_in_src,
                    )?;
                }
            }
            NodeData::Element { name, .. } => {
                let tag = name.local.to_string().to_lowercase();

                // If it's a wrapper tag (html, head, body) and NOT in the original source,
                // we flatten it (recurse into children without adding the tag).
                // This prevents "9 Heads and 9 Bodies" issue while preserving layouts.
                let is_wrapper = tag == "html" || tag == "head" || tag == "body";
                if is_wrapper && !has_html_in_src {
                    for child in node.children.borrow().iter() {
                        collect_body_content(
                            child,
                            nodes,
                            expressions,
                            normalized_exprs,
                            inline_scripts,
                            file_path,
                            has_html_in_src,
                        )?;
                    }
                } else if tag == "html" && has_html_in_src {
                    // CRITICAL: When <html> is explicitly in source, we must preserve it
                    // as a node for document module detection to work.
                    // Parse the <html> element properly and add it to nodes.
                    nodes.extend(parse_dom_node(
                        handle,
                        expressions,
                        normalized_exprs,
                        inline_scripts,
                        None,
                        file_path,
                        false,
                    )?);
                } else {
                    nodes.extend(parse_dom_node(
                        handle,
                        expressions,
                        normalized_exprs,
                        inline_scripts,
                        None,
                        file_path,
                        false,
                    )?);
                }
            }
            NodeData::Doctype { .. } => {
                if has_html_in_src {
                    nodes.extend(parse_dom_node(
                        handle,
                        expressions,
                        normalized_exprs,
                        inline_scripts,
                        None,
                        file_path,
                        false,
                    )?);
                }
            }
            _ => {
                // For other nodes (Text, Comment, ProcessingInstruction, etc.)
                // we parse them directly if they are not filtered out by parse_dom_node
                nodes.extend(parse_dom_node(
                    handle,
                    expressions,
                    normalized_exprs,
                    inline_scripts,
                    None,
                    file_path,
                    false,
                )?);
            }
        }
        Ok(())
    }

    collect_body_content(
        &dom.document,
        &mut nodes,
        &mut expressions,
        &normalized_exprs,
        &inline_scripts,
        file_path,
        has_html_in_src,
    )?;

    Ok(TemplateIR {
        raw: html.to_string(),
        nodes,
        expressions,
    })
}

/// Parse script block from HTML string
pub fn parse_script(html: &str) -> Option<ScriptIR> {
    let mut scripts = Vec::new();
    let mut attributes = HashMap::new();

    // Manual script extraction bypassing regex for robustness
    let mut current_idx = 0;
    while let Some(open_start) = html[current_idx..].find("<script") {
        let absolute_open_start = current_idx + open_start;
        // Find closing bracket of <script ... >
        if let Some(open_end) = html[absolute_open_start..].find('>') {
            let absolute_open_end = absolute_open_start + open_end;

            // Find </script>
            if let Some(close_start) = html[absolute_open_end..].find("</script>") {
                let absolute_close_start = absolute_open_end + close_start;

                // Parse attributes
                let tag_content = &html[absolute_open_start..absolute_open_end];

                // IGNORE implies it is a template element (like is:inline)
                if tag_content.contains("is:inline") {
                    current_idx = absolute_close_start + 9;
                    continue;
                }

                if tag_content.contains("setup") {
                    attributes.insert("setup".to_string(), "true".to_string());
                }

                // Extract lang attribute
                if let Some(lang_idx) = tag_content.find("lang=") {
                    let rest = &tag_content[lang_idx + 5..];
                    let quote_char = rest.chars().next().unwrap_or('"');
                    if quote_char == '"' || quote_char == '\'' {
                        if let Some(end_idx) = rest[1..].find(quote_char) {
                            let lang_val = &rest[1..end_idx + 1]; // +1 because we search from index 1
                            attributes.insert("lang".to_string(), lang_val.to_string());
                        }
                    }
                }

                let content = &html[absolute_open_end + 1..absolute_close_start];
                if !content.trim().is_empty() {
                    scripts.push(content.trim().to_string());
                }

                current_idx = absolute_close_start + 9; // Skip </script>
            } else {
                break;
            }
        } else {
            break;
        }
    }

    if scripts.is_empty() {
        return None;
    }

    let combined_script = scripts.join("\n\n");

    // Panic removed

    // Extract props and states (Phase 1: Identifier Inventory)
    let mut props = Vec::new();
    let mut states = HashMap::new();

    for cap in PROP_RE.captures_iter(&combined_script) {
        if let Some(m) = cap.get(1) {
            props.push(m.as_str().to_string());
        }
    }

    // Also extract props from TypeScript interface Props { ... } syntax
    props.extend(extract_props_from_interface(&combined_script));

    for cap in STATE_RE.captures_iter(&combined_script) {
        if let Some(name) = cap.get(1) {
            let val = cap
                .get(2)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_else(|| "undefined".to_string());
            states.insert(name.as_str().to_string(), val);
        }
    }

    Some(ScriptIR {
        raw: combined_script,
        attributes,
        states,
        props,
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAPI EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Extract the raw script block content from a .zen file
/// Used by document compilation to get script for compile-time execution
fn extract_script_block(source: &str) -> Option<String> {
    lazy_static! {
        static ref SCRIPT_RE: Regex =
            Regex::new(r"(?is)<script\b[^>]*>([\s\S]*?)</script>").unwrap();
    }

    SCRIPT_RE
        .captures(source)
        .and_then(|cap| cap.get(1).map(|m| m.as_str().to_string()))
}

/// Extract static props passed to layout components (e.g., <DefaultLayout title="Home">)
/// This is used for document compilation to get compile-time values.
fn extract_static_layout_props(source: &str) -> std::collections::HashMap<String, String> {
    let mut props = std::collections::HashMap::new();

    // Match layout-like components with static attributes
    // Pattern: <ComponentName attr="value" attr2="value2">
    lazy_static! {
        static ref LAYOUT_RE: Regex = Regex::new(r#"<([A-Z][a-zA-Z]*Layout)\s+([^>]*?)>"#).unwrap();
        static ref ATTR_RE: Regex = Regex::new(r#"(\w+)="([^"]*)""#).unwrap();
    }

    if let Some(layout_cap) = LAYOUT_RE.captures(source) {
        if let Some(attrs_str) = layout_cap.get(2) {
            for attr_cap in ATTR_RE.captures_iter(attrs_str.as_str()) {
                if let (Some(name), Some(value)) = (attr_cap.get(1), attr_cap.get(2)) {
                    props.insert(name.as_str().to_string(), value.as_str().to_string());
                }
            }
        }
    }

    props
}

/// Full Zenith compilation entry point - the "One True Syscall"
///
/// Combines: parse_template + parse_script → ZenIR → component resolution →
/// transform → finalize → FinalizedOutput
#[cfg(feature = "napi")]
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFullOptions {
    pub mode: Option<String>,
    pub use_cache: Option<bool>,
    pub components: Option<serde_json::Value>,
    pub layout: Option<serde_json::Value>,
    pub props: Option<serde_json::Value>,
}

#[cfg(feature = "napi")]
#[napi]
pub fn parse_full_zen_native(
    source: String,
    file_path: String,
    options_json: String,
) -> napi::Result<serde_json::Value> {
    // println!("[DEBUG] parse_full_zen_native called for {}", file_path);
    /*
    eprintln!("[Zenith PARSE_FULL] ENTRY - file: {}", file_path);
    eprintln!(
        "[Zenith PARSE_FULL] Options JSON: {}",
        &options_json[..options_json.len().min(200)]
    );
    */

    use crate::component::resolve_components;
    use crate::finalize::{finalize_output_internal, CompiledTemplate};
    use crate::validate::ZenIR;

    // Parse options from JSON string to avoid napi undefined issues
    let options: ParseFullOptions = serde_json::from_str(&options_json)
        .map_err(|e| napi::Error::from_reason(format!("Options parse error: {}", e)))?;

    let mode = options.mode.unwrap_or_else(|| "full".to_string());

    // Parse template
    let template_ir = match parse_template(&source, &file_path) {
        Ok(ir) => ir,
        Err(e) => {
            return Ok(serde_json::json!({
                "code": e.code,
                "errorType": e.error_type,
                "message": e.message,
                "guarantee": e.guarantee,
                "file": e.file,
                "line": e.line,
                "column": e.column,
                "context": e.context,
                "hints": e.hints
            }))
        }
    };

    // Step 2: Parse script
    let script_ir = parse_script(&source);

    // Step 3: Build initial ZenIR
    let mut zen_ir = ZenIR {
        file_path: file_path.clone(),
        template: template_ir,
        script: script_ir.clone(),
        styles: crate::discovery::extract_styles_native(source.clone())
            .into_iter()
            .map(|raw| crate::validate::StyleIR { raw })
            .collect(),
        props: script_ir
            .as_ref()
            .map(|s| s.props.clone())
            .unwrap_or_default(),
        page_bindings: script_ir
            .as_ref()
            .map(|s| s.states.keys().cloned().collect())
            .unwrap_or_default(),
        page_props: script_ir
            .as_ref()
            .map(|s| s.props.clone())
            .unwrap_or_default(),
        all_states: script_ir.map(|s| s.states).unwrap_or_default(),
        head_directive: None,
        // Bundler manifest fields - initialized with defaults, computed during finalization
        uses_state: false,
        has_events: false,
        css_classes: vec![],
    };

    // For metadata mode, return early with just IR
    if mode == "metadata" {
        let result = serde_json::to_value(&zen_ir)
            .map_err(|e| napi::Error::from_reason(format!("Serialize error: {}", e)))?;
        return Ok(result);
    }

    // Step 4: Resolve components if provided
    /*
    eprintln!(
        "[Zenith PARSE] Checking components option: {:?}",
        options.components.is_some()
    );
    */
    let mut components_map: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();
    if let Some(components) = &options.components {
        if !components.is_null() {
            components_map = serde_json::from_value(components.clone()).unwrap_or_default();
            if !components_map.is_empty() {
                // Component resolution handled internally
                zen_ir = resolve_components(zen_ir, components_map.clone())
                    .map_err(|e| napi::Error::from_reason(e))?;
            } else {
            }
        } else {
        }
    } else {
    }

    // Step 5: Transform template
    // Check if this is a document module and build scope if so
    let is_document = crate::document::is_document_module(&zen_ir.template.nodes);

    let document_scope = if is_document {
        // For document modules, we need to:
        // 1. Get props that were passed to the layout (from page_props)
        // 2. Build a scope from those props

        // Build props map from page_props (these are the props passed to the layout)
        let mut props_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();

        // If this is a layout-wrapped document, the props are in the ZenIR
        // Check options first, then fall back to extracting from page
        if let Some(opts_props) = &options.props {
            if let Some(obj) = opts_props.as_object() {
                for (k, v) in obj {
                    if let Some(s) = v.as_str() {
                        props_map.insert(k.clone(), s.to_string());
                    }
                }
            }
        }

        // Also extract props that were statically passed in the original source
        // Parse the original template to find static attribute values on layout component
        let static_props = extract_static_layout_props(&source);
        for (k, v) in static_props {
            props_map.insert(k, v);
        }

        // Extract script source from the ORIGINAL source of the document-providing component
        // We look for a component in components_map that has <html> as its root.
        let mut script_source = extract_script_block(&source).unwrap_or_default();

        for (_name, comp_val) in &components_map {
            if let Ok(comp) =
                serde_json::from_value::<crate::component::ComponentIR>(comp_val.clone())
            {
                if crate::document::is_document_module(&comp.nodes) {
                    if let Some(s) = comp.script {
                        script_source = s;
                        break;
                    }
                }
            }
        }

        // Execute document script at compile time
        match crate::document::execute_document_script(&script_source, &props_map) {
            Ok(scope) => Some(scope),
            Err(_e) => {
                // Don't fail hard - fall back to no scope (will show compile error in output)
                None
            }
        }
    } else {
        None
    };

    let transform_output = crate::transform::transform_template_with_scope(
        &zen_ir.template.nodes,
        &zen_ir.template.expressions,
        document_scope.as_ref(),
    );

    let compiled = CompiledTemplate {
        html: transform_output.html,
        styles: vec![],
    };

    // Step 6: Finalize output
    let finalized = finalize_output_internal(zen_ir.clone(), compiled)
        .map_err(|e| napi::Error::from_reason(e))?;

    // Step 7: Build result with all fields
    let mut result = serde_json::json!({
        "ir": zen_ir,
        "html": finalized.html,
        "hasErrors": finalized.has_errors,
        "errors": finalized.errors,
        "bindings": transform_output.bindings,
    });

    if let Some(manifest) = finalized.manifest {
        if let Some(obj) = result.as_object_mut() {
            obj.insert("js".to_string(), serde_json::json!(manifest.bundle));
            obj.insert(
                "npmImports".to_string(),
                serde_json::json!(manifest.npm_imports),
            );
            obj.insert("styles".to_string(), serde_json::json!(manifest.styles));
            obj.insert(
                "manifest".to_string(),
                serde_json::to_value(&manifest).unwrap_or(serde_json::Value::Null),
            );
        }
    }

    Ok(result)
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL RUST-TO-RUST API (FOR ROLLDOWN PLUGIN)
// ═══════════════════════════════════════════════════════════════════════════════

/// Options for internal compilation (Rust structs, no JSON)
#[derive(Debug, Clone, Default)]
pub struct CompileOptions {
    pub mode: String,
    pub components: std::collections::HashMap<String, serde_json::Value>,
    pub layout: Option<serde_json::Value>,
    pub props: std::collections::HashMap<String, String>,
}

/// Result of internal compilation (Rust structs, no JSON serialization)
#[derive(Debug, Clone)]
pub struct CompileResult {
    pub html: String,
    pub has_errors: bool,
    pub errors: Vec<String>,
    pub manifest: Option<crate::finalize::ZenManifestExport>,
    pub bindings: Vec<crate::transform::Binding>,
}

/// Internal Zenith compilation entry point for Rolldown plugin.
/// Returns Rust structs directly - NO JSON serialization overhead.
pub fn compile_zen_internal(
    source: &str,
    file_path: &str,
    options: CompileOptions,
) -> Result<CompileResult, String> {
    use crate::component::resolve_components;
    use crate::finalize::{finalize_output_internal, CompiledTemplate};
    use crate::validate::ZenIR;

    let mode = if options.mode.is_empty() {
        "full".to_string()
    } else {
        options.mode.clone()
    };

    // Step 1: Parse template
    let template_ir = parse_template(source, file_path)
        .map_err(|e| format!("Template parse error: {}", e.message))?;

    // Step 2: Parse script
    let script_ir = parse_script(source);

    // Step 3: Build initial ZenIR
    let mut zen_ir = ZenIR {
        file_path: file_path.to_string(),
        template: template_ir,
        script: script_ir.clone(),
        styles: crate::discovery::extract_styles_native(source.to_string())
            .into_iter()
            .map(|raw| crate::validate::StyleIR { raw })
            .collect(),
        props: script_ir
            .as_ref()
            .map(|s| s.props.clone())
            .unwrap_or_default(),
        page_bindings: script_ir
            .as_ref()
            .map(|s| s.states.keys().cloned().collect())
            .unwrap_or_default(),
        page_props: script_ir
            .as_ref()
            .map(|s| s.props.clone())
            .unwrap_or_default(),
        all_states: script_ir.map(|s| s.states).unwrap_or_default(),
        head_directive: None,
        uses_state: false,
        has_events: false,
        css_classes: vec![],
    };

    // For metadata mode, return early
    if mode == "metadata" {
        return Ok(CompileResult {
            html: String::new(),
            has_errors: false,
            errors: vec![],
            manifest: None,
            bindings: Vec::new(),
        });
    }

    // Step 4: Resolve components if provided
    if !options.components.is_empty() {
        zen_ir = resolve_components(zen_ir, options.components.clone())?;
    }

    // Step 5: Transform template
    let is_document = crate::document::is_document_module(&zen_ir.template.nodes);

    let document_scope = if is_document {
        let mut props_map: std::collections::HashMap<String, String> = options.props.clone();
        let static_props = extract_static_layout_props(source);
        for (k, v) in static_props {
            props_map.insert(k, v);
        }

        let mut script_source = extract_script_block(source).unwrap_or_default();
        for (_name, comp_val) in &options.components {
            if let Ok(comp) =
                serde_json::from_value::<crate::component::ComponentIR>(comp_val.clone())
            {
                if crate::document::is_document_module(&comp.nodes) {
                    if let Some(s) = comp.script {
                        script_source = s;
                        break;
                    }
                }
            }
        }

        match crate::document::execute_document_script(&script_source, &props_map) {
            Ok(scope) => Some(scope),
            Err(_) => None,
        }
    } else {
        None
    };

    let transform_output = crate::transform::transform_template_with_scope(
        &zen_ir.template.nodes,
        &zen_ir.template.expressions,
        document_scope.as_ref(),
    );

    let compiled = CompiledTemplate {
        html: transform_output.html,
        styles: vec![],
    };

    // Step 6: Finalize output
    let finalized = finalize_output_internal(zen_ir.clone(), compiled)?;

    Ok(CompileResult {
        html: finalized.html,
        has_errors: finalized.has_errors,
        errors: finalized.errors,
        manifest: finalized.manifest,
        bindings: transform_output.bindings,
    })
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFACE-BASED PROP EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/// Extract props from TypeScript interface Props { ... } syntax.
/// Matches patterns like:
/// - interface Props { title: string; description: string; }
/// - interface Props {\n    title: string;\n    number: number;\n}
fn extract_props_from_interface(script: &str) -> Vec<String> {
    let mut props = Vec::new();

    // Match `interface Props { ... }` block
    let interface_re = Regex::new(r"(?s)interface\s+Props\s*\{([^}]*)\}").unwrap();

    if let Some(cap) = interface_re.captures(script) {
        if let Some(body) = cap.get(1) {
            let body_str = body.as_str();
            // Match property definitions: name: type or name?: type
            let prop_re = Regex::new(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\??\s*:").unwrap();
            for prop_cap in prop_re.captures_iter(body_str) {
                if let Some(m) = prop_cap.get(1) {
                    props.push(m.as_str().to_string());
                }
            }
        }
    }

    if !props.is_empty() {
        // eprintln!(
        //     "[Zenith PARSE_SCRIPT] Interface Props extracted: {:?}",
        //     props
        // );
    }
    props
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_component_tag() {
        assert!(is_component_tag("Button"));
        assert!(is_component_tag("HeroSection"));
        assert!(!is_component_tag("div"));
        assert!(!is_component_tag("span"));
    }

    #[test]
    fn test_svg_attribute_correction() {
        assert_eq!(correct_svg_attribute_name("viewbox", "svg"), "viewBox");
        assert_eq!(
            correct_svg_attribute_name("preserveaspectratio", "svg"),
            "preserveAspectRatio"
        );
        assert_eq!(correct_svg_attribute_name("class", "svg"), "class"); // Not in map
        assert_eq!(correct_svg_attribute_name("viewbox", "div"), "viewbox"); // Not SVG element
    }

    #[test]
    fn test_find_balanced_brace() {
        assert_eq!(find_balanced_brace_end("{hello}", 0), Some(7));
        assert_eq!(find_balanced_brace_end("{a + b}", 0), Some(7));
        assert_eq!(find_balanced_brace_end("{obj.map(x => x)}", 0), Some(17));
        assert_eq!(
            find_balanced_brace_end("{'string with { brace'}", 0),
            Some(23)
        );
    }

    #[test]
    fn test_normalize_expressions() {
        let (normalized, exprs) = normalize_all_expressions("<div>{count}</div>");
        assert!(normalized.contains("__ZENITH_EXPR_"));
        assert_eq!(exprs.len(), 1);
        assert!(exprs.values().any(|v| v == "count"));
    }

    #[test]
    fn test_convert_self_closing() {
        let result = convert_self_closing_components("<Button />");
        assert_eq!(result, "<Button ></Button>");

        let result = convert_self_closing_components("<Card prop=\"value\" />");
        assert!(result.contains("<Card"));
        assert!(result.contains("</Card>"));
    }

    #[test]
    fn test_parse_script() {
        let html = r#"<script setup lang="ts">const x = 1;</script>"#;
        let script = parse_script(html);
        assert!(script.is_some());
        let script = script.unwrap();
        assert!(script.raw.contains("const x = 1"));
        assert_eq!(script.attributes.get("setup"), Some(&"true".to_string()));
        assert_eq!(script.attributes.get("lang"), Some(&"ts".to_string()));
    }
}
