use super::*;

#[derive(Debug, Clone)]
pub(crate) struct CssFragment {
    pub(crate) source_module_id: String,
    pub(crate) order: usize,
    pub(crate) content: String,
}

pub(crate) fn build_css_bundle(
    inputs: &[BundlerInput],
    project_root: &Path,
) -> Result<String, String> {
    let mut ordered_inputs: Vec<&BundlerInput> = inputs.iter().collect();
    ordered_inputs.sort_by(|a, b| {
        a.route.cmp(&b.route).then_with(|| {
            normalize_path_for_contract(Path::new(&a.file))
                .cmp(&normalize_path_for_contract(Path::new(&b.file)))
        })
    });

    let mut fragments = Vec::<CssFragment>::new();
    for input in ordered_inputs {
        let page_fragments = collect_css_fragments_for_input(input, project_root)?;
        fragments.extend(page_fragments);
    }

    fragments.sort_by(|a, b| {
        a.source_module_id
            .cmp(&b.source_module_id)
            .then_with(|| a.order.cmp(&b.order))
    });

    let merged = fragments
        .iter()
        .map(|fragment| fragment.content.as_str())
        .collect::<Vec<_>>()
        .join("\n/* ---- */\n");

    if !fragments.is_empty() && merged.trim().is_empty() {
        return Err(
            "Determinism violation: CSS inputs were discovered but merged CSS content is empty."
                .to_string(),
        );
    }

    Ok(merged)
}

fn collect_css_fragments_for_input(
    input: &BundlerInput,
    project_root: &Path,
) -> Result<Vec<CssFragment>, String> {
    let mut fragments = Vec::<CssFragment>::new();
    let mut known_css_module_ids = BTreeSet::<String>::new();
    let mut known_css_paths = BTreeSet::<String>::new();
    let mut import_order = 0usize;

    let page_key = format!(
        "{}::{}",
        input.route,
        normalize_path_for_contract(Path::new(&input.file))
    );

    let html_for_css = ensure_document_html(&input.ir.html);
    let (processed_css, _html_stripped) =
        zenith_bundler::utils::process_css(&input.ir.style_blocks, &html_for_css)
            .map_err(|e| format!("CSS processing failed for {}: {e}", input.route))?;
    if let Some(css) = processed_css {
        fragments.push(CssFragment {
            source_module_id: format!("{}::__compiler_style_blocks", page_key),
            order: 0,
            content: normalize_text_newlines(&css.content),
        });
    }

    let page_root = Path::new(&input.file)
        .parent()
        .unwrap_or_else(|| Path::new("."));
    for block in &input.ir.style_blocks {
        let module_id = normalize_module_id(&block.module_id);
        known_css_module_ids.insert(module_id.clone());
        let candidate = page_root.join(&module_id);
        if candidate.exists() {
            if let Ok(canonical) = fs::canonicalize(&candidate) {
                if canonical.starts_with(project_root) {
                    known_css_paths.insert(normalize_path_for_contract(&canonical));
                }
            }
        }
    }

    let page_module_id = detect_page_module_id(input);

    for module in &input.ir.modules {
        if is_css_specifier(&module.id) {
            continue;
        }
        collect_css_imports_from_source(
            &module.source,
            &module.id,
            project_root,
            page_root,
            &page_key,
            &mut import_order,
            &mut known_css_module_ids,
            &mut known_css_paths,
            &mut fragments,
        )?;
    }

    for import_line in &input.ir.hoisted.imports {
        collect_css_imports_from_source(
            import_line,
            &page_module_id,
            project_root,
            page_root,
            &page_key,
            &mut import_order,
            &mut known_css_module_ids,
            &mut known_css_paths,
            &mut fragments,
        )?;
    }

    for block in &input.ir.hoisted.code {
        collect_css_imports_from_source(
            block,
            &page_module_id,
            project_root,
            page_root,
            &page_key,
            &mut import_order,
            &mut known_css_module_ids,
            &mut known_css_paths,
            &mut fragments,
        )?;
    }

    for script in input.ir.components_scripts.values() {
        let owner_module_id = component_owner_module_id(&script.module_id);
        for import_line in &script.imports {
            collect_css_imports_from_source(
                import_line,
                &owner_module_id,
                project_root,
                page_root,
                &page_key,
                &mut import_order,
                &mut known_css_module_ids,
                &mut known_css_paths,
                &mut fragments,
            )?;
        }
        collect_css_imports_from_source(
            &script.code,
            &owner_module_id,
            project_root,
            page_root,
            &page_key,
            &mut import_order,
            &mut known_css_module_ids,
            &mut known_css_paths,
            &mut fragments,
        )?;
    }

    Ok(fragments)
}

fn detect_page_module_id(input: &BundlerInput) -> String {
    if let Some(module) = input
        .ir
        .modules
        .iter()
        .find(|module| module.id.ends_with(".zen"))
    {
        return normalize_module_id(&module.id);
    }

    Path::new(&input.file)
        .file_name()
        .and_then(|name| name.to_str())
        .map(normalize_module_id)
        .unwrap_or_else(|| "index.zen".to_string())
}

fn collect_css_imports_from_source(
    source: &str,
    owner_module_id: &str,
    project_root: &Path,
    page_root: &Path,
    page_key: &str,
    import_order: &mut usize,
    known_css_module_ids: &mut BTreeSet<String>,
    known_css_paths: &mut BTreeSet<String>,
    fragments: &mut Vec<CssFragment>,
) -> Result<(), String> {
    for specifier in collect_js_import_specifiers(source) {
        let normalized_specifier = strip_import_suffix(&specifier);
        if is_css_bare_import(&normalized_specifier) {
            return Err(format!(
                "CSS import contract violation: bare CSS imports are not supported.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  reason: import a local CSS entry file (for example ./styles/global.css). If you want Tailwind, put @import \"tailwindcss\" inside that local file."
            ));
        }

        if !is_css_specifier(&specifier) {
            continue;
        }

        if !is_relative_or_absolute_specifier(&normalized_specifier) {
            return Err(format!(
                "CSS import contract violation: CSS imports must be local files.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  reason: local CSS imports must start with ./, ../, or /"
            ));
        }

        let resolved_path = resolve_css_import_path(
            project_root,
            page_root,
            owner_module_id,
            &normalized_specifier,
        );
        if !resolved_path.exists() {
            return Err(format!(
                "CSS import contract violation: failed to resolve imported CSS file.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  reason: file does not exist",
                resolved_path.display()
            ));
        }

        let canonical_path = fs::canonicalize(&resolved_path).map_err(|err| {
            format!(
                "CSS import contract violation: failed to canonicalize imported CSS file.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  reason: {err}",
                resolved_path.display()
            )
        })?;
        if !canonical_path.starts_with(project_root) {
            return Err(format!(
                "CSS import contract violation: imported CSS path escapes project root.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  project_root: {}",
                canonical_path.display(),
                project_root.display()
            ));
        }

        let canonical_key = normalize_path_for_contract(&canonical_path);
        if known_css_paths.contains(&canonical_key) {
            continue;
        }

        let resolved_module_id = canonical_path
            .strip_prefix(project_root)
            .map(normalize_path_for_contract)
            .map_err(|_| {
                format!(
                    "CSS import contract violation: could not derive project-relative module id.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  project_root: {}",
                    canonical_path.display(),
                    project_root.display()
                )
            })?;
        if known_css_module_ids.contains(&resolved_module_id) {
            known_css_paths.insert(canonical_key);
            continue;
        }

        let bytes = fs::read(&canonical_path).map_err(|err| {
            format!(
                "CSS import contract violation: failed to read imported CSS file.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  reason: {err}",
                canonical_path.display()
            )
        })?;
        let content = String::from_utf8(bytes).map_err(|err| {
            format!(
                "CSS import contract violation: imported CSS must be UTF-8.\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}\n  reason: {err}",
                canonical_path.display()
            )
        })?;
        let content =
            zenith_bundler::tailwind::compile_tailwind_entry(project_root, &canonical_path, &content)
                .map_err(|err| {
                    format!(
                        "{err}\n  importing_module: {owner_module_id}\n  specifier: {specifier}\n  resolved_path: {}",
                        canonical_path.display()
                    )
                })?;

        fragments.push(CssFragment {
            source_module_id: format!("{}::{}", page_key, resolved_module_id.clone()),
            order: *import_order,
            content: normalize_text_newlines(&content),
        });
        known_css_module_ids.insert(resolved_module_id);
        known_css_paths.insert(canonical_key);
        *import_order += 1;
    }

    Ok(())
}

fn resolve_css_import_path(
    project_root: &Path,
    page_root: &Path,
    owner_module_id: &str,
    specifier: &str,
) -> PathBuf {
    if specifier.starts_with('/') {
        return project_root.join(specifier.trim_start_matches('/'));
    }
    let owner_module_path = {
        let owner = Path::new(owner_module_id);
        if owner.is_absolute() {
            owner.to_path_buf()
        } else if owner_module_id.contains('/') || owner_module_id.contains('\\') {
            project_root.join(normalize_module_id(owner_module_id))
        } else {
            page_root.join(normalize_module_id(owner_module_id))
        }
    };
    let owner_dir = owner_module_path.parent().unwrap_or(page_root);
    owner_dir.join(specifier)
}

fn is_css_bare_import(specifier: &str) -> bool {
    !is_relative_or_absolute_specifier(specifier) && is_css_package_specifier(specifier)
}

fn is_css_package_specifier(specifier: &str) -> bool {
    let normalized = specifier.strip_prefix("npm:").unwrap_or(specifier);
    normalized == "tailwindcss" || normalized.ends_with("/css") || is_css_specifier(normalized)
}
