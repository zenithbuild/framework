use crate::codegen::generate;
use crate::parser::Parser;
use crate::transform::transform;

/// The sealed public API for the bundler.
/// This is the ONLY interface the bundler sees.
/// The bundler must NOT reach into AST, modify nodes, or influence indexing.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CompilerOutput {
    /// The compiled HTML template string.
    pub html: String,
    /// The expression table — ordered, deterministic, left-to-right depth-first.
    pub expressions: Vec<String>,
}

/// Compile a template into the structured bundler output.
/// This is the primary entry point for programmatic use.
pub fn compile_structured(input: &str) -> CompilerOutput {
    let mut parser = Parser::new(input);
    let ast = parser.parse();
    let (transformed_ast, expressions) = transform(ast);
    let html = crate::codegen::generate_html(&transformed_ast);
    CompilerOutput { html, expressions }
}

/// Compile a template into a full TypeScript module string.
/// Used by the CLI and for human-readable output.
pub fn compile(input: &str) -> String {
    let mut parser = Parser::new(input);
    let ast = parser.parse();
    let (ast, expressions) = transform(ast);
    generate(ast, expressions)
}
