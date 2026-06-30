use std::collections::BTreeMap;

use oxc_allocator::Allocator;
use oxc_ast::{ast, VisitMut};
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

// ---------------------------------------------------------------------------
// AST Rewriting
// ---------------------------------------------------------------------------

/// Parse JS source and rewrite import specifiers based on a replacement map.
///
/// Use `oxc` for robust AST-based transformation.
/// - Rewrites static `ImportDeclaration` sources.
/// - Rewrites dynamic `import('...')` sources if they are string literals.
/// - Preserves everything else (comments, formatting as much as codegen allows).
struct ImportRewriter<'a> {
    replacements: &'a BTreeMap<String, String>,
}

impl<'a> VisitMut<'a> for ImportRewriter<'a> {
    fn visit_import_declaration(&mut self, decl: &mut ast::ImportDeclaration<'a>) {
        let spec = decl.source.value.as_str();
        if let Some(replacement) = self.replacements.get(spec) {
            decl.source.value = oxc_span::Atom::from(replacement.as_str());
        }
    }

    fn visit_export_named_declaration(&mut self, decl: &mut ast::ExportNamedDeclaration<'a>) {
        if let Some(inner_decl) = &mut decl.declaration {
            self.visit_declaration(inner_decl);
        }
        if let Some(source_lit) = &mut decl.source {
            let spec = source_lit.value.as_str();
            if let Some(replacement) = self.replacements.get(spec) {
                source_lit.value = oxc_span::Atom::from(replacement.as_str());
            }
        }
    }

    fn visit_export_all_declaration(&mut self, decl: &mut ast::ExportAllDeclaration<'a>) {
        let spec = decl.source.value.as_str();
        if let Some(replacement) = self.replacements.get(spec) {
            decl.source.value = oxc_span::Atom::from(replacement.as_str());
        }
    }

    fn visit_import_expression(&mut self, expr: &mut ast::ImportExpression<'a>) {
        if let ast::Expression::StringLiteral(lit) = &mut expr.source {
            let spec = lit.value.as_str();
            if let Some(replacement) = self.replacements.get(spec) {
                lit.value = oxc_span::Atom::from(replacement.as_str());
            }
        }
        self.visit_expression(&mut expr.source);
        for argument in expr.arguments.iter_mut() {
            self.visit_expression(argument);
        }
    }
}

pub fn rewrite_js_imports_ast(
    source: &str,
    replacements: &BTreeMap<String, String>,
) -> Result<String, String> {
    if replacements.is_empty() {
        return Ok(source.to_string());
    }

    let allocator = Allocator::default();
    let source_type = SourceType::default().with_module(true);

    let parser = Parser::new(&allocator, source, source_type);
    let parse_result = parser.parse();

    if !parse_result.errors.is_empty() {
        let errs = parse_result
            .errors
            .iter()
            .map(|e| format!("{e}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("Failed to parse JS for rewriting:\n{}", errs));
    }

    let mut program = parse_result.program;

    let mut rewriter = ImportRewriter { replacements };
    rewriter.visit_program(&mut program);

    let codegen = Codegen::<false>::new(source, CodegenOptions::default());
    let compiled = codegen.build(&program);

    Ok(compiled.source_text)
}
