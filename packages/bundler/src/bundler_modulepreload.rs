use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::path::{Component, Path};

use oxc_allocator::Allocator;
use oxc_ast::{ast, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;

use crate::bundler_paths::{public_asset_path, strip_base_path};

/// Parsed static import specifiers, reused across pages in one build.
pub(crate) struct ModulePreloadCache {
    imports: BTreeMap<String, Vec<String>>,
}

impl ModulePreloadCache {
    pub(crate) fn new() -> Self {
        Self {
            imports: BTreeMap::new(),
        }
    }
}

/// Public URLs to modulepreload for one HTML document.
///
/// `router_public_path` is the single executable entry in router builds.
/// `page_rel` is that page's emitted module. In router mode it is a required
/// dynamic import of the initial route; in non-router mode it is the entry
/// itself and is loaded by the module script, not a preload hint.
///
/// Only static imports are followed. Other routes and lazy `import()` targets
/// stay out of the hint list. Hint URLs are the post-hash, post-basePath
/// request URLs. `crossorigin` is omitted so the credentials mode matches the
/// module script tag this bundler emits.
pub(crate) fn modulepreload_hrefs_for_page(
    emitted_root: &Path,
    base_path: &str,
    router_public_path: Option<&str>,
    page_rel: Option<&str>,
    cache: &mut ModulePreloadCache,
) -> Result<Vec<String>, String> {
    let Some(entry_rel) = entry_asset_rel(router_public_path, page_rel, base_path) else {
        return Ok(Vec::new());
    };
    if !emitted_root.join(&entry_rel).is_file() {
        return Ok(Vec::new());
    }

    let initial_page_rel = if router_public_path.is_some() {
        page_rel
    } else {
        None
    };

    let mut hints: BTreeMap<String, String> = BTreeMap::new();
    if let Some(page_rel) = initial_page_rel {
        if page_rel != entry_rel && emitted_root.join(page_rel).is_file() {
            hints.insert(page_rel.to_string(), public_asset_path(base_path, page_rel));
        }
    }

    let mut seen = BTreeSet::new();
    let mut queue = VecDeque::new();
    queue.push_back(entry_rel.clone());
    if let Some(page_rel) = initial_page_rel {
        if page_rel != entry_rel {
            queue.push_back(page_rel.to_string());
        }
    }

    while let Some(rel) = queue.pop_front() {
        if !seen.insert(rel.clone()) {
            continue;
        }
        let specifiers = static_import_specifiers(emitted_root, &rel, cache)?;
        for specifier in specifiers {
            let Some((dep_rel, href)) =
                resolve_static_import(&rel, &specifier, base_path, emitted_root)
            else {
                continue;
            };
            if dep_rel != entry_rel {
                hints.entry(dep_rel.clone()).or_insert(href);
            }
            queue.push_back(dep_rel);
        }
    }

    let mut hrefs: Vec<String> = hints.into_values().collect();
    hrefs.sort();
    hrefs.dedup();
    Ok(hrefs)
}

fn entry_asset_rel(
    router_public_path: Option<&str>,
    page_rel: Option<&str>,
    base_path: &str,
) -> Option<String> {
    if let Some(public_path) = router_public_path {
        let rel = public_to_rel(public_path, base_path);
        if rel.is_empty() {
            return None;
        }
        return Some(rel);
    }
    page_rel
        .map(|rel| rel.trim_start_matches('/').replace('\\', "/"))
        .filter(|rel| !rel.is_empty())
}

fn public_to_rel(public_path: &str, base_path: &str) -> String {
    strip_base_path(public_path, base_path)
        .trim_start_matches('/')
        .replace('\\', "/")
}

fn static_import_specifiers(
    emitted_root: &Path,
    rel: &str,
    cache: &mut ModulePreloadCache,
) -> Result<Vec<String>, String> {
    if let Some(cached) = cache.imports.get(rel) {
        return Ok(cached.clone());
    }
    let path = emitted_root.join(rel);
    if !path.is_file() {
        cache.imports.insert(rel.to_string(), Vec::new());
        return Ok(Vec::new());
    }
    let source = fs::read_to_string(&path).map_err(|error| {
        format!(
            "failed to read emitted module '{}' while collecting modulepreload hints: {error}",
            path.display()
        )
    })?;
    let specifiers = parse_static_import_specifiers(&source, rel)?;
    cache.imports.insert(rel.to_string(), specifiers.clone());
    Ok(specifiers)
}

fn parse_static_import_specifiers(source: &str, asset_rel: &str) -> Result<Vec<String>, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::default().with_module(true);
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if !parsed.errors.is_empty() {
        let errors = parsed
            .errors
            .iter()
            .take(4)
            .map(|error| format!("{error}"))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!(
            "failed to parse emitted module '{asset_rel}' while collecting modulepreload hints: {errors}"
        ));
    }

    let mut collector = StaticImportCollector {
        specifiers: BTreeSet::new(),
    };
    collector.visit_program(&parsed.program);
    Ok(collector.specifiers.into_iter().collect())
}

struct StaticImportCollector {
    specifiers: BTreeSet<String>,
}

impl StaticImportCollector {
    fn insert(&mut self, specifier: &str) {
        let trimmed = specifier.trim();
        if !trimmed.is_empty() {
            self.specifiers.insert(trimmed.to_string());
        }
    }
}

impl<'a> Visit<'a> for StaticImportCollector {
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
    }

    fn visit_export_all_declaration(&mut self, declaration: &ast::ExportAllDeclaration<'a>) {
        if declaration.export_kind.is_value() {
            self.insert(declaration.source.value.as_str());
        }
    }
}

fn resolve_static_import(
    from_rel: &str,
    specifier: &str,
    base_path: &str,
    emitted_root: &Path,
) -> Option<(String, String)> {
    let (path, suffix) = split_specifier(specifier);
    if path.is_empty() || path.starts_with("//") {
        return None;
    }

    let (rel, href) = if path.starts_with('/') {
        let rel = public_to_rel(path, base_path);
        if !is_js_module(&rel) {
            return None;
        }
        (rel, format!("{path}{suffix}"))
    } else if path.starts_with("./") || path.starts_with("../") {
        let rel = normalize_relative(from_rel, path);
        if !is_js_module(&rel) {
            return None;
        }
        (
            rel.clone(),
            format!("{}{suffix}", public_asset_path(base_path, &rel)),
        )
    } else {
        return None;
    };

    if !emitted_root.join(&rel).is_file() {
        return None;
    }
    Some((rel, href))
}

fn split_specifier(specifier: &str) -> (&str, &str) {
    match specifier.find(['?', '#']) {
        Some(index) => (&specifier[..index], &specifier[index..]),
        None => (specifier, ""),
    }
}

fn normalize_relative(from_rel: &str, specifier_path: &str) -> String {
    let parent = Path::new(from_rel)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let joined = parent.join(specifier_path);
    let mut parts = Vec::new();
    for component in joined.components() {
        match component {
            Component::Normal(part) => {
                parts.push(part.to_string_lossy().replace('\\', "/"));
            }
            Component::ParentDir => {
                parts.pop();
            }
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }
    parts.join("/")
}

fn is_js_module(rel: &str) -> bool {
    matches!(
        Path::new(rel)
            .extension()
            .and_then(|extension| extension.to_str()),
        Some("js" | "mjs" | "cjs")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, source: &str) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, source).unwrap();
    }

    #[test]
    fn hints_follow_static_graph_for_the_initial_page_only() {
        let root = tempfile::tempdir().unwrap();
        let emitted = root.path();
        write(
            emitted,
            "assets/router.js",
            r#"import { hydrate } from "/app/assets/runtime.js";
import { zenOnMount } from "/app/assets/core.js";
const pages = {
  "/": () => import("/app/assets/home.js"),
  "/about": () => import("/app/assets/about.js")
};
void hydrate; void zenOnMount; void pages;
"#,
        );
        write(
            emitted,
            "assets/runtime.js",
            "export function hydrate() {}\n",
        );
        write(
            emitted,
            "assets/core.js",
            "import { hydrate } from \"./runtime.js\";\nexport function zenOnMount() { void hydrate; }\n",
        );
        write(
            emitted,
            "assets/home.js",
            "import { hydrate } from \"./runtime.js\";\nimport { ready } from \"./vendor.js\";\nvoid hydrate; void ready;\nexport function mount() {}\n",
        );
        write(
            emitted,
            "assets/about.js",
            "import { hydrate } from \"./runtime.js\";\nvoid hydrate;\nexport function mount() {}\n",
        );
        write(
            emitted,
            "assets/vendor.js",
            "import { marker } from \"./shared.js\";\nexport const ready = marker;\nexport function lazy() { return import(\"./lazy.js\"); }\n",
        );
        write(
            emitted,
            "assets/shared.js",
            "export const marker = \"shared\";\n",
        );
        write(emitted, "assets/lazy.js", "export default \"lazy\";\n");

        let mut cache = ModulePreloadCache::new();
        let home = modulepreload_hrefs_for_page(
            emitted,
            "/app",
            Some("/app/assets/router.js"),
            Some("assets/home.js"),
            &mut cache,
        )
        .unwrap();
        assert_eq!(
            home,
            vec![
                "/app/assets/core.js",
                "/app/assets/home.js",
                "/app/assets/runtime.js",
                "/app/assets/shared.js",
                "/app/assets/vendor.js",
            ]
        );

        let about = modulepreload_hrefs_for_page(
            emitted,
            "/app",
            Some("/app/assets/router.js"),
            Some("assets/about.js"),
            &mut cache,
        )
        .unwrap();
        assert_eq!(
            about,
            vec![
                "/app/assets/about.js",
                "/app/assets/core.js",
                "/app/assets/runtime.js",
            ]
        );
    }

    #[test]
    fn non_router_entry_is_not_preloaded_and_core_is_not_speculative() {
        let root = tempfile::tempdir().unwrap();
        let emitted = root.path();
        write(
            emitted,
            "assets/home.js",
            "import { hydrate } from \"./runtime.js\";\nvoid hydrate;\n",
        );
        write(
            emitted,
            "assets/runtime.js",
            "export function hydrate() {}\n",
        );
        write(
            emitted,
            "assets/core.js",
            "import { hydrate } from \"./runtime.js\";\nexport const core = hydrate;\n",
        );

        let hrefs = modulepreload_hrefs_for_page(
            emitted,
            "/",
            None,
            Some("assets/home.js"),
            &mut ModulePreloadCache::new(),
        )
        .unwrap();
        assert_eq!(hrefs, vec!["/assets/runtime.js"]);
    }

    #[test]
    fn missing_entry_emits_no_stale_hints() {
        let root = tempfile::tempdir().unwrap();
        let hrefs = modulepreload_hrefs_for_page(
            root.path(),
            "/app",
            Some("/app/assets/router.js"),
            Some("assets/missing.js"),
            &mut ModulePreloadCache::new(),
        )
        .unwrap();
        assert!(hrefs.is_empty());
    }
}
