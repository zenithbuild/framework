//! Static-only image materialization entries derived from marker bindings + rewritten props literals.

use serde::Serialize;
use tree_sitter::Node;

use crate::compiler::MarkerPayload;
use crate::expression_scope::{node_text, parse_typescript};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ImageMaterializationEntry {
    pub selector: String,
    pub props: serde_json::Value,
}

pub fn build_image_materialization(
    markers: &[MarkerPayload],
    literals: &[String],
) -> Result<Vec<ImageMaterializationEntry>, String> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    let mut lit_i = 0usize;

    let expected_pairs = count_image_pairs_from(markers, 0)?;

    while cursor < markers.len() {
        let img_idx = match find_attr_marker_optional(markers, cursor, "data-zenith-image") {
            Some(i) => i,
            None => break,
        };
        let data_sel = markers[img_idx].selector.clone();
        let unsafe_idx = find_attr_marker(markers, img_idx + 1, "unsafeHTML")?;
        let literal = literals.get(lit_i).ok_or_else(|| {
            format!(
                "image materialization: missing static props literal for Image occurrence {} (expected {} literals, got {})",
                lit_i + 1,
                expected_pairs,
                literals.len()
            )
        })?;
        let props = parse_static_props_object_literal(literal)?;
        out.push(ImageMaterializationEntry {
            selector: data_sel,
            props,
        });
        lit_i += 1;
        cursor = unsafe_idx + 1;
    }

    if lit_i != literals.len() {
        return Err(format!(
            "image materialization: excess static props literals (expected {} Image occurrence(s), got {})",
            lit_i,
            literals.len()
        ));
    }

    Ok(out)
}

fn count_image_pairs_from(markers: &[MarkerPayload], start_cursor: usize) -> Result<usize, String> {
    let mut cursor = start_cursor;
    let mut n = 0usize;
    while cursor < markers.len() {
        let img_idx = match find_attr_marker_optional(markers, cursor, "data-zenith-image") {
            Some(i) => i,
            None => break,
        };
        let unsafe_idx = find_attr_marker(markers, img_idx + 1, "unsafeHTML")?;
        n += 1;
        cursor = unsafe_idx + 1;
    }
    Ok(n)
}

fn find_attr_marker_optional(markers: &[MarkerPayload], start: usize, attr: &str) -> Option<usize> {
    for idx in start..markers.len() {
        let m = &markers[idx];
        if m.kind == "attr" && m.attr.as_deref() == Some(attr) {
            return Some(idx);
        }
    }
    None
}

fn find_attr_marker(markers: &[MarkerPayload], start: usize, attr: &str) -> Result<usize, String> {
    find_attr_marker_optional(markers, start, attr).ok_or_else(|| {
        format!(
            "image materialization: framework Image marker contract drifted (missing `{attr}` marker after offset {start})"
        )
    })
}

fn parse_static_props_object_literal(literal: &str) -> Result<serde_json::Value, String> {
    let trimmed = literal.trim();
    if trimmed.is_empty() {
        return Err(
            "image materialization: static Image props literal is empty (dynamic Image props are unsupported)"
                .to_string(),
        );
    }
    let wrapped = format!("const __zenith_image_props = {trimmed};");
    let tree = parse_typescript(&wrapped).ok_or_else(|| {
        "image materialization: failed to parse static Image props literal (dynamic Image props are unsupported)"
            .to_string()
    })?;
    let root = tree.root_node();
    let decl = root
        .named_child(0)
        .filter(|n| n.kind() == "lexical_declaration" || n.kind() == "variable_declaration")
        .ok_or_else(|| {
            "image materialization: malformed static Image props parse tree".to_string()
        })?;
    let declarator = decl
        .named_child(0)
        .filter(|n| n.kind() == "variable_declarator")
        .ok_or_else(|| {
            "image materialization: malformed static Image props parse tree".to_string()
        })?;
    let init = declarator.named_child(1).ok_or_else(|| {
        "image materialization: static Image props must resolve to an object".to_string()
    })?;
    static_ts_to_json(init, wrapped.as_str())
}

fn static_ts_to_json(node: Node<'_>, source: &str) -> Result<serde_json::Value, String> {
    let n = skip_parens(node);
    match n.kind() {
        "object" => object_like_to_json(n, source),
        "array" => array_to_json(n, source),
        "string" | "string_fragment" => parse_string_literal(n, source),
        "number" => {
            let t = node_text(n, source);
            let v: f64 = t
                .parse()
                .map_err(|_| format!("image materialization: invalid numeric literal `{t}`"))?;
            Ok(serde_json::json!(v))
        }
        "true" => Ok(serde_json::Value::Bool(true)),
        "false" => Ok(serde_json::Value::Bool(false)),
        "null" => Ok(serde_json::Value::Null),
        "undefined" => Ok(serde_json::Value::Null),
        "identifier" => {
            let t = node_text(n, source);
            if t == "undefined" {
                return Ok(serde_json::Value::Null);
            }
            Err(dynamic_err(n, source))
        }
        "template_string" => Err(dynamic_err(n, source)),
        "unary_expression" => unary_to_json(n, source),
        _ => Err(dynamic_err(n, source)),
    }
}

fn parse_string_literal(node: Node<'_>, source: &str) -> Result<serde_json::Value, String> {
    let t = node_text(node, source).trim();
    serde_json::from_str(t).map_err(|_| dynamic_err(node, source))
}

fn skip_parens(mut node: Node<'_>) -> Node<'_> {
    while node.kind() == "parenthesized_expression" {
        node = match node.named_child(0) {
            Some(c) => c,
            None => break,
        };
    }
    node
}

fn unary_to_json(node: Node<'_>, source: &str) -> Result<serde_json::Value, String> {
    let op = node.child(0).map(|c| node_text(c, source)).unwrap_or("");
    let operand = node
        .named_child(0)
        .ok_or_else(|| dynamic_err(node, source))?;
    let v = static_ts_to_json(operand, source)?;
    let num = v.as_f64().ok_or_else(|| dynamic_err(node, source))?;
    match op {
        "-" => Ok(serde_json::json!(-num)),
        "+" => Ok(serde_json::json!(num)),
        _ => Err(dynamic_err(node, source)),
    }
}

fn object_like_to_json(node: Node<'_>, source: &str) -> Result<serde_json::Value, String> {
    let mut map = serde_json::Map::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        match child.kind() {
            "pair" => {
                let key = child
                    .child_by_field_name("key")
                    .ok_or_else(|| dynamic_err(child, source))?;
                let key_str = object_key_name(key, source)?;
                let value = child
                    .child_by_field_name("value")
                    .ok_or_else(|| dynamic_err(child, source))?;
                map.insert(key_str, static_ts_to_json(value, source)?);
            }
            "shorthand_property_identifier" => {
                return Err(dynamic_err(child, source));
            }
            "spread_element" => {
                return Err(dynamic_err(child, source));
            }
            _ => {}
        }
    }
    Ok(serde_json::Value::Object(map))
}

fn object_key_name(node: Node<'_>, source: &str) -> Result<String, String> {
    match node.kind() {
        "property_identifier" | "identifier" => Ok(node_text(node, source).to_string()),
        "string" | "string_fragment" => Err(dynamic_err(node, source)),
        _ => Err(dynamic_err(node, source)),
    }
}

fn array_to_json(node: Node<'_>, source: &str) -> Result<serde_json::Value, String> {
    let mut out = Vec::new();
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() == "," {
            continue;
        }
        out.push(static_ts_to_json(child, source)?);
    }
    Ok(serde_json::Value::Array(out))
}

fn dynamic_err(node: Node<'_>, source: &str) -> String {
    let snippet = node_text(node, source);
    format!(
        "image materialization: unsupported dynamic Image prop expression `{snippet}` (static literal props only; dynamic Image props require a future compiler artifact)"
    )
}
