use tree_sitter::{Node, Tree};

use crate::expression_scope::parse_typescript;

pub(crate) fn parse_valid_typescript(source: &str) -> Result<Tree, String> {
    let tree =
        parse_typescript(source).ok_or_else(|| "failed to parse TypeScript source".to_string())?;
    if tree.root_node().has_error() {
        return Err("invalid TypeScript syntax".to_string());
    }
    Ok(tree)
}

pub(crate) fn validate_expression_syntax(expression: &str) -> Result<(), String> {
    let wrapped = wrap_expression(expression).replace('\0', "\\0");
    let tree = parse_valid_typescript(&wrapped)?;
    let Some(node) = find_expression_node(&tree) else {
        return Err("invalid markup expression syntax".to_string());
    };
    if node.has_error() || node.is_missing() {
        return Err("invalid markup expression syntax".to_string());
    }
    Ok(())
}

pub(crate) fn is_direct_call_handler_expression(expression: &str) -> bool {
    let wrapped = wrap_expression(expression);
    let Ok(tree) = parse_valid_typescript(&wrapped) else {
        return false;
    };
    let Some(node) = find_expression_node(&tree) else {
        return false;
    };
    let root = strip_parentheses(node);
    if is_inline_function(root) {
        return false;
    }
    contains_call_expression(root)
}

fn wrap_expression(expression: &str) -> String {
    format!("const __zenith_expr__ = ({});", expression.trim())
}

fn find_expression_node(tree: &Tree) -> Option<Node<'_>> {
    let root = tree.root_node();
    let declaration = root.named_child(0)?;
    let declarator = declaration.named_child(0)?;
    let initializer = declarator.named_child(1)?;
    Some(strip_parentheses(initializer))
}

fn strip_parentheses(mut node: Node<'_>) -> Node<'_> {
    while node.kind() == "parenthesized_expression" {
        let Some(inner) = node.named_child(0) else {
            break;
        };
        node = inner;
    }
    node
}

fn is_inline_function(node: Node<'_>) -> bool {
    matches!(node.kind(), "arrow_function" | "function_expression")
}

fn contains_call_expression(node: Node<'_>) -> bool {
    if is_inline_function(node) {
        return false;
    }
    if node.kind() == "call_expression" || node.kind() == "new_expression" {
        return true;
    }
    let mut cursor = node.walk();
    let found = node
        .named_children(&mut cursor)
        .any(contains_call_expression);
    found
}
