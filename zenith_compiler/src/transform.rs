use crate::ast::{Attribute, Node};

pub fn transform(root: Node) -> (Node, Vec<String>) {
    let mut transformer = Transformer::new();
    let transformed_root = transformer.transform_node(root);
    (transformed_root, transformer.expressions)
}

struct Transformer {
    expressions: Vec<String>,
}

impl Transformer {
    fn new() -> Self {
        Self {
            expressions: Vec::new(),
        }
    }

    fn add_expression(&mut self, expr: String) -> usize {
        let idx = self.expressions.len();
        self.expressions.push(expr);
        idx
    }

    fn transform_node(&mut self, node: Node) -> Node {
        match node {
            Node::Element(elem) => {
                let mut elem = elem; // Clone handled by transform logic consuming or modifying?
                                     // We consume 'node' -> match elem.

                // 1. Transform Attributes
                let mut new_attributes = Vec::new();
                for attr in elem.attributes {
                    match attr {
                        Attribute::Event { name, handler } => {
                            let idx = self.add_expression(handler);
                            new_attributes.push(Attribute::Static {
                                name: format!("data-zx-on-{}", name),
                                value: idx.to_string(),
                            });
                        }
                        Attribute::Expression { name, value } => {
                            let idx = self.add_expression(value);
                            new_attributes.push(Attribute::Static {
                                name: format!("data-zx-{}", name), // General attribute expression
                                value: idx.to_string(),
                            });
                        }
                        Attribute::Static { .. } => {
                            new_attributes.push(attr);
                        }
                    }
                }
                elem.attributes = new_attributes;

                // 2. Transform Children
                let mut new_children = Vec::new();
                let mut expression_indices = Vec::new();

                for child in elem.children {
                    match child {
                        Node::Expression(expr) => {
                            let idx = self.add_expression(expr);
                            expression_indices.push(idx);
                            // Child is removed from tree (replaced by parent marker)
                        }
                        _ => {
                            // Recursively transform other nodes (Elements)
                            // Text nodes are pass-through
                            new_children.push(self.transform_node(child));
                        }
                    }
                }
                elem.children = new_children;

                // 3. Mark parent if it had expression children
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

                Node::Element(elem)
            }
            // Text and Expression nodes handled at parent level (Expression) or pass-through (Text)
            // But wait, Expression nodes at ROOT level?
            // "Single root node". Parser enforce element?
            // If root is Expression `{count}`, then it has no parent to tag.
            // Spec implies root is Element. "Enforce single root node".
            // Parser `parse_node` can return Expression.
            // If Root is Expression, we can't tag parent.
            // V0 Spec example: `<h1>{count}</h1>`. Root is Element.
            // We should assume root is Element.
            // If Root is Expression, we simply process it?
            // Or return it? `codegen` will fail to emit HTML for naked expression?
            // "Output Contract: export default `<html string>`"
            // If root is expression, we technically have no HTML tag. `export default ""`?
            // Let's assume input is valid Element root.
            other => other,
        }
    }
}
