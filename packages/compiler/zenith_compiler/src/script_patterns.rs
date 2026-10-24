use std::collections::BTreeMap;

use tree_sitter::Node;

use crate::expression_scope::{node_text, ReplacementEdit};
use crate::script::{HoistedBinding, HoistedBindingKind};

#[derive(Debug, Clone)]
pub(crate) struct PatternBindingDeclaration {
    pub(crate) identifier_start: usize,
    pub(crate) original: String,
    pub(crate) kind: HoistedBindingKind,
}

pub(crate) fn collect_binding_declarations_from_pattern(
    node: Node<'_>,
    source: &str,
    kind: HoistedBindingKind,
    declared: &mut Vec<PatternBindingDeclaration>,
) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            let ident = node_text(node, source).to_string();
            if !ident.is_empty() {
                declared.push(PatternBindingDeclaration {
                    identifier_start: node.start_byte(),
                    original: ident,
                    kind,
                });
            }
        }
        "property_identifier" => {}
        "assignment_pattern" => {
            if let Some(target) = node.named_child(0) {
                collect_binding_declarations_from_pattern(target, source, kind, declared);
            }
        }
        "pair_pattern" => {
            if let Some(value) = node
                .child_by_field_name("value")
                .or_else(|| node.named_child(1))
            {
                collect_binding_declarations_from_pattern(value, source, kind, declared);
            }
        }
        "object_pattern" | "array_pattern" | "rest_pattern" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_binding_declarations_from_pattern(child, source, kind, declared);
            }
        }
        _ => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_binding_declarations_from_pattern(child, source, kind, declared);
            }
        }
    }
}

pub(crate) fn classify_binding_kind(declarator: Node<'_>, source: &str) -> HoistedBindingKind {
    let Some(initializer) = declarator
        .child_by_field_name("value")
        .or_else(|| declarator.named_child(1))
    else {
        return HoistedBindingKind::Const;
    };
    let text = node_text(initializer, source).trim_start();
    if text.starts_with("signal(") {
        HoistedBindingKind::Signal
    } else if text.starts_with("state(") {
        HoistedBindingKind::State
    } else if text.starts_with("ref(") || text.starts_with("ref<") {
        HoistedBindingKind::Ref
    } else {
        HoistedBindingKind::Const
    }
}

pub(crate) fn collect_binding_pattern_renames(
    node: Node<'_>,
    source: &str,
    bindings_by_name: &BTreeMap<String, HoistedBinding>,
    object_shorthand: bool,
    edits: &mut Vec<ReplacementEdit>,
) {
    match node.kind() {
        "identifier" | "shorthand_property_identifier_pattern" => {
            collect_binding_identifier_rename(
                node,
                source,
                bindings_by_name,
                object_shorthand,
                edits,
            );
        }
        "assignment_pattern" => {
            if let Some(target) = node.named_child(0) {
                collect_binding_pattern_renames(
                    target,
                    source,
                    bindings_by_name,
                    object_shorthand,
                    edits,
                );
            }
        }
        "pair_pattern" => {
            if let Some(value) = node
                .child_by_field_name("value")
                .or_else(|| node.named_child(1))
            {
                collect_binding_pattern_renames(value, source, bindings_by_name, false, edits);
            }
        }
        "object_pattern" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_binding_pattern_renames(child, source, bindings_by_name, true, edits);
            }
        }
        "array_pattern" | "rest_pattern" => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_binding_pattern_renames(child, source, bindings_by_name, false, edits);
            }
        }
        _ => {
            let mut cursor = node.walk();
            for child in node.named_children(&mut cursor) {
                collect_binding_pattern_renames(
                    child,
                    source,
                    bindings_by_name,
                    object_shorthand,
                    edits,
                );
            }
        }
    }
}

fn collect_binding_identifier_rename(
    node: Node<'_>,
    source: &str,
    bindings_by_name: &BTreeMap<String, HoistedBinding>,
    object_shorthand: bool,
    edits: &mut Vec<ReplacementEdit>,
) {
    let ident = node_text(node, source);
    let Some(binding) = bindings_by_name.get(ident) else {
        return;
    };
    let text = if object_shorthand {
        format!("{ident}: {}", binding.renamed)
    } else {
        binding.renamed.clone()
    };
    edits.push(ReplacementEdit {
        start: node.start_byte(),
        end: node.end_byte(),
        text,
    });
}
