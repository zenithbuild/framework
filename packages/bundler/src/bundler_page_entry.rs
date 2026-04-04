use super::*;

pub(crate) fn generate_entry_js(
    ir: &CompilerIr,
    runtime_import_spec: &str,
    markers: &[MarkerBinding],
    events: &[EventBinding],
    component_assets: &BTreeMap<String, String>,
    route_pattern: &str,
    ssr_data: Option<&serde_json::Value>,
    global_graph_hash: &str,
    router_enabled: bool,
    base_path: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    let needs_non_router_param_resolution =
        !router_enabled && route_pattern_has_dynamic_segments(route_pattern);
    let compiler_output = CompilerOutput {
        ir_version: ir.ir_version,
        graph_hash: global_graph_hash.to_string(),
        graph_edges: ir.graph_edges.clone(),
        graph_nodes: ir
            .graph_nodes
            .iter()
            .map(|node| zenith_compiler::compiler::GraphNodePayload {
                id: node.id.clone(),
                hoist_id: node.hoist_id.clone(),
            })
            .collect(),
        html: ir.html.clone(),
        expressions: ir.expressions.clone(),
        imports: Default::default(),
        server_script: Default::default(),
        prerender: false,
        ssr_data: Default::default(),
        hoisted: Default::default(),
        components_scripts: Default::default(),
        component_instances: Default::default(),
        signals: Default::default(),
        expression_bindings: Default::default(),
        marker_bindings: Default::default(),
        event_bindings: Default::default(),
        ref_bindings: Default::default(),
        style_blocks: Default::default(),
        image_materialization: Default::default(),
    };

    let events_json = serde_json::to_string(events)
        .map_err(|e| format!("failed to serialize event table: {e}"))?;
    let refs_json = serde_json::to_string(&map_runtime_ref_bindings(ir)?)
        .map_err(|e| format!("failed to serialize ref table: {e}"))?;

    let mut js = zenith_bundler::utils::generate_virtual_entry(&compiler_output);
    js.push_str("\nconst __zenith_component_bootstraps = [];\n");
    let ssr_json = serde_json::to_string(
        ssr_data.unwrap_or(&serde_json::Value::Object(serde_json::Map::new())),
    )
    .map_err(|e| format!("failed to serialize ssr_data: {e}"))?;
    js.push_str(&page_runtime::render_runtime_data_helpers(&ssr_json));
    for block in &ir.hoisted.code {
        let trimmed = block.trim();
        if !trimmed.is_empty() {
            js.push('\n');
            js.push_str(trimmed);
            js.push('\n');
        }
    }
    js.push_str(&format!("const __zenith_events = {};\n", events_json));
    js.push_str(&format!("const __zenith_refs = {};\n", refs_json));
    let signals_json = serde_json::to_string(&ir.signals)
        .map_err(|e| format!("failed to serialize signal table: {e}"))?;
    let bindings_to_use: Vec<CompilerExpressionBinding> = if ir.expression_bindings.is_empty() {
        ir.expressions
            .iter()
            .enumerate()
            .map(|(index, value)| CompilerExpressionBinding {
                marker_index: index,
                signal_index: None,
                signal_indices: Vec::new(),
                state_index: None,
                component_instance: None,
                component_binding: None,
                literal: Some(value.clone()),
                compiled_expr: None,
                source: None,
            })
            .collect()
    } else {
        ir.expression_bindings.clone()
    };
    let (expr_fns_js, runtime_expression_bindings) =
        build_expression_fns_and_bindings(&bindings_to_use)?;

    js.push_str(&generate_state_table_js(&ir.hoisted.state)?);
    js.push_str(&generate_state_keys_js(&ir.hoisted.state)?);
    js.push_str(&format!("const __zenith_ir_version = {};\n", ir.ir_version));
    js.push_str(&format!(
        "const __zenith_graph_hash = {};\n",
        serde_json::to_string(global_graph_hash)
            .map_err(|e| format!("failed to serialize graph hash: {e}"))?
    ));
    js.push_str(&format!("const __zenith_signals = {};\n", signals_json));
    js.push_str(&expr_fns_js);
    if output_mode.is_dev_stable() {
        let markers_json = serde_json::to_string(markers)
            .map_err(|e| format!("failed to serialize marker table: {e}"))?;
        let expression_bindings_json = serde_json::to_string(&runtime_expression_bindings)
            .map_err(|e| format!("failed to serialize expression table: {e}"))?;
        js.push_str(&format!("const __zenith_markers = {};\n", markers_json));
        js.push_str(&format!(
            "const __zenith_expression_bindings = {};\n",
            expression_bindings_json
        ));
    } else {
        js.push_str(&render_compacted_page_payload_tables_js(
            markers,
            &runtime_expression_bindings,
        )?);
    }
    let (component_imports, components_table) =
        generate_component_bootstrap_js(ir, component_assets, base_path)?;
    if !component_imports.is_empty() {
        js.push_str(&component_imports);
    }
    js.push_str(&format!(
        "import {{ hydrate, signal, state, ref, zeneffect, zenEffect, zenMount, zenWindow, zenDocument, zenOn, zenResize, collectRefs }} from '{}';\n",
        runtime_import_spec
    ));
    let route_pattern_json = serde_json::to_string(route_pattern)
        .map_err(|e| format!("failed to serialize route pattern: {e}"))?;
    js.push_str(&format!(
        "const __zenith_route_pattern = {};\n",
        route_pattern_json
    ));
    if needs_non_router_param_resolution {
        js.push_str("function __zsp(pathname) {\n");
        js.push_str("  return String(pathname || '/').split('/').filter(Boolean);\n");
        js.push_str("}\n");
        js.push_str("function __znc(segments) {\n");
        js.push_str("  return segments.filter(Boolean).join('/');\n");
        js.push_str("}\n");
        js.push_str("function __zrp(pattern, pathname) {\n");
        js.push_str("  const patternSegs = __zsp(pattern);\n");
        js.push_str("  const valueSegs = __zsp(pathname);\n");
        js.push_str("  const params = Object.create(null);\n");
        js.push_str("  let patternIndex = 0;\n");
        js.push_str("  let valueIndex = 0;\n");
        js.push_str("  while (patternIndex < patternSegs.length) {\n");
        js.push_str("    const patternSeg = patternSegs[patternIndex];\n");
        js.push_str("    if (patternSeg.startsWith('*')) {\n");
        js.push_str("      const optionalCatchAll = patternSeg.endsWith('?');\n");
        js.push_str(
            "      const key = optionalCatchAll ? patternSeg.slice(1, -1) : patternSeg.slice(1);\n",
        );
        js.push_str("      if (patternIndex !== patternSegs.length - 1) {\n");
        js.push_str("        return {};\n");
        js.push_str("      }\n");
        js.push_str("      const rest = valueSegs.slice(valueIndex);\n");
        js.push_str(
            "      const rootRequiredCatchAll = !optionalCatchAll && patternSegs.length === 1;\n",
        );
        js.push_str(
            "      if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {\n",
        );
        js.push_str("        return {};\n");
        js.push_str("      }\n");
        js.push_str("      params[key] = __znc(rest);\n");
        js.push_str("      valueIndex = valueSegs.length;\n");
        js.push_str("      patternIndex = patternSegs.length;\n");
        js.push_str("      continue;\n");
        js.push_str("    }\n");
        js.push_str("    if (valueIndex >= valueSegs.length) {\n");
        js.push_str("      return {};\n");
        js.push_str("    }\n");
        js.push_str("    const valueSeg = valueSegs[valueIndex];\n");
        js.push_str("    if (patternSeg.startsWith(':')) {\n");
        js.push_str("      params[patternSeg.slice(1)] = valueSeg;\n");
        js.push_str("    } else if (patternSeg !== valueSeg) {\n");
        js.push_str("      return {};\n");
        js.push_str("    }\n");
        js.push_str("    patternIndex += 1;\n");
        js.push_str("    valueIndex += 1;\n");
        js.push_str("  }\n");
        js.push_str(
            "  if (patternIndex !== patternSegs.length || valueIndex !== valueSegs.length) {\n",
        );
        js.push_str("    return {};\n");
        js.push_str("  }\n");
        js.push_str("  return params;\n");
        js.push_str("}\n");
    }
    js.push_str(&format!(
        "const __zenith_components = {};\n",
        components_table
    ));
    if router_enabled {
        js.push_str(page_runtime::render_route_html_helpers());
    }
    js.push_str("function __zm(root = document, params = {}) {\n");
    js.push_str("  __zrr();\n");
    if router_enabled {
        js.push_str("  __zah(root);\n");
    }
    js.push_str("  const __zenith_unmount = hydrate({\n");
    js.push_str("    root,\n");
    js.push_str("    ir_version: __zenith_ir_version,\n");
    js.push_str("    graph_hash: __zenith_graph_hash,\n");
    js.push_str("    expressions: __zenith_expression_bindings,\n");
    js.push_str(
        "    expr_fns: typeof __zenith_expr_fns !== 'undefined' ? __zenith_expr_fns : [],\n",
    );
    js.push_str("    markers: __zenith_markers,\n");
    js.push_str("    events: __zenith_events,\n");
    js.push_str("    refs: __zenith_refs,\n");
    js.push_str("    state_values: __zenith_state_values,\n");
    js.push_str("    state_keys: __zenith_state_keys,\n");
    js.push_str("    signals: __zenith_signals,\n");
    js.push_str("    components: __zenith_components,\n");
    js.push_str("    route: __zenith_route_pattern,\n");
    js.push_str("    ssr_data: __zenith_ssr_data,\n");
    js.push_str("    props: typeof props !== 'undefined' ? props : {},\n");
    js.push_str("    params\n");
    js.push_str("  });\n");
    js.push_str("  for (let i = 0; i < __zenith_component_bootstraps.length; i++) {\n");
    js.push_str("    __zenith_component_bootstraps[i]();\n");
    js.push_str("  }\n");
    js.push_str("  return __zenith_unmount;\n");
    js.push_str("}\n");
    js.push_str("export { __zm as __zenith_mount };\n");
    if !router_enabled {
        if needs_non_router_param_resolution {
            js.push_str(
                "const __zip = typeof location === 'object' && typeof location.pathname === 'string' ? location.pathname : '/';\n",
            );
            js.push_str("const __zipa = __zrp(__zenith_route_pattern, __zip);\n");
            js.push_str("__zm(document, __zipa);\n");
        } else {
            js.push_str("__zm(document, {});\n");
        }
    }

    Ok(js)
}

fn route_pattern_has_dynamic_segments(route_pattern: &str) -> bool {
    let route = route_pattern.trim();
    route
        .split('/')
        .any(|segment| segment.starts_with(':') || segment.starts_with('*'))
}

fn generate_state_table_js(bindings: &[CompilerStateBinding]) -> Result<String, String> {
    if bindings.is_empty() {
        return Ok("const __zenith_state_values = [];\n".to_string());
    }

    let mut out = String::from("const __zenith_state_values = [\n");
    for binding in bindings {
        out.push_str("  ");
        out.push_str(binding.value.trim());
        out.push_str(",\n");
    }
    out.push_str("];\n");
    Ok(out)
}

fn map_runtime_ref_bindings(ir: &CompilerIr) -> Result<Vec<RuntimeRefBinding>, String> {
    let mut out = Vec::new();
    for binding in &ir.ref_bindings {
        let Some(state_index) = resolve_ref_state_index(&ir.hoisted.state, &binding.identifier)
        else {
            return Err(format!(
                "failed to resolve ref binding '{}' to hoisted state key",
                binding.identifier
            ));
        };
        out.push(RuntimeRefBinding {
            index: binding.index,
            state_index,
            selector: binding.selector.clone(),
            source: binding.source.clone(),
        });
    }
    Ok(out)
}

fn resolve_ref_state_index(bindings: &[CompilerStateBinding], identifier: &str) -> Option<usize> {
    if identifier.is_empty() {
        return None;
    }

    for (index, binding) in bindings.iter().enumerate() {
        if binding.key == identifier {
            return Some(index);
        }
    }

    let suffix = format!("_{}", identifier);
    let mut match_index: Option<usize> = None;
    for (index, binding) in bindings.iter().enumerate() {
        if binding.key.ends_with(&suffix) {
            if match_index.is_some() {
                return None;
            }
            match_index = Some(index);
        }
    }

    match_index
}

fn generate_state_keys_js(bindings: &[CompilerStateBinding]) -> Result<String, String> {
    if bindings.is_empty() {
        return Ok("const __zenith_state_keys = [];\n".to_string());
    }

    let keys: Vec<String> = bindings.iter().map(|binding| binding.key.clone()).collect();
    let keys_json =
        serde_json::to_string(&keys).map_err(|e| format!("failed to serialize state keys: {e}"))?;
    Ok(format!("const __zenith_state_keys = {};\n", keys_json))
}

/// Build __zenith_expr_fns JS and bindings with fn_index for compound expressions.
pub(crate) fn build_expression_fns_and_bindings(
    bindings: &[CompilerExpressionBinding],
) -> Result<(String, Vec<serde_json::Value>), String> {
    let mut expr_fns = Vec::new();
    let mut fn_index_by_binding = std::collections::BTreeMap::new();
    for (i, b) in bindings.iter().enumerate() {
        if let Some(ref expr) = b.compiled_expr {
            let fn_idx = expr_fns.len();
            expr_fns.push(expr.clone());
            fn_index_by_binding.insert(i, fn_idx);
        }
    }
    let js = if expr_fns.is_empty() {
        "const __zenith_expr_fns = [];\n".to_string()
    } else {
        let fn_defs: Vec<String> = expr_fns
            .iter()
            .map(|expression| zenith_bundler::utils::emit_runtime_expression_function(expression))
            .collect::<Result<Vec<_>, _>>()?;
        format!(
            "const __zenith_expr_fns = [\n  {}\n];\n",
            fn_defs.join(",\n  ")
        )
    };
    let runtime_bindings: Vec<serde_json::Value> = bindings
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let mut obj = serde_json::json!({
                "marker_index": b.marker_index,
                "signal_index": b.signal_index,
                "signal_indices": b.signal_indices,
                "state_index": b.state_index,
                "component_instance": b.component_instance,
                "component_binding": b.component_binding,
                "literal": b.literal,
                "source": b.source
            });
            if let Some(&fi) = fn_index_by_binding.get(&i) {
                obj["fn_index"] = serde_json::json!(fi);
            }
            obj
        })
        .collect();
    Ok((js, runtime_bindings))
}
