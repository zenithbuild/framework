use crate::script_transform::analyze_component_script_structure;
use std::time::Instant;

use super::script_contract::{assert_no_forbidden_tokens, script_contract_error};
use super::script_types::{
    HoistedBinding, HoistedBindingKind, HoistedScript, ScriptContractError, ScriptProfileMetrics,
};

pub(super) fn analyze_component_script(
    id: usize,
    source_path: &str,
    component_path: &str,
    source: &str,
    is_global: bool,
    profile_enabled: bool,
    profile: &mut ScriptProfileMetrics,
) -> Result<HoistedScript, ScriptContractError> {
    assert_no_forbidden_tokens(source, source_path, id)?;
    let import_work_started_at = profile_enabled.then(Instant::now);
    let rename_prefix = format!(
        "__{}_{}_",
        sanitize_component_slug(component_path),
        stable_hash_8(component_path),
    );
    let analyzed = analyze_component_script_structure(source, component_path, &rename_prefix)
        .map_err(|reason| script_contract_error(source_path, id, reason))?;
    let imports = analyzed.imports;
    let source_without_imports = analyzed.source_without_imports;
    let renamed_source = analyzed.renamed_source;
    let declarations = analyzed.declarations;
    let bindings = analyzed.bindings;
    let canonical_source = canonicalize_script_source(&source_without_imports);
    let hoist_id = stable_hash_8(&canonical_source);
    let factory_name = format!("createComponent_{}", sanitize_factory_suffix(&hoist_id));
    if let Some(started_at) = import_work_started_at {
        let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;
        profile.analyze_import_work_ms += elapsed_ms;
        profile.analyze_rename_rewrite_ms += elapsed_ms;
        profile.analyze_state_lower_ms += elapsed_ms;
        profile.analyze_lower_state_reads_ms += elapsed_ms;
        profile.analyze_declaration_collect_ms += elapsed_ms;
    }

    let mut functions = Vec::new();
    let mut signals = Vec::new();
    for binding in &bindings {
        if matches!(binding.kind, HoistedBindingKind::Function) {
            functions.push(binding.renamed.clone());
        }
        if matches!(
            binding.kind,
            HoistedBindingKind::Signal | HoistedBindingKind::State
        ) {
            signals.push(binding.renamed.clone());
        }
    }

    let factory_code_started_at = profile_enabled.then(Instant::now);
    let factory_code =
        generate_factory_code(&factory_name, &imports, &source_without_imports, &bindings);
    if let Some(started_at) = factory_code_started_at {
        profile.analyze_factory_code_ms += started_at.elapsed().as_secs_f64() * 1000.0;
    }

    Ok(HoistedScript {
        id,
        component_path: component_path.to_string(),
        is_global,
        hoist_id,
        factory_name,
        factory_code,
        renamed_source: renamed_source.trim().to_string(),
        imports,
        declarations,
        functions,
        signals,
        bindings,
    })
}

pub(crate) fn stable_hash_8(input: &str) -> String {
    let mut hash: i32 = 0;
    for byte in input.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    let normalized = hash.wrapping_abs() as u32;
    format!("{normalized:08x}")
}

fn sanitize_component_slug(source_path: &str) -> String {
    let mut slug = String::new();
    for ch in source_path.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
        } else {
            slug.push('_');
        }
    }
    const MAX_COMPONENT_SLUG_LEN: usize = 48;
    if slug.len() > MAX_COMPONENT_SLUG_LEN {
        slug = slug[slug.len() - MAX_COMPONENT_SLUG_LEN..].to_string();
    }
    let trimmed = slug.trim_matches('_');
    if trimmed.is_empty() {
        "component".to_string()
    } else {
        trimmed.to_string()
    }
}

fn canonicalize_script_source(source: &str) -> String {
    source
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn sanitize_factory_suffix(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "component".to_string()
    } else {
        out
    }
}

fn generate_factory_code(
    factory_name: &str,
    _imports: &[String],
    source_without_imports: &str,
    bindings: &[HoistedBinding],
) -> String {
    let body = source_without_imports.trim();

    let mut lines = Vec::new();

    lines.push(format!(
        "export function {factory_name}(host, props, runtime) {{"
    ));
    lines.push(
        "  const __props = props && typeof props === 'object' ? props : Object.freeze({});"
            .to_string(),
    );
    lines.push(
        "  const __runtime = runtime && typeof runtime === 'object' ? runtime : {};".to_string(),
    );
    lines.push("  const signal = __runtime.signal;".to_string());
    lines.push("  const state = __runtime.state;".to_string());
    lines.push("  const ref = __runtime.ref;".to_string());
    lines.push("  const zeneffect = __runtime.zeneffect;".to_string());
    if !body.is_empty() {
        for line in body.lines() {
            lines.push(format!("  {}", line));
        }
    }
    lines.push("  return {".to_string());
    lines.push("    mount() {},".to_string());
    lines.push("    update(nextProps) {".to_string());
    lines.push("      void nextProps;".to_string());
    lines.push("      void __props;".to_string());
    lines.push("    },".to_string());
    lines.push("    destroy() {},".to_string());
    lines.push("    bindings: Object.freeze({".to_string());
    for binding in bindings {
        let value = match binding.kind {
            HoistedBindingKind::Signal => format!(
                "() => (typeof {ident} === 'undefined' ? undefined : ({ident} && typeof {ident}.get === 'function' ? {ident}.get() : undefined))",
                ident = binding.original
            ),
            HoistedBindingKind::Ref => format!(
                "(typeof {ident} === 'undefined' ? undefined : {ident})",
                ident = binding.original
            ),
            HoistedBindingKind::State
            | HoistedBindingKind::Function
            | HoistedBindingKind::Const => format!(
                "(typeof {ident} === 'undefined' ? undefined : {ident})",
                ident = binding.original
            ),
        };
        lines.push(format!("      \"{}\": {},", binding.original, value));
    }
    lines.push("    })".to_string());
    lines.push("  };".to_string());
    lines.push("}".to_string());
    lines.push(format!("export default {factory_name};"));

    lines.join("\n")
}
