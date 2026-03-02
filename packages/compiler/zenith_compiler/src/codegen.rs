use crate::ast::{Attribute, Node};

pub fn generate(root: Node, expressions: Vec<String>) -> String {
    let expr_list = expressions
        .iter()
        .map(|e| format!("\"{}\"", e.replace("\"", "\\\""))) // Simple JSON-like escaping
        .collect::<Vec<_>>()
        .join(", ");

    let html = generate_node(&root);

    format!(
        r#"export const __zenith_expr = [{}]

export function setup() {{
  return {{}}
}}

export default `{}`"#,
        expr_list, html
    )
}

/// Generate only the HTML string from a transformed AST node.
/// Used by `compile_structured` for the sealed bundler API.
pub fn generate_html(node: &Node) -> String {
    generate_node(node)
}

fn generate_node(node: &Node) -> String {
    match node {
        Node::Element(elem) => {
            let attrs = elem
                .attributes
                .iter()
                .map(|attr| match attr {
                    Attribute::Static { name, value } => format!("{}=\"{}\"", name, value),
                    _ => panic!("Codegen encountered non-static attribute! Transform step failed."),
                })
                .collect::<Vec<_>>()
                .join(" ");

            let attrs_str = if attrs.is_empty() {
                String::new()
            } else {
                format!(" {}", attrs)
            };

            if elem.self_closing {
                format!("<{}{} />", elem.tag, attrs_str)
            } else {
                let children = elem
                    .children
                    .iter()
                    .map(|child| generate_node(child))
                    .collect::<Vec<_>>()
                    .join("");

                format!("<{}{}>{}</{}>", elem.tag, attrs_str, children, elem.tag)
            }
        }
        Node::Text(text) => text.clone(),
        Node::Expression(_) => {
            panic!("Codegen encountered Expression node! Transform step failed.")
        }
    }
}
