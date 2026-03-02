use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::document::DocumentScope;
use crate::validate::{AttributeValue, ExpressionIR, LoopContext, SourceLocation, TemplateNode};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct Binding {
    pub id: String,
    pub r#type: String, // 'text' | 'attribute' | 'conditional' | 'optional' | 'loop'
    pub target: String,
    pub expression: String,
    pub location: Option<SourceLocation>,
    pub loop_context: Option<LoopContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct TransformOutput {
    pub html: String,
    pub bindings: Vec<Binding>,
}

/// Transform template with optional document scope for document modules
pub fn transform_template_with_scope(
    nodes: &[TemplateNode],
    expressions: &[ExpressionIR],
    document_scope: Option<&DocumentScope>,
) -> TransformOutput {
    let mut html = String::new();
    let mut bindings = Vec::new();

    // Check if this is a document module (root is <html>)
    let is_document = crate::document::is_document_module(nodes);

    for node in nodes.iter() {
        let (node_html, node_bindings) = transform_node_internal(
            node,
            expressions,
            &None,
            false,
            false, // is_inside_raw_text
            if is_document { document_scope } else { None },
        );
        html.push_str(&node_html);
        bindings.extend(node_bindings);
    }

    TransformOutput { html, bindings }
}

#[cfg(feature = "napi")]
#[napi]
pub fn transform_template_native(
    nodes_json: String,
    expressions_json: String,
) -> napi::Result<TransformOutput> {
    let nodes: Vec<TemplateNode> = serde_json::from_str(&nodes_json)
        .map_err(|e| napi::Error::from_reason(format!("Nodes parse error: {}", e)))?;
    let expressions: Vec<ExpressionIR> = serde_json::from_str(&expressions_json)
        .map_err(|e| napi::Error::from_reason(format!("Expressions parse error: {}", e)))?;

    Ok(transform_template_with_scope(&nodes, &expressions, None))
}

fn transform_node_internal(
    node: &TemplateNode,
    expressions: &[ExpressionIR],
    parent_loop_context: &Option<LoopContext>,
    is_inside_head: bool,
    is_inside_raw_text: bool, // Skip HTML escaping for script/style content
    document_scope: Option<&DocumentScope>,
) -> (String, Vec<Binding>) {
    let mut bindings = Vec::new();

    let html = match node {
        // Skip HTML escaping for text inside script/style tags
        TemplateNode::Text(t) => {
            if is_inside_raw_text {
                t.value.clone()
            } else {
                escape_html(&t.value)
            }
        }

        TemplateNode::Doctype(doc) => {
            let mut content = format!("<!DOCTYPE {}", doc.name);
            if !doc.public_id.is_empty() {
                content.push_str(&format!(" PUBLIC \"{}\"", doc.public_id));
            }
            if !doc.system_id.is_empty() {
                content.push_str(&format!(" \"{}\"", doc.system_id));
            }
            content.push('>');
            content
        }

        TemplateNode::Expression(expr_node) => {
            let expr = expressions
                .iter()
                .find(|e| e.id == expr_node.expression)
                .expect("Expression not found");

            // PHASE 3: Compile-time Head Resolution
            // When inside <head>, we emit the expression code directly as a placeholder
            // that will be resolved during the final emission pass (not runtime).
            // This prevents <!--zen:expr--> comments from appearing in <head>.
            if is_inside_head {
                // STRICT HEAD ENFORCEMENT
                // Expressions in head MUST be statically resolvable at compile time.
                // If we have a document scope, use it for resolution
                if let Some(scope) = document_scope {
                    match crate::document::resolve_document_expression(&expr.code, scope) {
                        Ok(resolved) => resolved,
                        Err(e) => {
                            format!("ZENITH_COMPILE_ERROR: {}", e)
                        }
                    }
                } else {
                    // Fallback to static_eval with empty props
                    let empty_props = std::collections::HashMap::new();
                    match crate::static_eval::static_eval(&expr.code, &empty_props) {
                        Some(resolved) => resolved,
                        None => {
                            format!(
                                "ZENITH_COMPILE_ERROR: Dynamic expression '{}' not allowed in <head>",
                                expr.code
                            )
                        }
                    }
                }
            } else {
                let active_loop_context = expr_node
                    .loop_context
                    .clone()
                    .or(parent_loop_context.clone());

                bindings.push(Binding {
                    id: expr.id.clone(),
                    r#type: "text".to_string(),
                    target: "data-zen-text".to_string(),
                    expression: expr.code.clone(),
                    location: Some(expr.location.clone()),
                    loop_context: active_loop_context,
                });

                format!("<!--zen:{}-->", expr.id)
            }
        }

        TemplateNode::Element(el) => {
            let tag = &el.tag;
            let mut attrs = Vec::new();

            for attr in &el.attributes {
                match &attr.value {
                    AttributeValue::Static(v) => {
                        attrs.push(format!("{}=\"{}\"", attr.name, escape_html(v)));
                    }
                    AttributeValue::Dynamic(expr) => {
                        let active_loop_context =
                            attr.loop_context.clone().or(parent_loop_context.clone());

                        bindings.push(Binding {
                            id: expr.id.clone(),
                            r#type: "attribute".to_string(),
                            target: attr.name.clone(),
                            expression: expr.code.clone(),
                            location: Some(expr.location.clone()),
                            loop_context: active_loop_context,
                        });

                        attrs.push(format!("data-zen-attr-{}={}", attr.name, expr.id));
                    }
                }
            }

            let attr_str = if attrs.is_empty() {
                "".to_string()
            } else {
                format!(" {}", attrs.join(" "))
            };

            let active_loop_context = el.loop_context.clone().or(parent_loop_context.clone());
            let next_in_head = is_inside_head || tag.to_lowercase() == "head";
            // Detect raw text elements (script/style) - don't escape their content
            let tag_lower = tag.to_lowercase();
            let next_raw_text = is_inside_raw_text || tag_lower == "script" || tag_lower == "style";

            let mut children_html = String::new();
            for child in &el.children {
                let (c_html, c_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &active_loop_context,
                    next_in_head,
                    next_raw_text,
                    document_scope,
                );
                children_html.push_str(&c_html);
                bindings.extend(c_bindings);
            }

            let void_elements: HashSet<&str> = [
                "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
                "param", "source", "track", "wbr",
            ]
            .iter()
            .cloned()
            .collect();

            if void_elements.contains(tag.to_lowercase().as_str()) && children_html.is_empty() {
                format!("<{}{} />", tag, attr_str)
            } else {
                format!("<{}{}>{}</{}>", tag, attr_str, children_html, tag)
            }
        }

        TemplateNode::ConditionalFragment(cond) => {
            let expr = expressions
                .iter()
                .find(|e| e.id == cond.condition)
                .expect("Condition expression not found");

            bindings.push(Binding {
                id: expr.id.clone(),
                r#type: "conditional".to_string(),
                target: "data-zen-conditional".to_string(),
                expression: expr.code.clone(),
                location: Some(expr.location.clone()),
                loop_context: cond.loop_context.clone(),
            });

            let mut cons_html = String::new();
            for child in &cond.consequent {
                let (c_html, c_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &cond.loop_context,
                    is_inside_head,
                    is_inside_raw_text,
                    document_scope,
                );
                cons_html.push_str(&c_html);
                bindings.extend(c_bindings);
            }

            let mut alt_html = String::new();
            for child in &cond.alternate {
                let (a_html, a_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &cond.loop_context,
                    is_inside_head,
                    is_inside_raw_text,
                    document_scope,
                );
                alt_html.push_str(&a_html);
                bindings.extend(a_bindings);
            }

            format!(
                "<div data-zen-conditional=\"{}\" style=\"display: contents;\">\n<div data-zen-branch=\"true\" style=\"display: contents;\">{}</div>\n<div data-zen-branch=\"false\" style=\"display: contents;\">{}</div>\n</div>",
                expr.id, cons_html, alt_html
            )
        }

        TemplateNode::OptionalFragment(opt) => {
            let expr = expressions
                .iter()
                .find(|e| e.id == opt.condition)
                .expect("Optional condition expression not found");

            bindings.push(Binding {
                id: expr.id.clone(),
                r#type: "optional".to_string(),
                target: "data-zen-optional".to_string(),
                expression: expr.code.clone(),
                location: Some(expr.location.clone()),
                loop_context: opt.loop_context.clone(),
            });

            let mut frag_html = String::new();
            for child in &opt.fragment {
                let (c_html, c_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &opt.loop_context,
                    is_inside_head,
                    is_inside_raw_text,
                    document_scope,
                );
                frag_html.push_str(&c_html);
                bindings.extend(c_bindings);
            }

            format!(
                "<div data-zen-optional=\"{}\" style=\"display: contents;\">{}</div>",
                expr.id, frag_html
            )
        }

        TemplateNode::LoopFragment(lp) => {
            let expr = expressions
                .iter()
                .find(|e| e.id == lp.source)
                .expect("Loop source expression not found");

            bindings.push(Binding {
                id: expr.id.clone(),
                r#type: "loop".to_string(),
                target: "data-zen-loop".to_string(),
                expression: expr.code.clone(),
                location: Some(expr.location.clone()),
                loop_context: lp.loop_context.clone(),
            });

            let mut body_html = String::new();
            for child in &lp.body {
                let (b_html, b_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &lp.loop_context,
                    is_inside_head,
                    is_inside_raw_text,
                    document_scope,
                );
                body_html.push_str(&b_html);
                bindings.extend(b_bindings);
            }

            let index_attr = if let Some(ref idx) = lp.index_var {
                format!(" data-zen-index=\"{}\"", idx)
            } else {
                "".to_string()
            };

            format!(
                "<template data-zen-loop=\"{}\" data-zen-item=\"{}\"{}>{}</template>",
                expr.id, lp.item_var, index_attr, body_html
            )
        }

        TemplateNode::Component(comp) => {
            let mut children_html = String::new();
            for child in &comp.children {
                let (c_html, c_bindings) = transform_node_internal(
                    child,
                    expressions,
                    &comp.loop_context,
                    is_inside_head,
                    is_inside_raw_text,
                    document_scope,
                );
                children_html.push_str(&c_html);
                bindings.extend(c_bindings);
            }
            format!(
                "<div data-zen-component=\"{}\" style=\"display: contents;\">{}</div>",
                comp.name, children_html
            )
        }
    };

    (html, bindings)
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\"', "&quot;")
        .replace('\'', "&#39;")
}
