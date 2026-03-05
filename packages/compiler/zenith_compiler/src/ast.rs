// ast.rs
// Defines the structural representation of Zenith templates.
// No behavior. No evaluation logic.

#[derive(Debug, Clone, PartialEq)]
pub enum Node {
    Element(ElementNode),
    Text(String),
    Expression {
        value: String,
        span: SourceSpan,
    },
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ComponentScript {
    pub imports: Vec<String>,
    pub declarations: Vec<String>,
    pub functions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SourceLocation {
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SourceSpan {
    pub start: SourceLocation,
    pub end: SourceLocation,
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
    Expression {
        name: String,
        value: String,
        span: SourceSpan,
    },
    Event {
        name: String,
        handler: String,
        span: SourceSpan,
    },
    Ref {
        identifier: String,
        span: SourceSpan,
    },
}
