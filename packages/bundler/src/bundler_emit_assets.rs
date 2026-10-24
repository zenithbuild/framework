use super::*;

use crate::bundler_emit_assets_helpers::{
    emit_helper_module_recursive, helper_asset_specifier_from_rel,
};
pub(crate) use crate::bundler_emit_assets_imports::{
    collect_dynamic_import_expressions, collect_js_import_specifiers, component_owner_module_id,
    extract_static_import_specifier, is_browser_js_module, is_css_specifier,
    is_relative_or_absolute_specifier, normalize_module_id, rewrite_import_specifier_literal,
    strip_css_import_statements, strip_zen_import_statements,
};
use crate::bundler_emit_assets_imports::{
    resolve_module_id_for_spec, rewrite_js_import_specifiers,
};

pub(crate) fn ensure_runtime_asset(
    out_dir: &PathBuf,
    runtime_js: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    let runtime_js = maybe_minify_runtime_for_output(runtime_js, output_mode)?;
    if has_runtime_zen_reference(&runtime_js) {
        return Err(
            "Runtime graph purity violation: runtime bundle contains a .zen module specifier"
                .into(),
        );
    }
    if runtime_js.contains("zenith:") {
        return Err(
            "Runtime graph purity violation: runtime bundle contains a zenith:* specifier".into(),
        );
    }
    if runtime_js.contains("fetch(") {
        return Err("Runtime graph purity violation: runtime bundle contains 'fetch('".into());
    }

    let runtime_hash = stable_hash_8(&runtime_js);
    let runtime_rel = output_mode.runtime_rel(&runtime_hash);
    let runtime_path = out_dir.join(&runtime_rel);

    write_file_for_mode(&runtime_path, &runtime_js, output_mode).map_err(|e| {
        format!(
            "failed to write runtime asset '{}': {e}",
            runtime_path.display()
        )
    })?;

    Ok(runtime_rel)
}

pub(crate) fn ensure_core_asset(
    out_dir: &PathBuf,
    runtime_rel: &str,
    output_mode: OutputMode,
) -> Result<(String, String), String> {
    let runtime_spec = runtime_import_specifier(runtime_rel)?;
    let core_js = generate_core_module_js(&runtime_spec);
    let core_hash = stable_hash_8(&core_js);
    let core_rel = output_mode.core_rel(&core_hash);
    let core_path = out_dir.join(&core_rel);

    write_file_for_mode(&core_path, &core_js, output_mode)
        .map_err(|e| format!("failed to write core asset '{}': {e}", core_path.display()))?;

    Ok((core_rel, core_hash))
}

pub(crate) fn emit_page_helper_assets(
    out_dir: &PathBuf,
    ir: &CompilerIr,
    module_registry: &BTreeMap<String, CompilerModule>,
    emitted_helper_assets: &mut BTreeMap<String, String>,
    core_import_spec: &str,
    base_path: &str,
    output_mode: OutputMode,
) -> Result<BTreeMap<String, String>, String> {
    let mut rewrite_map = BTreeMap::new();

    if !ir.import_records.is_empty() {
        for record in &ir.import_records {
            let import_line_trimmed = record.raw_source.trim();
            if import_line_trimmed.is_empty() {
                continue;
            }
            let spec = if !record.specifier.is_empty() {
                record.specifier.clone()
            } else {
                match extract_static_import_specifier(import_line_trimmed) {
                    Some(s) => s,
                    None => continue,
                }
            };
            if spec.ends_with(".zen")
                || spec == "zenith:core"
                || spec.starts_with("zenith:")
                || is_css_specifier(&spec)
            {
                continue;
            }
            if !is_relative_or_absolute_specifier(&spec) || spec.starts_with('/') {
                continue;
            }

            let owner_module_id = if !record.importer_module_id.is_empty() {
                record.importer_module_id.clone()
            } else {
                return Err(format!(
                    "ERROR: Emission failed - cannot resolve relative helper import because importer provenance was lost.\n  unresolved_specifier: {}\n  referenced_from_asset: <page>",
                    spec
                ));
            };

            let target_module_id = if let Some(resolved) = &record.resolved_module_id {
                resolved.clone()
            } else {
                resolve_module_id_for_spec(module_registry, &owner_module_id, &spec)
                    .ok_or_else(|| {
                        format!(
                            "ERROR: Emission failed - unresolved page import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <page>\n  importer: {owner_module_id}\n  dependency_chain:\n    {owner_module_id} -> {spec}"
                        )
                    })?
            };

            let helper_rel = emit_helper_module_recursive(
                out_dir,
                module_registry,
                &target_module_id,
                emitted_helper_assets,
                &mut vec![owner_module_id.clone()],
                core_import_spec,
                base_path,
                output_mode,
            )?;

            let helper_spec = helper_asset_specifier_from_rel(&helper_rel)?;
            let page_module_id = ir.page_module_id.as_deref().unwrap_or("");
            let is_page_importer =
                page_module_id.is_empty() || record.importer_module_id == page_module_id || {
                    let rec_base = record
                        .importer_module_id
                        .rsplit_once('.')
                        .map(|(b, _)| b)
                        .unwrap_or(&record.importer_module_id);
                    let page_base = page_module_id
                        .rsplit_once('.')
                        .map(|(b, _)| b)
                        .unwrap_or(page_module_id);
                    rec_base == page_base
                };
            if is_page_importer {
                rewrite_map.insert(spec.clone(), helper_spec.clone());
                if let Some(hoisted_spec) = extract_static_import_specifier(import_line_trimmed) {
                    rewrite_map.insert(hoisted_spec, helper_spec.clone());
                }
            }
            if record.occurrence_index < ir.hoisted.imports.len() {
                if let Some(hoisted_line_spec) =
                    extract_static_import_specifier(&ir.hoisted.imports[record.occurrence_index])
                {
                    rewrite_map.insert(hoisted_line_spec, helper_spec);
                }
            }
        }
    } else {
        let owner_module_id = ir
            .page_module_id
            .clone()
            .unwrap_or_else(|| "pages/index.js".to_string());
        for import_line in &ir.hoisted.imports {
            let import_line_trimmed = import_line.trim();
            if import_line_trimmed.is_empty() {
                continue;
            }
            let Some(spec) = extract_static_import_specifier(import_line_trimmed) else {
                continue;
            };
            if spec.ends_with(".zen")
                || spec == "zenith:core"
                || spec.starts_with("zenith:")
                || is_css_specifier(&spec)
            {
                continue;
            }
            if !is_relative_or_absolute_specifier(&spec) || spec.starts_with('/') {
                continue;
            }

            if ir.page_module_id.is_none() {
                return Err(format!(
                    "ERROR: Emission failed - cannot resolve relative helper import because importer provenance was lost.\n  unresolved_specifier: {}\n  referenced_from_asset: <page>",
                    spec
                ));
            }

            let target_module_id =
                resolve_module_id_for_spec(module_registry, &owner_module_id, &spec)
                    .ok_or_else(|| {
                        format!(
                            "ERROR: Emission failed - unresolved page import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <page>\n  importer: {owner_module_id}\n  dependency_chain:\n    {owner_module_id} -> {spec}"
                        )
                    })?;

            let helper_rel = emit_helper_module_recursive(
                out_dir,
                module_registry,
                &target_module_id,
                emitted_helper_assets,
                &mut vec![owner_module_id.clone()],
                core_import_spec,
                base_path,
                output_mode,
            )?;

            let helper_spec = helper_asset_specifier_from_rel(&helper_rel)?;
            rewrite_map.insert(spec.clone(), helper_spec);
        }
    }

    Ok(rewrite_map)
}

pub(crate) fn emit_component_assets(
    out_dir: &PathBuf,
    components: &BTreeMap<String, CompilerComponentScript>,
    runtime_import_spec: &str,
    module_registry: &BTreeMap<String, CompilerModule>,
    core_import_spec: &str,
    base_path: &str,
    output_mode: OutputMode,
) -> Result<BTreeMap<String, String>, String> {
    let mut out = BTreeMap::new();
    let mut emitted_helper_assets = BTreeMap::<String, String>::new();

    for (hoist_id, component) in components {
        let owner_module_id = component_owner_module_id(&component.module_id);
        let mut module_source = String::new();
        for import_line in &component.imports {
            let import_line_trimmed = import_line.trim();
            if import_line_trimmed.is_empty() {
                continue;
            }

            let Some(spec) = extract_static_import_specifier(import_line_trimmed) else {
                return Err(format!(
                    "Emission error: unsupported component import declaration '{}' in component module '{}'",
                    import_line_trimmed, component.module_id
                ));
            };

            if spec.ends_with(".zen") {
                continue;
            }

            if spec == "zenith:core" {
                let rewritten =
                    rewrite_import_specifier_literal(import_line_trimmed, &spec, core_import_spec)?;
                module_source.push_str(&rewritten);
                module_source.push('\n');
                continue;
            }
            if spec.starts_with("zenith:") {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: only zenith:core is supported at runtime; all other zenith:* imports are prohibited",
                    component.module_id, component.module_id
                ));
            }
            if is_css_specifier(&spec) {
                continue;
            }

            if !is_relative_or_absolute_specifier(&spec) {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                    component.module_id, component.module_id
                ));
            }
            if spec.starts_with('/') {
                module_source.push_str(import_line_trimmed);
                module_source.push('\n');
                continue;
            }

            let target_module_id =
                resolve_module_id_for_spec(module_registry, &owner_module_id, &spec)
                    .ok_or_else(|| {
                        format!(
                            "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                            component.module_id, component.module_id
                        )
                    })?;

            let helper_rel = emit_helper_module_recursive(
                out_dir,
                module_registry,
                &target_module_id,
                &mut emitted_helper_assets,
                &mut vec![component.module_id.clone()],
                core_import_spec,
                base_path,
                output_mode,
            )?;

            let helper_spec = helper_asset_specifier_from_rel(&helper_rel)?;
            let rewritten =
                rewrite_import_specifier_literal(import_line_trimmed, &spec, &helper_spec)?;

            module_source.push_str(&rewritten);
            module_source.push('\n');
        }
        let mut rewritten_component_code =
            strip_zen_import_statements(&strip_css_import_statements(&component.code));
        for spec in collect_js_import_specifiers(&rewritten_component_code) {
            if spec.ends_with(".zen") {
                continue;
            }
            if spec == "zenith:core" {
                rewritten_component_code = rewrite_js_import_specifiers(
                    &rewritten_component_code,
                    &spec,
                    core_import_spec,
                )?;
                continue;
            }
            if spec.starts_with("zenith:") {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: zenith:* imports are only allowed as compile-time top-level component imports",
                    component.module_id, component.module_id
                ));
            }
            if !is_relative_or_absolute_specifier(&spec) {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                    component.module_id, component.module_id
                ));
            }
            if spec.starts_with('/') {
                continue;
            }
            let target_module_id =
                resolve_module_id_for_spec(module_registry, &owner_module_id, &spec).ok_or_else(
                    || {
                        format!(
                            "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: <component:{hoist_id}>\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                            component.module_id, component.module_id
                        )
                    },
                )?;
            let helper_rel = emit_helper_module_recursive(
                out_dir,
                module_registry,
                &target_module_id,
                &mut emitted_helper_assets,
                &mut vec![component.module_id.clone()],
                core_import_spec,
                base_path,
                output_mode,
            )?;
            let helper_spec = helper_asset_specifier_from_rel(&helper_rel)?;
            rewritten_component_code =
                rewrite_js_import_specifiers(&rewritten_component_code, &spec, &helper_spec)?;
        }

        rewritten_component_code = inject_runtime_hook_aliases(&rewritten_component_code);
        rewritten_component_code = guard_component_bindings(&rewritten_component_code)?;
        module_source.push_str(&format!(
            "import {{ signal, state, ref, zeneffect, zenEffect, zenMount, zenWindow, zenDocument, zenOn, zenResize, collectRefs }} from '{}';\n",
            runtime_import_spec
        ));
        module_source.push_str(&format!(
            "const __zenith_runtime = {{ signal, state, ref, zeneffect, zenEffect, zenMount, zenWindow, zenDocument, zenOn, zenResize, collectRefs }};\n"
        ));

        module_source.push_str(&rewritten_component_code);
        module_source.push('\n');

        let module_hash = stable_hash_8(&module_source);
        let rel = output_mode.component_rel(&sanitize_asset_token(hoist_id), &module_hash);
        let path = out_dir.join(&rel);
        write_file_for_mode(&path, &module_source, output_mode)
            .map_err(|e| format!("failed to write component asset '{}': {e}", path.display()))?;

        out.insert(hoist_id.clone(), rel);
    }
    Ok(out)
}
