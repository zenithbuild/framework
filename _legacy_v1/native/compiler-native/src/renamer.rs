use oxc_ast_visit::VisitMut;
use std::collections::HashMap;

pub struct RenamerVisitor {
    pub renames: HashMap<String, String>,
    pub inlines: HashMap<String, String>,
    pub replacements: Vec<(u32, u32, String)>,
}

impl RenamerVisitor {
    pub fn new(renames: HashMap<String, String>, inlines: HashMap<String, String>) -> Self {
        RenamerVisitor {
            renames,
            inlines,
            replacements: Vec::new(),
        }
    }
}

impl<'a> VisitMut<'a> for RenamerVisitor {
    fn visit_identifier_reference(&mut self, ident: &mut oxc_ast::ast::IdentifierReference<'a>) {
        if let Some(new_name) = self.renames.get(&ident.name.to_string()) {
            self.replacements
                .push((ident.span.start, ident.span.end, new_name.clone()));
        } else if let Some(value) = self.inlines.get(&ident.name.to_string()) {
            self.replacements
                .push((ident.span.start, ident.span.end, value.clone()));
        }
    }

    fn visit_binding_identifier(&mut self, ident: &mut oxc_ast::ast::BindingIdentifier<'a>) {
        if let Some(new_name) = self.renames.get(&ident.name.to_string()) {
            self.replacements
                .push((ident.span.start, ident.span.end, new_name.clone()));
        }
    }

    fn visit_variable_declaration(&mut self, decl: &mut oxc_ast::ast::VariableDeclaration<'a>) {
        if decl.kind == oxc_ast::ast::VariableDeclarationKind::Var {
            // Re-map 'var' placeholder back to its semantic intent 'state'
            // In preprocess_zenith_script, 'state ' was replaced with 'var '
            // oxc span for VariableDeclaration starts at the keyword.
            self.replacements
                .push((decl.span.start, decl.span.start + 3, "state".to_string()));
        }
        oxc_ast_visit::walk_mut::walk_variable_declaration(self, decl);
    }

    // IMPORTANT: Re-added method that was previously lost/corrupted in component.rs
    fn visit_arrow_function_expression(
        &mut self,
        func: &mut oxc_ast::ast::ArrowFunctionExpression<'a>,
    ) {
        oxc_ast_visit::walk_mut::walk_arrow_function_expression(self, func);
    }

    fn visit_import_specifier(&mut self, specifier: &mut oxc_ast::ast::ImportSpecifier<'a>) {
        let local_name = specifier.local.name.to_string();
        if let Some(new_name) = self.renames.get(&local_name) {
            let imported_name = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(id) => id.name.to_string(),
                oxc_ast::ast::ModuleExportName::StringLiteral(s) => s.value.to_string(),
                _ => String::new(),
            };

            if imported_name == local_name {
                // Shorthand import { Foo } -> rename to { Foo as Foo_instX }
                self.replacements.push((
                    specifier.span.start,
                    specifier.span.end,
                    format!("{} as {}", imported_name, new_name),
                ));
                return; // Replaced whole specifier span
            }
        }
        oxc_ast_visit::walk_mut::walk_import_specifier(self, specifier);
    }

    fn visit_static_member_expression(
        &mut self,
        expr: &mut oxc_ast::ast::StaticMemberExpression<'a>,
    ) {
        // Handle props.x replacement
        if let oxc_ast::ast::Expression::Identifier(ident) = &expr.object {
            if ident.name == "props" {
                if let Some(new_val) = self.inlines.get(&expr.property.name.to_string()) {
                    self.replacements
                        .push((expr.span.start, expr.span.end, new_val.clone()));
                    return; // Don't visit children, we replaced the whole node
                }
            }
        }

        oxc_ast_visit::walk_mut::walk_static_member_expression(self, expr);
    }

    fn visit_ts_type_name(&mut self, name: &mut oxc_ast::ast::TSTypeName<'a>) {
        if let oxc_ast::ast::TSTypeName::IdentifierReference(ident) = name {
            if let Some(new_name) = self.renames.get(&ident.name.to_string()) {
                self.replacements
                    .push((ident.span.start, ident.span.end, new_name.clone()));
            }
        }
        oxc_ast_visit::walk_mut::walk_ts_type_name(self, name);
    }

    fn visit_ts_module_declaration(&mut self, decl: &mut oxc_ast::ast::TSModuleDeclaration<'a>) {
        if let oxc_ast::ast::TSModuleDeclarationName::Identifier(id) = &mut decl.id {
            if let Some(new_name) = self.renames.get(&id.name.to_string()) {
                self.replacements
                    .push((id.span.start, id.span.end, new_name.clone()));
            }
        }
        oxc_ast_visit::walk_mut::walk_ts_module_declaration(self, decl);
    }

    fn visit_ts_interface_declaration(
        &mut self,
        decl: &mut oxc_ast::ast::TSInterfaceDeclaration<'a>,
    ) {
        if let Some(new_name) = self.renames.get(&decl.id.name.to_string()) {
            self.replacements
                .push((decl.id.span.start, decl.id.span.end, new_name.clone()));
        }
        oxc_ast_visit::walk_mut::walk_ts_interface_declaration(self, decl);
    }

    fn visit_ts_type_alias_declaration(
        &mut self,
        decl: &mut oxc_ast::ast::TSTypeAliasDeclaration<'a>,
    ) {
        if let Some(new_name) = self.renames.get(&decl.id.name.to_string()) {
            self.replacements
                .push((decl.id.span.start, decl.id.span.end, new_name.clone()));
        }
        oxc_ast_visit::walk_mut::walk_ts_type_alias_declaration(self, decl);
    }

    fn visit_ts_enum_declaration(&mut self, decl: &mut oxc_ast::ast::TSEnumDeclaration<'a>) {
        if let Some(new_name) = self.renames.get(&decl.id.name.to_string()) {
            self.replacements
                .push((decl.id.span.start, decl.id.span.end, new_name.clone()));
        }
        oxc_ast_visit::walk_mut::walk_ts_enum_declaration(self, decl);
    }
}
