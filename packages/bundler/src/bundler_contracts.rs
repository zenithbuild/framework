use super::*;

pub(crate) fn validate_payload(
    payload: &BundlerInput,
    expected_ir_version: u32,
) -> Result<(), String> {
    if payload.ir.ir_version != expected_ir_version {
        return Err(format!(
            "unsupported input.ir.ir_version {} (expected {})",
            payload.ir.ir_version, expected_ir_version
        ));
    }
    if payload.route.trim().is_empty() {
        return Err("input.route must be a non-empty string".into());
    }
    if !payload.route.starts_with('/') {
        return Err("input.route must start with '/'".into());
    }
    if payload.file.trim().is_empty() {
        return Err("input.file must be a non-empty string".into());
    }
    if payload.ir.html.trim().is_empty() {
        return Err("input.ir.html must be a non-empty string".into());
    }
    let incoming_graph_hash = payload
        .ir
        .graph_hash
        .as_ref()
        .ok_or_else(|| "input.ir.graph_hash must be provided".to_string())?;
    if incoming_graph_hash.trim().is_empty() {
        return Err("input.ir.graph_hash must be non-empty".into());
    }
    let recomputed = recompute_graph_hash(payload);
    if recomputed != *incoming_graph_hash {
        return Err(format!(
            "ERROR: graph_hash mismatch. IR graph_hash={}, recomputed={}.\nPayload rejected.",
            incoming_graph_hash, recomputed
        ));
    }
    for (idx, node) in payload.ir.graph_nodes.iter().enumerate() {
        if node.id.trim().is_empty() {
            return Err(format!("input.ir.graph_nodes[{idx}].id must be non-empty"));
        }
        if node.hoist_id.trim().is_empty() {
            return Err(format!(
                "input.ir.graph_nodes[{idx}].hoist_id must be non-empty"
            ));
        }
    }
    if !payload.ir.expression_bindings.is_empty()
        && payload.ir.expression_bindings.len() != payload.ir.expressions.len()
    {
        return Err(format!(
            "input.ir.expression_bindings length ({}) must match input.ir.expressions length ({})",
            payload.ir.expression_bindings.len(),
            payload.ir.expressions.len()
        ));
    }
    if !payload.ir.marker_bindings.is_empty()
        && payload.ir.marker_bindings.len() != payload.ir.expressions.len()
    {
        return Err(format!(
            "input.ir.marker_bindings length ({}) must match input.ir.expressions length ({})",
            payload.ir.marker_bindings.len(),
            payload.ir.expressions.len()
        ));
    }
    for signal in &payload.ir.signals {
        if signal.kind != "signal" {
            return Err(format!(
                "input.ir.signals[].kind must be 'signal', got '{}'",
                signal.kind
            ));
        }
        if signal.state_index >= payload.ir.hoisted.state.len() {
            return Err(format!(
                "input.ir.signals[{}].state_index out of bounds: {}",
                signal.id, signal.state_index
            ));
        }
    }
    for (position, binding) in payload.ir.expression_bindings.iter().enumerate() {
        if binding.marker_index >= payload.ir.expressions.len() {
            return Err(format!(
                "input.ir.expression_bindings[{position}].marker_index out of bounds: {}",
                binding.marker_index
            ));
        }
        if let Some(state_index) = binding.state_index {
            if state_index >= payload.ir.hoisted.state.len() {
                return Err(format!(
                    "input.ir.expression_bindings[{position}].state_index out of bounds: {}",
                    state_index
                ));
            }
        }
        if let Some(signal_index) = binding.signal_index {
            if signal_index >= payload.ir.signals.len() {
                return Err(format!(
                    "input.ir.expression_bindings[{position}].signal_index out of bounds: {}",
                    signal_index
                ));
            }
        }
        if binding
            .scoped_data_key
            .as_ref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(false)
        {
            return Err(format!(
                "input.ir.expression_bindings[{position}].scoped_data_key must be non-empty"
            ));
        }
    }
    for (hoist_id, script) in &payload.ir.components_scripts {
        if hoist_id.trim().is_empty() {
            return Err("input.ir.components_scripts contains an empty hoist_id key".into());
        }
        if script.code.trim().is_empty() {
            return Err(format!(
                "input.ir.components_scripts['{}'].code must be non-empty",
                hoist_id
            ));
        }
        if script.factory.trim().is_empty() {
            return Err(format!(
                "input.ir.components_scripts['{}'].factory must be non-empty",
                hoist_id
            ));
        }
        if script.hoist_id != *hoist_id {
            return Err(format!(
                "input.ir.components_scripts key '{}' mismatches hoist_id '{}'",
                hoist_id, script.hoist_id
            ));
        }
        if script.module_id.trim().is_empty() {
            return Err(format!(
                "input.ir.components_scripts['{}'].module_id must be non-empty",
                hoist_id
            ));
        }
    }
    let mut seen_module_ids = BTreeMap::new();
    for (index, module) in payload.ir.modules.iter().enumerate() {
        if module.id.trim().is_empty() {
            return Err(format!("input.ir.modules[{index}].id must be non-empty"));
        }
        if module.source.trim().is_empty() {
            return Err(format!(
                "input.ir.modules[{index}].source must be non-empty"
            ));
        }
        if seen_module_ids.insert(module.id.clone(), true).is_some() {
            return Err(format!(
                "input.ir.modules contains duplicate id '{}'",
                module.id
            ));
        }
    }
    for (index, import) in payload.ir.imports.iter().enumerate() {
        if import.local.trim().is_empty() {
            return Err(format!("input.ir.imports[{index}].local must be non-empty"));
        }
        if import.spec.trim().is_empty() {
            return Err(format!("input.ir.imports[{index}].spec must be non-empty"));
        }
        if import.hoist_id.trim().is_empty() {
            return Err(format!(
                "input.ir.imports[{index}].hoist_id must be non-empty"
            ));
        }
        if import.file_hash.trim().is_empty() {
            return Err(format!(
                "input.ir.imports[{index}].file_hash must be non-empty"
            ));
        }
    }
    let mut seen_instance_ids = BTreeMap::new();
    for instance in &payload.ir.component_instances {
        if instance.instance.trim().is_empty() {
            return Err("input.ir.component_instances[].instance must be non-empty".into());
        }
        if instance.selector.trim().is_empty() {
            return Err("input.ir.component_instances[].selector must be non-empty".into());
        }
        if !payload
            .ir
            .components_scripts
            .contains_key(&instance.hoist_id)
        {
            return Err(format!(
                "input.ir.component_instances references unknown hoist_id '{}'",
                instance.hoist_id
            ));
        }
        if seen_instance_ids
            .insert(instance.instance_id, true)
            .is_some()
        {
            return Err(format!(
                "input.ir.component_instances contains duplicate instance_id {}",
                instance.instance_id
            ));
        }
        if let Some(import_index) = instance.import_index {
            if import_index >= payload.ir.imports.len() {
                return Err(format!(
                    "input.ir.component_instances['{}'].import_index out of bounds: {}",
                    instance.instance, import_index
                ));
            }
        }
        let mut seen_prop_names = BTreeMap::new();
        for prop in &instance.props {
            if prop.name.trim().is_empty() {
                return Err("input.ir.component_instances props name must be non-empty".into());
            }
            if seen_prop_names.insert(prop.name.clone(), true).is_some() {
                return Err(format!(
                    "input.ir.component_instances['{}'] contains duplicate prop '{}'",
                    instance.instance, prop.name
                ));
            }

            match prop.prop_type.as_str() {
                "static" => {
                    if prop.value.is_none() {
                        return Err(format!(
                            "input.ir.component_instances['{}'].props['{}'] static prop must include value",
                            instance.instance, prop.name
                        ));
                    }
                }
                "signal" => {
                    let Some(index) = prop.index else {
                        return Err(format!(
                            "input.ir.component_instances['{}'].props['{}'] signal prop must include index",
                            instance.instance, prop.name
                        ));
                    };
                    if index >= payload.ir.signals.len() {
                        return Err(format!(
                            "input.ir.component_instances['{}'].props['{}'] signal index out of bounds: {}",
                            instance.instance, prop.name, index
                        ));
                    }
                }
                other => {
                    return Err(format!(
                        "input.ir.component_instances['{}'].props['{}'] unsupported type '{}'",
                        instance.instance, prop.name, other
                    ));
                }
            }
        }
    }

    if payload.ir.prerender && payload.ir.server_script.is_none() {
        return Err("input.ir.prerender=true requires input.ir.server_script".into());
    }
    if let Some(server_script) = &payload.ir.server_script {
        if server_script.source.trim().is_empty() {
            return Err("input.ir.server_script.source must be non-empty".into());
        }
        if server_script.prerender != payload.ir.prerender {
            return Err("input.ir.server_script.prerender must match input.ir.prerender".into());
        }
    }

    if !payload.ir.marker_bindings.is_empty() {
        let mut seen = BTreeMap::new();
        for marker in &payload.ir.marker_bindings {
            if marker.index >= payload.ir.expressions.len() {
                return Err(format!(
                    "input.ir.marker_bindings index out of bounds: {}",
                    marker.index
                ));
            }
            if seen.insert(marker.index, true).is_some() {
                return Err(format!(
                    "input.ir.marker_bindings contains duplicate index {}",
                    marker.index
                ));
            }
        }
    }

    Ok(())
}

pub(crate) fn has_runtime_zen_reference(js: &str) -> bool {
    let specifier_re = Regex::new(
        r#"(?m)(?:from\s+['"][^'"]*\.zen['"]|import\s*\(\s*['"][^'"]*\.zen['"]\s*\)|require\s*\(\s*['"][^'"]*\.zen['"]\s*\))"#,
    )
    .expect("valid .zen specifier regex");
    specifier_re.is_match(js)
}

pub(crate) fn verify_emitted_js_imports(
    out_dir: &PathBuf,
    known_emitted_assets: &BTreeSet<String>,
    base_path: &str,
) -> Result<(), String> {
    for rel in known_emitted_assets
        .iter()
        .filter(|asset| asset.ends_with(".js"))
    {
        let file = out_dir.join(rel);
        if !file.exists() {
            continue;
        }
        let source = fs::read_to_string(&file)
            .map_err(|e| format!("failed to read emitted asset '{}': {e}", file.display()))?;

        if source.contains("zenith:") {
            return Err(format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: zenith:*\n  referenced_from_asset: {}\n  recommended_action: all zenith:* imports must be rewritten at bundle time",
                file.display()
            ));
        }

        for expression in collect_dynamic_import_expressions(&source) {
            let trimmed = expression.trim();
            let is_literal = (trimmed.starts_with('"') && trimmed.ends_with('"'))
                || (trimmed.starts_with('\'') && trimmed.ends_with('\''));
            let allowed_manifest_dynamic = trimmed == "__ZENITH_MANIFEST__.chunks[route]";
            if !is_literal && !allowed_manifest_dynamic {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: import({trimmed})\n  referenced_from_asset: {}\n  recommended_action: dynamic imports must be string literals or manifest chunk lookups",
                    file.display()
                ));
            }
        }

        let specs = collect_js_import_specifiers(&source);

        for spec in specs {
            if spec.starts_with("zenith:") {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: {}\n  recommended_action: all zenith:* imports must be rewritten at bundle time",
                    file.display()
                ));
            }
            let resolved = if spec.starts_with("./") || spec.starts_with("../") {
                file.parent()
                    .map(|parent| parent.join(&spec))
                    .ok_or_else(|| {
                        format!(
                            "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: {}\n  recommended_action: emit the referenced module or inline it before writing assets",
                            file.display()
                        )
                    })?
            } else if spec.starts_with('/') {
                let normalized = crate::bundler_paths::strip_base_path(&spec, base_path)
                    .trim_start_matches('/')
                    .replace('\\', "/");
                if known_emitted_assets.contains(&normalized) {
                    continue;
                }
                out_dir.join(normalized)
            } else {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: {}\n  recommended_action: bare imports must be rewritten to emitted assets (vendor or relative module) before finalization",
                    file.display()
                ));
            };

            if !resolved.exists() || !resolved.is_file() {
                return Err(format!(
                    "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: {}\n  recommended_action: ensure the target asset exists in dist and is emitted before finalization",
                    file.display()
                ));
            }
        }
    }

    Ok(())
}

pub(crate) fn recompute_graph_hash(payload: &BundlerInput) -> String {
    let mut hoist_ids = payload
        .ir
        .graph_nodes
        .iter()
        .map(|node| node.hoist_id.clone())
        .collect::<Vec<_>>();
    if hoist_ids.is_empty() {
        hoist_ids = payload
            .ir
            .components_scripts
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        hoist_ids.extend(
            payload
                .ir
                .imports
                .iter()
                .map(|entry| entry.hoist_id.clone()),
        );
        hoist_ids.extend(
            payload
                .ir
                .component_instances
                .iter()
                .map(|entry| entry.hoist_id.clone()),
        );
    }
    hoist_ids.sort();
    hoist_ids.dedup();

    let mut edges = payload.ir.graph_edges.clone();
    edges.sort();
    edges.dedup();

    let mut seed = String::new();
    for hoist_id in hoist_ids {
        seed.push_str("id:");
        seed.push_str(&hoist_id);
        seed.push('\n');
    }
    for edge in edges {
        seed.push_str("edge:");
        seed.push_str(&edge);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

pub(crate) fn validate_server_payload(value: &serde_json::Value, path: &str) -> Result<(), String> {
    match value {
        serde_json::Value::Null => Ok(()),
        serde_json::Value::Bool(_) => Ok(()),
        serde_json::Value::String(_) => Ok(()),
        serde_json::Value::Number(number) => {
            if let Some(float) = number.as_f64() {
                if !float.is_finite() {
                    return Err(format!(
                        "server payload contains non-finite number at '{}'",
                        path
                    ));
                }
            }
            Ok(())
        }
        serde_json::Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                validate_server_payload(item, &format!("{path}[{index}]"))?;
            }
            Ok(())
        }
        serde_json::Value::Object(map) => {
            for (key, item) in map {
                validate_server_payload(item, &format!("{path}.{key}"))?;
            }
            Ok(())
        }
    }
}
