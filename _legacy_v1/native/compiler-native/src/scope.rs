use crate::validate::CompilerError;
use oxc_allocator::Allocator;
use oxc_ast::ast::Expression;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::scope::ScopeFlags;
use std::collections::HashSet;

lazy_static::lazy_static! {
    pub static ref ZENITH_GLOBALS: HashSet<&'static str> = {
        let mut s = HashSet::new();
        // Zenith Reactivity primitives
        s.insert("signal");
        s.insert("computed");
        s.insert("effect");
        s.insert("onMount");
        s.insert("onCleanup");
        s.insert("ref");

        // Standard JS Globals
        s.insert("Math");
        s.insert("console");
        s.insert("JSON");
        s.insert("Date");
        s.insert("String");
        s.insert("Number");
        s.insert("Boolean");
        s.insert("Array");
        s.insert("Object");
        s.insert("Promise");
        s.insert("Map");
        s.insert("Set");
        s.insert("Error");
        s.insert("undefined");
        s.insert("NaN");
        s.insert("Infinity");
        s.insert("parseInt");
        s.insert("parseFloat");
        s.insert("window"); // Browser environment
        s.insert("document");
        s
    };
}

pub struct ScopeValidator {
    pub allowed_locals: HashSet<String>,
    pub file_path: String,
}

impl ScopeValidator {
    pub fn new(file_path: String) -> Self {
        Self {
            allowed_locals: HashSet::new(),
            file_path,
        }
    }

    pub fn add_locals(&mut self, locals: Vec<String>) {
        for local in locals {
            self.allowed_locals.insert(local);
        }
    }

    pub fn verify_scope_string(
        &self,
        code: &str,
        extra_locals: &[String],
        line_offset: u32,
    ) -> Option<CompilerError> {
        let allocator = Allocator::default();
        let source_type = SourceType::default()
            .with_typescript(true)
            .with_module(true)
            .with_jsx(true);

        // We wrap in parentheses to ensure it parses as expression if it's an object literal etc.
        // But Zenith expressions are usually just expressions.
        let ret = Parser::new(&allocator, code, source_type).parse_expression();

        match ret {
            Ok(expr) => self.verify_scope(&expr, extra_locals, line_offset),
            Err(error) => {
                let message = format!("Invalid expression syntax: {:?}", error);
                Some(CompilerError::new(
                    "Z-ERR-SYNTAX-001",
                    &message,
                    &self.file_path,
                    line_offset,
                    1,
                ))
            }
        }
    }

    pub fn verify_scope(
        &self,
        expr: &Expression,
        extra_locals: &[String],
        line_offset: u32,
    ) -> Option<CompilerError> {
        // Collect ALL bindings and ALL references within this expression
        let mut collector = ScopeAwareCollector {
            references: vec![],
            bindings: HashSet::new(),
        };
        collector.visit_expression(expr);

        for (ident, _span) in collector.references {
            if !self.allowed_locals.contains(&ident)
                && !ZENITH_GLOBALS.contains(ident.as_str())
                && !extra_locals.contains(&ident)
                && !collector.bindings.contains(&ident)
            {
                return Some(CompilerError::new(
                    "Z-ERR-SCOPE-001",
                    &format!("Unknown identifier '{}'.", ident),
                    &self.file_path,
                    line_offset,
                    1,
                ));
            }
        }

        None
    }
}

struct ScopeAwareCollector {
    references: Vec<(String, oxc_span::Span)>,
    bindings: HashSet<String>,
}

impl<'a> Visit<'a> for ScopeAwareCollector {
    fn visit_identifier_reference(&mut self, ident: &oxc_ast::ast::IdentifierReference) {
        self.references.push((ident.name.to_string(), ident.span));
    }

    fn visit_binding_identifier(&mut self, ident: &oxc_ast::ast::BindingIdentifier) {
        self.bindings.insert(ident.name.to_string());
    }
}

pub struct BindingCollector<'a> {
    pub symbols: &'a mut HashSet<String>,
}

impl<'a, 'b> Visit<'b> for BindingCollector<'a> {
    fn visit_binding_identifier(&mut self, ident: &oxc_ast::ast::BindingIdentifier<'b>) {
        self.symbols.insert(ident.name.to_string());
    }

    fn visit_variable_declaration(&mut self, decl: &oxc_ast::ast::VariableDeclaration<'b>) {
        oxc_ast_visit::walk::walk_variable_declaration(self, decl);
    }

    fn visit_function(&mut self, func: &oxc_ast::ast::Function<'b>, _flags: ScopeFlags) {
        if let Some(id) = &func.id {
            self.symbols.insert(id.name.to_string());
        }
        oxc_ast_visit::walk::walk_function(self, func, _flags);
    }

    fn visit_arrow_function_expression(
        &mut self,
        func: &oxc_ast::ast::ArrowFunctionExpression<'b>,
    ) {
        oxc_ast_visit::walk::walk_arrow_function_expression(self, func);
    }

    fn visit_class(&mut self, class: &oxc_ast::ast::Class<'b>) {
        if let Some(id) = &class.id {
            self.symbols.insert(id.name.to_string());
        }
        oxc_ast_visit::walk::walk_class(self, class);
    }

    fn visit_ts_interface_declaration(&mut self, decl: &oxc_ast::ast::TSInterfaceDeclaration<'b>) {
        self.symbols.insert(decl.id.name.to_string());
        oxc_ast_visit::walk::walk_ts_interface_declaration(self, decl);
    }

    fn visit_ts_type_alias_declaration(&mut self, decl: &oxc_ast::ast::TSTypeAliasDeclaration<'b>) {
        self.symbols.insert(decl.id.name.to_string());
        oxc_ast_visit::walk::walk_ts_type_alias_declaration(self, decl);
    }

    fn visit_ts_enum_declaration(&mut self, decl: &oxc_ast::ast::TSEnumDeclaration<'b>) {
        self.symbols.insert(decl.id.name.to_string());
        oxc_ast_visit::walk::walk_ts_enum_declaration(self, decl);
    }

    fn visit_ts_module_declaration(&mut self, decl: &oxc_ast::ast::TSModuleDeclaration<'b>) {
        if let oxc_ast::ast::TSModuleDeclarationName::Identifier(id) = &decl.id {
            self.symbols.insert(id.name.to_string());
        }
        oxc_ast_visit::walk::walk_ts_module_declaration(self, decl);
    }

    fn visit_catch_clause(&mut self, clause: &oxc_ast::ast::CatchClause<'b>) {
        oxc_ast_visit::walk::walk_catch_clause(self, clause);
    }
}

// The old `extract_identifiers_from_expr` function has been removed.
