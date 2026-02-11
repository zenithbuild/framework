// ast.rs
// Defines the structural representation of Zenith templates.
// No behavior. No evaluation logic.

#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    Element(ElementNode),
    Text(String),
    Expression(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ElementNode {
    pub tag: String,
    pub attributes: Vec<Attribute>,
    pub children: Vec<Node>,
    pub self_closing: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Attribute {
    Static { name: String, value: String },
    Expression { name: String, value: String },
    Event { name: String, handler: String },
}
