use super::*;

use crate::bundler_emit_assets_imports::{
    collect_js_import_specifiers, is_browser_js_module, is_relative_or_absolute_specifier,
    normalize_module_id, resolve_module_id_for_spec, rewrite_js_import_specifiers,
    strip_css_import_statements, strip_zen_import_statements,
};

pub(crate) fn emit_helper_module_recursive(
    out_dir: &PathBuf,
    module_registry: &BTreeMap<String, CompilerModule>,
    module_id: &str,
    emitted_helper_assets: &mut BTreeMap<String, String>,
    stack: &mut Vec<String>,
    core_import_spec: &str,
    base_path: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    if let Some(existing) = emitted_helper_assets.get(module_id) {
        return Ok(existing.clone());
    }
    if stack.iter().any(|current| current == module_id) {
        let mut cycle = stack.clone();
        cycle.push(module_id.to_string());
        return Err(format!(
            "ERROR: Emission failed - module cycle while emitting helper assets\n  dependency_chain:\n    {}",
            cycle.join(" -> ")
        ));
    }

    let module = module_registry.get(module_id).ok_or_else(|| {
        format!(
            "ERROR: Emission failed - missing module source for '{}'\n  recommended_action: ensure compiler IR includes this module in ir.modules",
            module_id
        )
    })?;

    if !is_browser_js_module(module_id) {
        return Err(format!(
            "ERROR: Emission failed - non-JS helper module cannot be emitted in runtime graph\n  module_id: {module_id}\n  recommended_action: transpile or inline this dependency before bundling"
        ));
    }

    let mut rewritten_source =
        strip_zen_import_statements(&strip_css_import_statements(&module.source));

    stack.push(module_id.to_string());
    for spec in collect_js_import_specifiers(&rewritten_source) {
        if spec == "zenith:core" {
            rewritten_source =
                rewrite_js_import_specifiers(&rewritten_source, &spec, core_import_spec)?;
            continue;
        }
        if spec.starts_with("zenith:") {
            return Err(format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: assets/modules/{}\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: zenith:* imports are not allowed inside emitted helper modules; move the import to a component script or inline runtime primitives",
                module_id,
                module_id,
                stack.join(" -> ")
            ));
        }
        if !is_relative_or_absolute_specifier(&spec) {
            return Err(format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: assets/modules/{}\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                module_id,
                module_id,
                stack.join(" -> ")
            ));
        }
        if spec.starts_with('/') {
            continue;
        }

        let dep_id = resolve_module_id_for_spec(module_registry, module_id, &spec).ok_or_else(|| {
            format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: assets/modules/{}\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                module_id, module_id, stack.join(" -> ")
            )
        })?;

        let dep_rel = emit_helper_module_recursive(
            out_dir,
            module_registry,
            &dep_id,
            emitted_helper_assets,
            stack,
            core_import_spec,
            base_path,
            output_mode,
        )?;

        let dep_spec = public_asset_path(base_path, &dep_rel.replace('\\', "/"));
        rewritten_source = rewrite_js_import_specifiers(&rewritten_source, &spec, &dep_spec)?;
    }
    stack.pop();

    let rel = helper_asset_rel_path(module_id, output_mode, &rewritten_source)?;
    let path = out_dir.join(&rel);
    write_file_for_mode(&path, &rewritten_source, output_mode)
        .map_err(|e| format!("failed to write helper asset '{}': {e}", path.display()))?;
    emitted_helper_assets.insert(module_id.to_string(), rel.clone());
    Ok(rel)
}

pub(crate) fn helper_asset_rel_path(
    module_id: &str,
    output_mode: OutputMode,
    source: &str,
) -> Result<String, String> {
    let normalized = normalize_module_id(module_id);
    if normalized.starts_with('/') || normalized.contains("../") {
        return Err(format!(
            "invalid helper module id '{}' (path traversal is not allowed)",
            module_id
        ));
    }
    if output_mode.is_dev_stable() {
        let path = std::path::Path::new(&normalized);
        let parent = path
            .parent()
            .unwrap_or(std::path::Path::new(""))
            .to_string_lossy()
            .replace('\\', "/");
        let stem = path.file_stem().unwrap_or_default().to_string_lossy();
        if parent.is_empty() {
            Ok(format!("assets/modules/{stem}.dev.js"))
        } else {
            Ok(format!("assets/modules/{parent}/{stem}.dev.js"))
        }
    } else {
        let hash = stable_hash_8(source);
        let path = std::path::Path::new(&normalized);
        let parent = path
            .parent()
            .unwrap_or(std::path::Path::new(""))
            .to_string_lossy()
            .replace('\\', "/");
        let stem = path.file_stem().unwrap_or_default().to_string_lossy();
        if parent.is_empty() {
            Ok(format!("assets/modules/{stem}.{hash}.js"))
        } else {
            Ok(format!("assets/modules/{parent}/{stem}.{hash}.js"))
        }
    }
}

pub(crate) fn helper_asset_specifier_from_rel(rel: &str) -> Result<String, String> {
    let rel_assets = rel
        .strip_prefix("assets/")
        .ok_or_else(|| format!("invalid helper asset path '{rel}'"))?;
    Ok(format!("./{}", rel_assets.replace('\\', "/")))
}
