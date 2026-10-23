use std::collections::BTreeSet;

use oxc_allocator::Allocator;
use oxc_ast::{ast, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;
use zenith_bundler::utils::VIRTUAL_PREFIX;

use crate::BundlerInput;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SpecifierKind {
    Local,
    Virtual,
    Vendor,
}

pub(crate) fn classify_specifier(specifier: &str) -> SpecifierKind {
    if specifier.starts_with('.')
        || is_absolute_module_path(specifier)
        || specifier.starts_with("@/")
    {
        SpecifierKind::Local
    } else if specifier.starts_with(VIRTUAL_PREFIX) || specifier.starts_with("zenith:") {
        SpecifierKind::Virtual
    } else {
        SpecifierKind::Vendor
    }
}

fn is_absolute_module_path(specifier: &str) -> bool {
    let bytes = specifier.as_bytes();
    specifier.starts_with('/')
        || specifier.starts_with("\\\\")
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'))
}

pub(crate) fn collect_vendor_specifiers(inputs: &[BundlerInput]) -> Result<Vec<String>, String> {
    let mut vendors = BTreeSet::new();

    for input in inputs {
        for (index, import) in input.ir.imports.iter().enumerate() {
            add_structured_specifier(
                &mut vendors,
                &import.spec,
                &field_context(&input.route, &format!("ir.imports[{index}].spec")),
            )?;
        }

        if input.ir.import_records.is_empty() {
            collect_legacy_import_fields(input, &mut vendors)?;
        } else {
            for (index, record) in input.ir.import_records.iter().enumerate() {
                let context = field_context(
                    &input.route,
                    &format!("ir.import_records[{index}].specifier"),
                );
                if record.specifier.trim().is_empty() {
                    collect_source_field(&record.raw_source, &context, &mut vendors)?;
                    continue;
                }

                let normalized = normalize_structured_specifier(&record.specifier, &context)?;
                if record.raw_source.trim().is_empty() {
                    add_normalized_specifier(&mut vendors, normalized, &context)?;
                    continue;
                }

                // Import records carry a structured specifier but no value/type kind.
                // Parse the declaration solely to complete that missing semantic bit.
                let runtime = collect_runtime_specifiers(&record.raw_source, &context)?;
                if runtime.is_empty() {
                    continue;
                }
                if !runtime.iter().any(|specifier| specifier == &normalized) {
                    return Err(format!(
                        "dependency analysis failed for {context}: structured specifier '{}' does not match runtime import metadata {:?}",
                        normalized, runtime
                    ));
                }
                add_normalized_specifier(&mut vendors, normalized, &context)?;
            }
        }

        for (index, module) in input.ir.modules.iter().enumerate() {
            collect_source_field(
                &module.source,
                &field_context(
                    &input.route,
                    &format!("ir.modules[{index}].source ({})", module.id),
                ),
                &mut vendors,
            )?;
        }

        for (hoist_id, script) in &input.ir.components_scripts {
            collect_source_field(
                &script.code,
                &field_context(
                    &input.route,
                    &format!("ir.components_scripts[{hoist_id}].code"),
                ),
                &mut vendors,
            )?;
        }
    }

    Ok(vendors.into_iter().collect())
}

fn collect_legacy_import_fields(
    input: &BundlerInput,
    vendors: &mut BTreeSet<String>,
) -> Result<(), String> {
    for (index, entry) in input.ir.hoisted.imports.iter().enumerate() {
        collect_legacy_import_entry(
            entry,
            &field_context(&input.route, &format!("ir.hoisted.imports[{index}]")),
            vendors,
        )?;
    }
    for (hoist_id, script) in &input.ir.components_scripts {
        for (index, entry) in script.imports.iter().enumerate() {
            collect_legacy_import_entry(
                entry,
                &field_context(
                    &input.route,
                    &format!("ir.components_scripts[{hoist_id}].imports[{index}]"),
                ),
                vendors,
            )?;
        }
    }
    Ok(())
}

fn collect_legacy_import_entry(
    entry: &str,
    context: &str,
    vendors: &mut BTreeSet<String>,
) -> Result<(), String> {
    let runtime = collect_runtime_specifiers(entry, context)?;
    if !runtime.is_empty() {
        for specifier in runtime {
            add_normalized_specifier(vendors, specifier, context)?;
        }
        return Ok(());
    }
    if looks_like_source_declaration(entry.trim()) {
        return Ok(());
    }

    let bare = normalize_legacy_bare_specifier(entry, context)?;
    add_normalized_specifier(vendors, bare, context)
}

fn collect_source_field(
    source: &str,
    context: &str,
    vendors: &mut BTreeSet<String>,
) -> Result<(), String> {
    if source.trim().is_empty() {
        return Ok(());
    }
    for specifier in collect_runtime_specifiers(source, context)? {
        add_normalized_specifier(vendors, specifier, context)?;
    }
    Ok(())
}

fn add_structured_specifier(
    vendors: &mut BTreeSet<String>,
    specifier: &str,
    context: &str,
) -> Result<(), String> {
    let normalized = normalize_structured_specifier(specifier, context)?;
    add_normalized_specifier(vendors, normalized, context)
}

fn add_normalized_specifier(
    vendors: &mut BTreeSet<String>,
    specifier: String,
    context: &str,
) -> Result<(), String> {
    if classify_specifier(&specifier) == SpecifierKind::Vendor {
        validate_vendor_specifier(&specifier, context)?;
        vendors.insert(specifier);
    }
    Ok(())
}

fn normalize_structured_specifier(specifier: &str, context: &str) -> Result<String, String> {
    let normalized = specifier.trim();
    if normalized.is_empty() {
        return Err(format!(
            "dependency analysis failed for {context}: empty structured specifier"
        ));
    }
    if looks_like_source_declaration(normalized) {
        return Err(format!(
            "dependency analysis failed for {context}: import-shaped source was supplied where a module specifier was required"
        ));
    }
    if normalized.chars().any(char::is_control) {
        return Err(format!(
            "dependency analysis failed for {context}: module specifier contains control characters"
        ));
    }
    Ok(normalized.to_string())
}

fn normalize_legacy_bare_specifier(entry: &str, context: &str) -> Result<String, String> {
    let normalized = normalize_structured_specifier(entry, context)?;
    validate_vendor_specifier(&normalized, context)?;
    Ok(normalized)
}

fn looks_like_source_declaration(value: &str) -> bool {
    value.starts_with("import ")
        || value.starts_with("import{")
        || value.starts_with("export ")
        || value.starts_with("export{")
        || value.contains(" from ")
        || value.ends_with(';')
}

fn validate_vendor_specifier(specifier: &str, context: &str) -> Result<(), String> {
    let malformed = specifier.chars().any(|ch| {
        ch.is_whitespace()
            || ch.is_control()
            || matches!(
                ch,
                '\'' | '"' | '`' | '\\' | ';' | '{' | '}' | '(' | ')' | '[' | ']'
            )
    });
    if malformed {
        return Err(format!(
            "dependency analysis failed for {context}: malformed bare vendor specifier '{specifier}'"
        ));
    }
    Ok(())
}

fn field_context(route: &str, field: &str) -> String {
    format!("route '{route}', field {field}")
}

struct RuntimeImportCollector {
    specifiers: BTreeSet<String>,
}

impl RuntimeImportCollector {
    fn insert(&mut self, specifier: &str) {
        self.specifiers.insert(specifier.trim().to_string());
    }
}

impl<'a> Visit<'a> for RuntimeImportCollector {
    fn visit_import_declaration(&mut self, declaration: &ast::ImportDeclaration<'a>) {
        let has_runtime_binding = declaration.specifiers.as_ref().map_or(true, |specifiers| {
            specifiers.is_empty()
                || specifiers.iter().any(|specifier| match specifier {
                    ast::ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                        specifier.import_kind.is_value()
                    }
                    ast::ImportDeclarationSpecifier::ImportDefaultSpecifier(_)
                    | ast::ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => true,
                })
        });
        if declaration.import_kind.is_value() && has_runtime_binding {
            self.insert(declaration.source.value.as_str());
        }
    }

    fn visit_export_named_declaration(&mut self, declaration: &ast::ExportNamedDeclaration<'a>) {
        let has_runtime_binding = declaration.specifiers.is_empty()
            || declaration
                .specifiers
                .iter()
                .any(|specifier| specifier.export_kind.is_value());
        if declaration.export_kind.is_value() && has_runtime_binding {
            if let Some(source) = &declaration.source {
                self.insert(source.value.as_str());
            }
        }
        if let Some(inner) = &declaration.declaration {
            self.visit_declaration(inner);
        }
    }

    fn visit_export_all_declaration(&mut self, declaration: &ast::ExportAllDeclaration<'a>) {
        if declaration.export_kind.is_value() {
            self.insert(declaration.source.value.as_str());
        }
    }

    fn visit_import_expression(&mut self, expression: &ast::ImportExpression<'a>) {
        if let ast::Expression::StringLiteral(literal) = &expression.source {
            self.insert(literal.value.as_str());
        }
        self.visit_expression(&expression.source);
        for argument in &expression.arguments {
            self.visit_expression(argument);
        }
    }
}

pub(crate) fn collect_runtime_specifiers(
    source: &str,
    context: &str,
) -> Result<Vec<String>, String> {
    collect_runtime_specifiers_inner(source, context, true)
}

fn collect_runtime_specifiers_inner(
    source: &str,
    context: &str,
    allow_escaped_newline_fallback: bool,
) -> Result<Vec<String>, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::default()
        .with_typescript(true)
        .with_module(true);
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if !parsed.errors.is_empty() {
        if allow_escaped_newline_fallback && source.contains("\\n") {
            let normalized = source.replace("\\n", "\n");
            return collect_runtime_specifiers_inner(&normalized, context, false);
        }
        let errors = parsed
            .errors
            .iter()
            .map(|error| format!("{error}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "dependency analysis failed for {context}: source did not parse as a TypeScript module\n{errors}"
        ));
    }

    let mut collector = RuntimeImportCollector {
        specifiers: BTreeSet::new(),
    };
    collector.visit_program(&parsed.program);
    Ok(collector.specifiers.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_runtime_import_forms_deterministically() {
        let source = r#"
            import defaultValue from "default-pkg";
            import * as ns from "namespace-pkg";
            import { value } from "named-pkg";
            import { type InlineType, value as mixedValue } from "mixed-pkg";
            import "side-effect-pkg";
            export { other } from "reexport-pkg";
            export { type ExportedType, other as mixedExport } from "mixed-export-pkg";
            export * from "export-all-pkg";
            const lazy = import("dynamic-pkg/subpath");
            import { duplicate } from "named-pkg";
        "#;

        assert_eq!(
            collect_runtime_specifiers(source, "test").unwrap(),
            vec![
                "default-pkg",
                "dynamic-pkg/subpath",
                "export-all-pkg",
                "mixed-export-pkg",
                "mixed-pkg",
                "named-pkg",
                "namespace-pkg",
                "reexport-pkg",
                "side-effect-pkg",
            ]
        );
    }

    #[test]
    fn excludes_types_non_literal_dynamic_imports_and_import_like_text() {
        let source = r#"
            import type { TypeOnly } from "types-only";
            import { type InlineTypeOnly } from "inline-types-only";
            export type { OtherType } from "other-types";
            export { type InlineExportType } from "inline-export-types";
            export type * from "all-types";
            const dynamicName = "dynamic-name";
            import(dynamicName);
            const stringValue = "import 'string-decoy'";
            const templateValue = `export * from "template-decoy"`;
            // import "comment-decoy";
        "#;

        assert!(collect_runtime_specifiers(source, "test")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn extracts_multiline_named_import_without_returning_the_declaration() {
        let source = r#"import {
  normalizeSearchText,
  rankSearchResults,
  buildSearchIndex,
} from "../../../components/search/searchEngine";"#;

        assert_eq!(
            collect_runtime_specifiers(source, "test").unwrap(),
            vec!["../../../components/search/searchEngine"]
        );
    }

    #[test]
    fn classifies_supported_specifier_families() {
        assert_eq!(classify_specifier("./local"), SpecifierKind::Local);
        assert_eq!(classify_specifier("../local"), SpecifierKind::Local);
        assert_eq!(classify_specifier("/absolute"), SpecifierKind::Local);
        assert_eq!(classify_specifier("C:/absolute"), SpecifierKind::Local);
        assert_eq!(classify_specifier("C:\\absolute"), SpecifierKind::Local);
        assert_eq!(
            classify_specifier("\\\\server\\share"),
            SpecifierKind::Local
        );
        assert_eq!(classify_specifier("@/aliased"), SpecifierKind::Local);
        assert_eq!(classify_specifier("zenith:router"), SpecifierKind::Virtual);
        assert_eq!(
            classify_specifier("\0zenith:runtime"),
            SpecifierKind::Virtual
        );
        assert_eq!(classify_specifier("package"), SpecifierKind::Vendor);
        assert_eq!(
            classify_specifier("@scope/package/subpath"),
            SpecifierKind::Vendor
        );
    }

    #[test]
    fn rejects_import_shaped_legacy_metadata() {
        let error = normalize_legacy_bare_specifier(
            "import { value } from \"../../../components/search/searchEngine\";",
            "route '/docs', field ir.hoisted.imports[0]",
        )
        .unwrap_err();
        assert!(error.contains("route '/docs', field ir.hoisted.imports[0]"));
        assert!(error.contains("import-shaped source"));
    }
}
