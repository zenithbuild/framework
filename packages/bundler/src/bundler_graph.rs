use super::*;

pub(crate) struct GlobalGraph {
    pub(crate) nodes: Vec<CompilerGraphNode>,
    pub(crate) edges: Vec<String>,
}

pub(crate) fn build_global_graph(inputs: &[BundlerInput]) -> Result<GlobalGraph, String> {
    let mut nodes = BTreeMap::new();
    let mut edges = Vec::new();

    for input in inputs {
        for node in &input.ir.graph_nodes {
            nodes.entry(node.hoist_id.clone()).or_insert(node.clone());
        }
        edges.extend(input.ir.graph_edges.clone());
    }

    let mut sorted_nodes: Vec<CompilerGraphNode> = nodes.into_values().collect();
    sorted_nodes.sort_by(|a, b| a.hoist_id.cmp(&b.hoist_id));

    edges.sort();
    edges.dedup();

    Ok(GlobalGraph {
        nodes: sorted_nodes,
        edges,
    })
}

pub(crate) fn compute_global_graph_hash(graph: &GlobalGraph) -> String {
    let mut seed = String::new();
    for node in &graph.nodes {
        seed.push_str("node:");
        seed.push_str(&node.hoist_id);
        seed.push('\n');
    }
    for edge in &graph.edges {
        seed.push_str("edge:");
        seed.push_str(edge);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

pub(crate) fn build_module_registry(
    inputs: &[BundlerInput],
) -> Result<BTreeMap<String, CompilerModule>, String> {
    let mut modules = BTreeMap::<String, CompilerModule>::new();
    for input in inputs {
        for module in &input.ir.modules {
            if let Some(existing) = modules.get(&module.id) {
                if existing.source != module.source || existing.deps != module.deps {
                    return Err(format!(
                        "module registry conflict for '{}': multiple source/dependency variants discovered",
                        module.id
                    ));
                }
                continue;
            }
            modules.insert(module.id.clone(), module.clone());
        }
    }
    Ok(modules)
}

pub(crate) fn collect_fast_path_vendor_map(
    inputs: &[BundlerInput],
    output_mode: OutputMode,
    base_path: &str,
) -> Result<BTreeMap<String, String>, String> {
    Ok(
        crate::dependency_analysis::collect_vendor_specifiers(inputs)?
            .into_iter()
            .map(|specifier| {
                let path = fast_path_vendor_public_path(output_mode, base_path, &specifier);
                (specifier, path)
            })
            .collect(),
    )
}

fn fast_path_vendor_public_path(
    output_mode: OutputMode,
    base_path: &str,
    specifier: &str,
) -> String {
    let name = crate::vendor::vendor_entry_name(specifier);
    let filename = if output_mode.is_dev_stable() {
        format!("{name}.dev.js")
    } else {
        name
    };
    crate::bundler_paths::public_asset_path(base_path, &format!("assets/{filename}"))
}

pub(crate) fn derive_fast_path_component_assets(
    inputs: &[BundlerInput],
    changed_routes: &BTreeSet<String>,
    output_mode: OutputMode,
) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for input in inputs {
        if !changed_routes.contains(&input.route) {
            continue;
        }
        for hoist_id in input.ir.components_scripts.keys() {
            out.insert(
                hoist_id.clone(),
                output_mode
                    .component_rel(&crate::bundler_paths::sanitize_asset_token(hoist_id), ""),
            );
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fast_path_vendor_stays_under_the_assets_root() {
        assert_eq!(
            fast_path_vendor_public_path(OutputMode::DevStable, "/", "first"),
            format!(
                "/assets/{}.dev.js",
                crate::vendor::vendor_entry_name("first")
            )
        );
        assert_eq!(
            fast_path_vendor_public_path(OutputMode::DevStable, "/docs", "first"),
            format!(
                "/docs/assets/{}.dev.js",
                crate::vendor::vendor_entry_name("first")
            )
        );
    }
}
