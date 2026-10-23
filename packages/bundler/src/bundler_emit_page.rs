use super::*;

pub(crate) use crate::bundler_emit_page_tables::{
    derive_binding_tables, render_compacted_page_payload_tables_js,
};

pub(crate) fn runtime_import_specifier(runtime_rel: &str) -> Result<String, String> {
    let runtime_path = PathBuf::from(runtime_rel);
    let file_name = runtime_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("invalid runtime asset path '{runtime_rel}'"))?;
    Ok(format!("./{file_name}"))
}

pub(crate) fn generate_component_bootstrap_js(
    ir: &CompilerIr,
    component_assets: &BTreeMap<String, String>,
    base_path: &str,
) -> Result<(String, String), String> {
    if ir.component_instances.is_empty() {
        return Ok((String::new(), "[]".to_string()));
    }

    let mut aliases = BTreeMap::new();
    let mut imports = String::new();
    let mut seen_hoist_ids = BTreeSet::new();
    let mut ordered_hoist_ids = Vec::new();
    for instance in &ir.component_instances {
        if seen_hoist_ids.insert(instance.hoist_id.clone()) {
            ordered_hoist_ids.push(instance.hoist_id.clone());
        }
    }

    for hoist_id in ordered_hoist_ids {
        let rel = component_assets.get(&hoist_id).ok_or_else(|| {
            format!(
                "missing component asset mapping for hoist_id '{}'",
                hoist_id
            )
        })?;
        let alias = format!("__zenith_component_{}", sanitize_asset_token(&hoist_id));
        let script = ir.components_scripts.get(&hoist_id).ok_or_else(|| {
            format!(
                "missing component script metadata for hoist_id '{}'",
                hoist_id
            )
        })?;
        let factory_name = script.factory.trim();
        if factory_name.is_empty() {
            return Err(format!(
                "component script '{}' has empty factory export name",
                hoist_id
            ));
        }
        let component_path = PathBuf::from(rel);
        let file_name = component_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("invalid component asset path '{rel}'"))?;
        imports.push_str(&format!(
            "import {{ {} as {} }} from './{}';\n",
            factory_name, alias, file_name
        ));
        aliases.insert(hoist_id, alias);
    }

    let mut components = String::from("[");
    for (index, instance) in ir.component_instances.iter().enumerate() {
        let create_alias = aliases.get(&instance.hoist_id).ok_or_else(|| {
            format!(
                "missing component asset mapping for hoist_id '{}'",
                instance.hoist_id
            )
        })?;
        if index > 0 {
            components.push(',');
        }
        let instance_json = serde_json::to_string(&instance.instance)
            .map_err(|e| format!("failed to serialize component instance id: {e}"))?;
        let selector_json = serde_json::to_string(&instance.selector)
            .map_err(|e| format!("failed to serialize component selector: {e}"))?;
        let hoist_json = serde_json::to_string(&instance.hoist_id)
            .map_err(|e| format!("failed to serialize component hoist id: {e}"))?;
        let module_rel = component_assets.get(&instance.hoist_id).ok_or_else(|| {
            format!(
                "missing component module path for hoist_id '{}'",
                instance.hoist_id
            )
        })?;
        let module_json = serde_json::to_string(&public_asset_path(base_path, module_rel))
            .map_err(|e| format!("failed to serialize component module path: {e}"))?;
        let props_json = serde_json::to_string(&instance.props)
            .map_err(|e| format!("failed to serialize component props: {e}"))?;
        components.push_str(&format!(
            "{{instance:{instance_json},instance_id:{},marker_index:{},selector:{selector_json},hoist_id:{hoist_json},module:{module_json},props:{props_json},create:{create_alias}}}",
            instance.instance_id,
            instance.marker_index
        ));
    }
    components.push(']');

    Ok((imports, components))
}

pub(crate) fn inject_runtime_hook_aliases(component_code: &str) -> String {
    let hook_anchor = "const zeneffect = __runtime.zeneffect;";
    if component_code.contains(hook_anchor) {
        return component_code.replacen(
            hook_anchor,
            "const zeneffect = __runtime.zeneffect;\n  const zenEffect = __runtime.zenEffect || __runtime.zeneffect;\n  const zenMount = __runtime.zenMount;\n  const ref = __runtime.ref;\n  const zenWindow = __runtime.zenWindow;\n  const zenDocument = __runtime.zenDocument;\n  const zenOn = __runtime.zenOn;\n  const zenResize = __runtime.zenResize;\n  const collectRefs = __runtime.collectRefs;",
            1,
        );
    }

    component_code.to_string()
}

pub(crate) fn guard_component_bindings(component_code: &str) -> Result<String, String> {
    let anchor_re = Regex::new(r"bindings\s*:\s*\{")
        .map_err(|error| format!("failed to compile component bindings anchor regex: {error}"))?;
    let binding_value_re =
        Regex::new(r#"(?m)(['"][^'"]+['"]\s*:\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*,?)"#)
            .map_err(|error| format!("failed to compile component binding guard regex: {error}"))?;

    let mut cursor = 0usize;
    let mut rewritten = String::with_capacity(component_code.len());

    while let Some(anchor_match) = anchor_re.find(&component_code[cursor..]) {
        let anchor_end = cursor + anchor_match.end();
        let open_brace_index = anchor_end
            .checked_sub(1)
            .ok_or_else(|| "component bindings rewrite failed: invalid anchor range".to_string())?;
        let close_brace_index =
            find_matching_brace(component_code, open_brace_index).ok_or_else(|| {
                "component bindings rewrite failed: unterminated bindings object".to_string()
            })?;

        rewritten.push_str(&component_code[cursor..anchor_end]);

        let body = &component_code[anchor_end..close_brace_index];
        let guarded_body = binding_value_re.replace_all(body, |captures: &regex::Captures| {
            let prefix = captures.get(1).map(|m| m.as_str()).unwrap_or("");
            let ident = captures.get(2).map(|m| m.as_str()).unwrap_or("");
            let suffix = captures.get(3).map(|m| m.as_str()).unwrap_or("");
            format!("{prefix}(typeof {ident} === 'undefined' ? undefined : {ident}){suffix}")
        });
        rewritten.push_str(&guarded_body);
        rewritten.push('}');

        cursor = close_brace_index + 1;
    }

    rewritten.push_str(&component_code[cursor..]);
    Ok(rewritten)
}

fn find_matching_brace(source: &str, open_brace_index: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    if open_brace_index >= bytes.len() || bytes[open_brace_index] != b'{' {
        return None;
    }

    let mut depth = 0usize;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;
    let mut escaped = false;

    for (index, byte) in bytes.iter().enumerate().skip(open_brace_index) {
        let ch = *byte;

        if escaped {
            escaped = false;
            continue;
        }

        if in_single_quote {
            if ch == b'\\' {
                escaped = true;
            } else if ch == b'\'' {
                in_single_quote = false;
            }
            continue;
        }
        if in_double_quote {
            if ch == b'\\' {
                escaped = true;
            } else if ch == b'"' {
                in_double_quote = false;
            }
            continue;
        }
        if in_backtick {
            if ch == b'\\' {
                escaped = true;
            } else if ch == b'`' {
                in_backtick = false;
            }
            continue;
        }

        match ch {
            b'\'' => in_single_quote = true,
            b'"' => in_double_quote = true,
            b'`' => in_backtick = true,
            b'{' => depth += 1,
            b'}' => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }

    None
}

pub(crate) fn generate_core_module_js(runtime_import_spec: &str) -> String {
    format!(
        r#"import {{ signal, state, zeneffect, zenEffect as __zenithZenEffect, zenMount as __zenithZenMount }} from '{runtime_import_spec}';

export const zenSignal = signal;
export const zenState = state;
export const zenEffect = __zenithZenEffect;
export const zenMount = __zenithZenMount;

export function zenOnMount(callback) {{
  return __zenithZenMount(callback);
}}

export {{ signal, state, zeneffect }};
"#
    )
}
