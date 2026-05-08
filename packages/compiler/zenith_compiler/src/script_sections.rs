use std::collections::BTreeSet;

use tree_sitter::Node;

use crate::expression_scope::parse_typescript;

pub(crate) fn collect_top_level_declarations(source: &str) -> Vec<String> {
    let Some(tree) = parse_typescript(source) else {
        return Vec::new();
    };
    let root = tree.root_node();
    let mut declarations = Vec::new();
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        if matches!(child.kind(), "lexical_declaration" | "variable_declaration") {
            declarations.push(
                source[child.start_byte()..child.end_byte()]
                    .trim()
                    .to_string(),
            );
        }
    }
    declarations
}

pub(crate) fn collect_import_ranges(root: Node<'_>) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut cursor = root.walk();
    for child in root.named_children(&mut cursor) {
        if child.kind() == "import_statement" {
            ranges.push((child.start_byte(), child.end_byte()));
        }
    }
    ranges
}

pub(crate) fn remove_ranges(source: &str, ranges: &[(usize, usize)]) -> String {
    if ranges.is_empty() {
        return source.to_string();
    }
    let mut out = String::with_capacity(source.len());
    let mut cursor = 0usize;
    for (start, end) in ranges {
        let bounded_start = (*start).min(source.len());
        let bounded_end = (*end).min(source.len());
        if cursor < bounded_start {
            out.push_str(&source[cursor..bounded_start]);
        }
        cursor = bounded_end;
    }
    if cursor < source.len() {
        out.push_str(&source[cursor..]);
    }
    out
}

pub(crate) fn dedupe_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            out.push(item);
        }
    }
    out
}
