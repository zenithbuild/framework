use std::collections::{BTreeMap, HashMap};

use regex::Regex;

use crate::ast::{Attribute, ElementNode, Node, SourceSpan};
use crate::event_contract;
use crate::script::{
    ComponentInstanceBinding, ComponentScriptAsset, HoistedOutput, HoistedScript, SCRIPT_ID_ATTR,
    SCRIPT_PLACEHOLDER_TAG,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkerKind {
    Text,
    Attr,
    Event,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkerBinding {
    pub index: usize,
    pub kind: MarkerKind,
    pub selector: String,
    pub attr: Option<String>,
    pub source: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventBinding {
    pub index: usize,
    pub event: String,
    pub selector: String,
    pub source: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RefBinding {
    pub index: usize,
    pub identifier: String,
    pub selector: String,
    pub source: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransformWarning {
    pub code: String,
    pub message: String,
    pub line: usize,
    pub column: usize,
}

pub fn transform(
    root: Node,
    scripts: &[HoistedScript],
) -> (
    Node,
    Vec<String>,
    HoistedOutput,
    BTreeMap<String, ComponentScriptAsset>,
    Vec<ComponentInstanceBinding>,
    Vec<MarkerBinding>,
    Vec<EventBinding>,
    Vec<RefBinding>,
    Vec<TransformWarning>,
) {
    let mut transformer = Transformer::new(scripts);
    let transformed_root = transformer.transform_node(root);
    transformer.markers.sort_by(|a, b| a.index.cmp(&b.index));
    transformer.events.sort_by(|a, b| a.index.cmp(&b.index));
    transformer
        .ref_bindings
        .sort_by(|a, b| a.index.cmp(&b.index));
    (
        transformed_root,
        transformer.expressions,
        transformer.hoisted,
        transformer.component_scripts,
        transformer.component_instances,
        transformer.markers,
        transformer.events,
        transformer.ref_bindings,
        transformer.warnings,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RewriteContext {
    Text,
    Attribute,
    Event,
}

struct Transformer {
    expressions: Vec<String>,
    scripts: HashMap<usize, HoistedScript>,
    scopes: Vec<HashMap<String, String>>,
    hoisted: HoistedOutput,
    component_scripts: BTreeMap<String, ComponentScriptAsset>,
    component_instances: Vec<ComponentInstanceBinding>,
    markers: Vec<MarkerBinding>,
    events: Vec<EventBinding>,
    ref_bindings: Vec<RefBinding>,
    warnings: Vec<TransformWarning>,
    ref_counter: usize,
}

impl Transformer {
    fn new(scripts: &[HoistedScript]) -> Self {
        let mut map = HashMap::new();
        let mut global_scope = HashMap::new();
        let mut hoisted = HoistedOutput::default();

        for script in scripts {
            if script.is_global {
                hoisted.merge_script(script);
                for binding in &script.bindings {
                    global_scope.insert(binding.original.clone(), binding.renamed.clone());
                }
            } else {
                map.insert(script.id, script.clone());
            }
        }

        Self {
            expressions: Vec::new(),
            scripts: map,
            scopes: if global_scope.is_empty() {
                Vec::new()
            } else {
                vec![global_scope]
            },
            hoisted,
            component_scripts: BTreeMap::new(),
            component_instances: Vec::new(),
            markers: Vec::new(),
            events: Vec::new(),
            ref_bindings: Vec::new(),
            warnings: Vec::new(),
            ref_counter: 0,
        }
    }

    fn add_expression(&mut self, expr: String) -> usize {
        let idx = self.expressions.len();
        self.expressions.push(expr);
        idx
    }

    fn insert_marker(&mut self, marker: MarkerBinding) {
        if self
            .markers
            .iter()
            .any(|existing| existing.index == marker.index)
        {
            panic!(
                "Duplicate marker index {} detected during transform",
                marker.index
            );
        }
        self.markers.push(marker);
    }

    fn transform_node(&mut self, node: Node) -> Node {
        match node {
            Node::Element(elem) => self.transform_element(elem),
            Node::Expression { value, span } => {
                Node::Expression {
                    value: self.rewrite_expression(&value, RewriteContext::Text),
                    span,
                }
            }
            Node::Text(text) => Node::Text(text),
        }
    }

    fn transform_element(&mut self, mut elem: ElementNode) -> Node {
        if self.script_placeholder_id(&elem).is_some() {
            return Node::Text(String::new());
        }

        let mut local_scope = HashMap::new();
        let mut component_markers = Vec::new();
        for child in &elem.children {
            if let Node::Element(child_elem) = child {
                if let Some(script_id) = self.script_placeholder_id(child_elem) {
                    let script = self.scripts.get(&script_id).unwrap_or_else(|| {
                        panic!("Missing script payload for placeholder id {}", script_id)
                    });
                    let instance_key = format!("c{script_id}");
                    let selector = format!(r#"[data-zx-c~="{instance_key}"]"#);

                    component_markers.push(instance_key.clone());
                    self.component_instances.push(ComponentInstanceBinding {
                        instance: instance_key.clone(),
                        hoist_id: script.hoist_id.clone(),
                        selector,
                    });
                    self.component_scripts
                        .entry(script.hoist_id.clone())
                        .or_insert_with(|| ComponentScriptAsset {
                            hoist_id: script.hoist_id.clone(),
                            factory: script.factory_name.clone(),
                            imports: script.imports.clone(),
                            code: script.factory_code.clone(),
                        });

                    for binding in &script.bindings {
                        local_scope.insert(
                            binding.original.clone(),
                            format!("{}.{}", instance_key, binding.original),
                        );
                    }
                }
            }
        }

        let pushed_scope = !local_scope.is_empty();
        if pushed_scope {
            self.scopes.push(local_scope);
        }

        let mut new_attributes = Vec::new();
        for attr in elem.attributes {
            match attr {
                Attribute::Event {
                    name,
                    handler,
                    span,
                } => {
                    let normalized = event_contract::normalize_event_name(&name);
                    let canonical = event_contract::canonicalize_event_name(&normalized);
                    if !event_contract::is_known_event(&canonical) {
                        let suggestion = event_contract::suggest_known_event(&canonical);
                        let message = match suggestion {
                            Some(candidate) => format!(
                                "Unknown DOM event '{}'. Did you mean '{}'?",
                                canonical, candidate
                            ),
                            None => format!("Unknown DOM event '{}'.", canonical),
                        };
                        self.warnings.push(TransformWarning {
                            code: "ZEN-EVT-UNKNOWN".to_string(),
                            message,
                            line: span.start.line,
                            column: span.start.column,
                        });
                    }
                    let rewritten = self.rewrite_expression(&handler, RewriteContext::Event);
                    let idx = self.add_expression(rewritten);
                    let selector = format!(r#"[data-zx-on-{}="{}"]"#, canonical, idx);
                    self.insert_marker(MarkerBinding {
                        index: idx,
                        kind: MarkerKind::Event,
                        selector: selector.clone(),
                        attr: None,
                        source: Some(span.clone()),
                    });
                    self.events.push(EventBinding {
                        index: idx,
                        event: canonical.clone(),
                        selector,
                        source: Some(span),
                    });
                    new_attributes.push(Attribute::Static {
                        name: format!("data-zx-on-{}", canonical),
                        value: idx.to_string(),
                    });
                }
                Attribute::Expression { name, value, span } => {
                    let rewritten = self.rewrite_expression(&value, RewriteContext::Attribute);
                    let idx = self.add_expression(rewritten);
                    self.insert_marker(MarkerBinding {
                        index: idx,
                        kind: MarkerKind::Attr,
                        selector: format!(r#"[data-zx-{}="{}"]"#, name, idx),
                        attr: Some(name.clone()),
                        source: Some(span),
                    });
                    new_attributes.push(Attribute::Static {
                        name: format!("data-zx-{}", name),
                        value: idx.to_string(),
                    });
                }
                Attribute::Static { .. } => {
                    new_attributes.push(attr);
                }
                Attribute::Ref { identifier, span } => {
                    let ref_index = self.ref_counter;
                    self.ref_counter += 1;
                    let selector = format!(r#"[data-zx-ref="{}"]"#, ref_index);
                    self.ref_bindings.push(RefBinding {
                        index: ref_index,
                        identifier,
                        selector,
                        source: Some(span),
                    });
                    new_attributes.push(Attribute::Static {
                        name: "data-zx-ref".to_string(),
                        value: ref_index.to_string(),
                    });
                }
            }
        }
        elem.attributes = new_attributes;

        if !component_markers.is_empty() {
            let marker_value = component_markers.join(" ");
            let mut merged = false;
            for attr in &mut elem.attributes {
                if let Attribute::Static { name, value } = attr {
                    if name == "data-zx-c" {
                        if value.trim().is_empty() {
                            *value = marker_value.clone();
                        } else {
                            *value = format!("{} {}", value.trim(), marker_value);
                        }
                        merged = true;
                        break;
                    }
                }
            }
            if !merged {
                elem.attributes.push(Attribute::Static {
                    name: "data-zx-c".to_string(),
                    value: marker_value,
                });
            }
        }

        let raw_text_container = Self::is_raw_text_container(&elem.tag);
        let raw_text_only_children = elem
            .children
            .iter()
            .all(|child| matches!(child, Node::Text(_) | Node::Expression { .. }));
        let mut new_children = Vec::new();
        let mut expression_indices = Vec::new();
        let expression_child_count = elem
            .children
            .iter()
            .filter(|child| matches!(child, Node::Expression { .. }))
            .count();
        let has_non_expression_children = elem.children.iter().any(|child| match child {
            Node::Expression { .. } => false,
            Node::Text(text) => !text.trim().is_empty(),
            _ => true,
        });
        let materialize_text_placeholders = !raw_text_container
            && (expression_child_count > 1 || (expression_child_count > 0 && has_non_expression_children));

        if raw_text_container && raw_text_only_children && expression_child_count > 0 {
            let mut combined_parts = Vec::new();
            let mut combined_source = None;

            for child in elem.children {
                match child {
                    Node::Text(text) => {
                        if !text.is_empty() {
                            combined_parts.push(Self::quote_js_string(&text));
                        }
                    }
                    Node::Expression { value, span } => {
                        let rewritten = self.rewrite_expression(&value, RewriteContext::Text);
                        combined_parts.push(format!("({})", rewritten));
                        if combined_source.is_none() {
                            combined_source = Some(span);
                        }
                    }
                    other => {
                        new_children.push(self.transform_node(other));
                    }
                }
            }

            let combined_expression = if combined_parts.is_empty() {
                "\"\"".to_string()
            } else {
                combined_parts.join(" + ")
            };

            let idx = self.add_expression(combined_expression);
            self.insert_marker(MarkerBinding {
                index: idx,
                kind: MarkerKind::Text,
                selector: format!(r#"[data-zx-e~="{}"]"#, idx),
                attr: None,
                source: combined_source,
            });
            expression_indices.push(idx);
            elem.children = new_children;

            let indices_str = expression_indices
                .iter()
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join(" ");

            elem.attributes.push(Attribute::Static {
                name: "data-zx-e".to_string(),
                value: indices_str,
            });

            if pushed_scope {
                self.scopes.pop();
            }

            return Node::Element(elem);
        }

        for child in elem.children {
            match child {
                Node::Element(child_elem) if self.script_placeholder_id(&child_elem).is_some() => {
                    continue;
                }
                Node::Expression { value, span } => {
                    let rewritten = self.rewrite_expression(&value, RewriteContext::Text);
                    let idx = self.add_expression(rewritten);
                    self.insert_marker(MarkerBinding {
                        index: idx,
                        kind: MarkerKind::Text,
                        selector: format!(r#"[data-zx-e~="{}"]"#, idx),
                        attr: None,
                        source: Some(span),
                    });
                    if materialize_text_placeholders {
                        new_children.push(Node::Element(ElementNode {
                            tag: "span".to_string(),
                            attributes: vec![
                                Attribute::Static {
                                    name: "data-zx-e".to_string(),
                                    value: idx.to_string(),
                                },
                                Attribute::Static {
                                    name: "style".to_string(),
                                    value: "display: contents".to_string(),
                                },
                            ],
                            children: vec![],
                            self_closing: false,
                        }));
                    } else {
                        expression_indices.push(idx);
                    }
                }
                other => {
                    new_children.push(self.transform_node(other));
                }
            }
        }
        elem.children = new_children;

        if !expression_indices.is_empty() {
            let indices_str = expression_indices
                .iter()
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join(" ");

            elem.attributes.push(Attribute::Static {
                name: "data-zx-e".to_string(),
                value: indices_str,
            });
        }

        if pushed_scope {
            self.scopes.pop();
        }

        Node::Element(elem)
    }

    fn script_placeholder_id(&self, elem: &ElementNode) -> Option<usize> {
        if elem.tag != SCRIPT_PLACEHOLDER_TAG {
            return None;
        }

        for attr in &elem.attributes {
            if let Attribute::Static { name, value } = attr {
                if name == SCRIPT_ID_ATTR {
                    return value.parse::<usize>().ok();
                }
            }
        }

        None
    }

    fn is_raw_text_container(tag: &str) -> bool {
        matches!(tag, "title" | "textarea" | "script" | "style")
    }

    fn quote_js_string(value: &str) -> String {
        let mut quoted = String::from("\"");
        for ch in value.chars() {
            match ch {
                '\\' => quoted.push_str("\\\\"),
                '"' => quoted.push_str("\\\""),
                '\n' => quoted.push_str("\\n"),
                '\r' => quoted.push_str("\\r"),
                '\t' => quoted.push_str("\\t"),
                _ => quoted.push(ch),
            }
        }
        quoted.push('"');
        quoted
    }

    fn rewrite_expression(&self, expr: &str, _context: RewriteContext) -> String {
        let trimmed = expr.trim();
        if trimmed.is_empty() {
            return String::new();
        }

        let mut flattened: HashMap<String, String> = HashMap::new();
        for scope in &self.scopes {
            for (key, replacement) in scope {
                flattened.insert(key.clone(), replacement.clone());
            }
        }

        if flattened.is_empty() {
            return trimmed.to_string();
        }

        let mut bindings = flattened.into_iter().collect::<Vec<_>>();
        bindings.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

        let mut rewritten = trimmed.to_string();
        for (original, replacement) in &bindings {
            let pattern = Regex::new(&format!(r"\b{}\b", regex::escape(original))).unwrap();

            rewritten = pattern
                .replace_all(&rewritten, replacement.as_str())
                .into_owned();
        }

        rewritten
    }
}
