use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{self, Command};

use regex::Regex;

use serde::{Deserialize, Serialize};
use zenith_bundler::CompilerOutput;
use zenith_compiler::deterministic::sha256_hex;
use zenith_compiler::script::ExtractedStyleBlock;

mod template_bridge;
mod vendor;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct BundlerInput {
    route: String,
    file: String,
    ir: CompilerIr,
    #[serde(default)]
    router: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CompilerIr {
    #[serde(rename = "schemaVersion", default)]
    #[allow(dead_code)]
    schema_version: Option<u32>,
    #[serde(default)]
    #[allow(dead_code)]
    warnings: Vec<serde_json::Value>,
    ir_version: u32,
    #[serde(default)]
    graph_hash: Option<String>,
    #[serde(default)]
    graph_edges: Vec<String>,
    #[serde(default)]
    graph_nodes: Vec<CompilerGraphNode>,
    html: String,
    expressions: Vec<String>,
    #[serde(default)]
    hoisted: CompilerHoisted,
    #[serde(default)]
    components_scripts: BTreeMap<String, CompilerComponentScript>,
    #[serde(default)]
    component_instances: Vec<CompilerComponentInstance>,
    #[serde(default)]
    imports: Vec<CompilerImport>,
    #[serde(default)]
    modules: Vec<CompilerModule>,
    #[serde(default)]
    server_script: Option<CompilerServerScript>,
    #[serde(default)]
    prerender: bool,
    #[serde(default)]
    ssr_data: Option<serde_json::Value>,
    #[serde(default)]
    signals: Vec<CompilerSignal>,
    #[serde(default)]
    expression_bindings: Vec<CompilerExpressionBinding>,
    #[serde(default)]
    marker_bindings: Vec<MarkerBinding>,
    #[serde(default)]
    event_bindings: Vec<EventBinding>,
    #[serde(default)]
    ref_bindings: Vec<CompilerRefBinding>,
    #[serde(default)]
    style_blocks: Vec<ExtractedStyleBlock>,
    #[serde(default)]
    has_guard: bool,
    #[serde(default)]
    has_load: bool,
    #[serde(default)]
    guard_module_ref: Option<String>,
    #[serde(default)]
    load_module_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct CompilerHoisted {
    #[serde(default)]
    imports: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    declarations: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    functions: Vec<String>,
    #[allow(dead_code)]
    #[serde(default)]
    signals: Vec<String>,
    #[serde(default)]
    state: Vec<CompilerStateBinding>,
    #[serde(default)]
    code: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerStateBinding {
    key: String,
    value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerComponentScript {
    hoist_id: String,
    #[serde(default)]
    module_id: String,
    factory: String,
    #[serde(default)]
    imports: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    deps: Vec<String>,
    code: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerModule {
    id: String,
    source: String,
    #[serde(default)]
    deps: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerComponentInstance {
    instance: String,
    #[serde(default)]
    instance_id: usize,
    hoist_id: String,
    #[serde(default)]
    import_index: Option<usize>,
    #[serde(default)]
    marker_index: usize,
    selector: String,
    #[serde(default)]
    props: Vec<CompilerComponentProp>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerImport {
    local: String,
    spec: String,
    hoist_id: String,
    file_hash: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerServerScript {
    source: String,
    prerender: bool,
    #[serde(default)]
    source_path: Option<String>,
    #[serde(default)]
    has_guard: bool,
    #[serde(default)]
    has_load: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerGraphNode {
    id: String,
    hoist_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerComponentProp {
    name: String,
    #[serde(rename = "type")]
    prop_type: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<serde_json::Value>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerSignal {
    id: usize,
    kind: String,
    state_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CompilerExpressionBinding {
    marker_index: usize,
    #[serde(default)]
    signal_index: Option<usize>,
    #[serde(default)]
    signal_indices: Vec<usize>,
    #[serde(default)]
    state_index: Option<usize>,
    #[serde(default)]
    component_instance: Option<String>,
    #[serde(default)]
    component_binding: Option<String>,
    #[serde(default)]
    literal: Option<String>,
    #[serde(default)]
    compiled_expr: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RouterManifest {
    routes: Vec<RouterRouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RouterRouteEntry {
    path: String,
    output: String,
    html: String,
    expressions: Vec<String>,
    #[serde(default)]
    page_asset: Option<String>,
    #[serde(default)]
    server_script: Option<String>,
    #[serde(default)]
    server_script_path: Option<String>,
    #[serde(default)]
    prerender: bool,
    #[serde(default)]
    ssr_data: Option<serde_json::Value>,
    #[serde(default)]
    has_guard: bool,
    #[serde(default)]
    has_load: bool,
    #[serde(default)]
    guard_module_ref: Option<String>,
    #[serde(default)]
    load_module_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum MarkerKind {
    Text,
    Attr,
    Event,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarkerBinding {
    index: usize,
    kind: MarkerKind,
    selector: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    attr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EventBinding {
    index: usize,
    event: String,
    selector: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CompilerRefBinding {
    index: usize,
    identifier: String,
    selector: String,
}

#[derive(Debug, Clone, Serialize)]
struct RuntimeRefBinding {
    index: usize,
    state_index: usize,
    selector: String,
}

fn main() {
    if env::args().skip(1).any(|arg| arg == "--version") {
        println!("{}", resolve_bundler_version());
        return;
    }
    if let Err(err) = run() {
        eprintln!("[zenith-bundler] {}", err);
        process::exit(1);
    }
}

fn resolve_bundler_version() -> String {
    if let Some(version) = option_env!("ZENITH_TRAIN_VERSION") {
        let trimmed = version.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    env!("CARGO_PKG_VERSION").to_string()
}

fn run() -> Result<(), String> {
    let out_dir = parse_out_dir()?;
    let out_dir_tmp = out_dir.with_extension("tmp"); // dist_tmp

    // Clean temp dir if exists
    if out_dir_tmp.exists() {
        fs::remove_dir_all(&out_dir_tmp)
            .map_err(|e| format!("failed to clean temp dir '{}': {e}", out_dir_tmp.display()))?;
    }
    fs::create_dir_all(&out_dir_tmp)
        .map_err(|e| format!("failed to create temp dir '{}': {e}", out_dir_tmp.display()))?;

    let mut stdin_payload = String::new();
    io::stdin()
        .read_to_string(&mut stdin_payload)
        .map_err(|e| format!("failed to read stdin: {e}"))?;

    if stdin_payload.trim().is_empty() {
        return Err("stdin payload is empty".into());
    }

    // 1. Parse Batch Input
    // Supports both single object (legacy/test) and array (batch)
    let inputs: Vec<BundlerInput> = if stdin_payload.trim().starts_with('[') {
        serde_json::from_str(&stdin_payload).map_err(|e| format!("invalid batch JSON: {e}"))?
    } else {
        let single: BundlerInput =
            serde_json::from_str(&stdin_payload).map_err(|e| format!("invalid input JSON: {e}"))?;
        vec![single]
    };

    if inputs.is_empty() {
        return Ok(());
    }

    let template_assets = template_bridge::render_assets(&template_bridge::RenderAssetsRequest {
        manifest_json: "{}".to_string(),
        runtime_import: String::new(),
        core_import: String::new(),
    })?;
    let expected_ir_version = template_assets.ir_version;

    // Validate all inputs
    for input in &inputs {
        validate_payload(input, expected_ir_version)?;
    }

    let router_enabled = inputs.iter().any(|i| i.router);

    // 2. Build Global Graph (In-Memory)
    // We must deduplicate modules and edges across all pages to form a single authority.
    let global_graph = build_global_graph(&inputs)?;
    let global_graph_hash = compute_global_graph_hash(&global_graph);
    let project_root = env::current_dir()
        .map_err(|e| format!("failed to resolve current working directory: {e}"))?;
    let project_root = fs::canonicalize(&project_root).map_err(|e| {
        format!(
            "failed to canonicalize current working directory '{}': {e}",
            project_root.display()
        )
    })?;

    let mut processed_htmls = Vec::with_capacity(inputs.len());
    for input in &inputs {
        let html = ensure_document_html(&input.ir.html);
        let (_processed_css, html_stripped) =
            zenith_bundler::utils::process_css(&input.ir.style_blocks, &html)
                .map_err(|e| format!("CSS processing failed for {}: {e}", input.route))?;

        let html_for_emission = if input.ir.style_blocks.is_empty() {
            // Preserve existing anchor behavior for pages without compiler-emitted style blocks.
            html
        } else {
            html_stripped
        };
        processed_htmls.push(html_for_emission);
    }
    let final_css_content = build_css_bundle(&inputs, &project_root)?;

    // 3b. Vendor Bundling (Rolldown)
    // We must run this before emitting JS assets so we can rewrite imports.
    let vendor_result = {
        let rt = tokio::runtime::Runtime::new().expect("failed to init tokio runtime");
        rt.block_on(vendor::bundle_vendor(&inputs, &out_dir_tmp))
            .map_err(|e| format!("Vendor bundling failed: {}", e))?
    };

    let vendor_map = if let Some(meta) = &vendor_result {
        println!(
            "[zenith] Vendor bundle: {} ({} specifiers matched)",
            meta.filename,
            meta.specifiers.len()
        );
        let replacement = format!("/assets/{}", meta.filename);
        meta.specifiers
            .iter()
            .map(|s| (s.clone(), replacement.clone()))
            .collect::<BTreeMap<_, _>>()
    } else {
        BTreeMap::new()
    };

    // Rewrite Imports in Inputs (if vendor bundle exists)
    let mut inputs = inputs; // Shadow as mutable for rewriting
    for input in &mut inputs {
        for block in &mut input.ir.hoisted.code {
            *block = strip_zen_import_statements(&strip_css_import_statements(block));
        }
    }
    if !vendor_map.is_empty() {
        for input in &mut inputs {
            // Rewrite modules (source code)
            for module in &mut input.ir.modules {
                if !is_browser_js_module(&module.id) {
                    continue;
                }
                module.source =
                    zenith_bundler::utils::rewrite_js_imports_ast(&module.source, &vendor_map)
                        .map_err(|e| format!("Rewrite failed for module {}: {}", module.id, e))?;
            }
            // Rewrite component scripts (compiled components)
            for script in input.ir.components_scripts.values_mut() {
                script.code =
                    zenith_bundler::utils::rewrite_js_imports_ast(&script.code, &vendor_map)
                        .map_err(|e| {
                            format!(
                                "Rewrite failed for component script {}: {}",
                                script.hoist_id, e
                            )
                        })?;
                for import_line in &mut script.imports {
                    if let Some(spec) = extract_static_import_specifier(import_line) {
                        if let Some(replacement) = vendor_map.get(&spec) {
                            *import_line =
                                rewrite_import_specifier_literal(import_line, &spec, replacement)?;
                        }
                    }
                }
            }
            // Rewrite hoisted code blocks that are spliced directly into page entry assets.
            for (index, block) in input.ir.hoisted.code.iter_mut().enumerate() {
                *block = zenith_bundler::utils::rewrite_js_imports_ast(block, &vendor_map)
                    .map_err(|e| {
                        let preview: String = block.chars().take(220).collect();
                        format!(
                            "Rewrite failed for hoisted block #{index} ({route}): {e}\n--- hoisted preview ---\n{preview}",
                            route = input.route
                        )
                    })?;
            }
            // Rewrite imports list (for virtual entry generation)
            for imp in &mut input.ir.imports {
                if let Some(replacement) = vendor_map.get(&imp.spec) {
                    imp.spec = replacement.clone();
                }
            }
            // Rewrite hoisted imports
            for entry in &mut input.ir.hoisted.imports {
                if let Some(spec) = extract_static_import_specifier(entry) {
                    if let Some(replacement) = vendor_map.get(&spec) {
                        *entry = rewrite_import_specifier_literal(entry, &spec, replacement)?;
                        continue;
                    }
                }
                if let Some(replacement) = vendor_map.get(entry) {
                    *entry = replacement.clone();
                }
            }
        }
    }

    // Emit Global CSS
    let css_hash = stable_hash_8(&final_css_content);
    let css_rel = format!("assets/styles.{}.css", css_hash);
    let css_path = out_dir_tmp.join(&css_rel);
    write_file(&css_path, &final_css_content)?;

    // 4. Generate Runtime & Assets
    let runtime_rel = ensure_runtime_asset(&out_dir_tmp, &template_assets.runtime_source)?;
    let runtime_import_spec = runtime_import_specifier(&runtime_rel)?;
    let (core_rel, core_hash) = ensure_core_asset(&out_dir_tmp, &runtime_rel)?;
    let core_import_spec = format!("/{}", core_rel);

    // Collect all component scripts from inputs
    let mut all_component_scripts = BTreeMap::new();
    for input in &inputs {
        for (id, script) in &input.ir.components_scripts {
            all_component_scripts.insert(id.clone(), script.clone());
        }
    }
    let module_registry = build_module_registry(&inputs)?;

    // Emit Components
    let component_assets = emit_component_assets(
        &out_dir_tmp,
        &all_component_scripts,
        &runtime_import_spec,
        &module_registry,
        &core_import_spec,
    )?;

    // 5. Generate Manifest Struct (In-Memory)
    let mut manifest_chunks = BTreeMap::new();
    let mut server_runtime_routes = BTreeSet::new();
    let mut page_assets = Vec::new();

    // Process each page
    for (input, html_stripped) in inputs.iter().zip(processed_htmls) {
        let (markers, events) = if input.ir.marker_bindings.is_empty() {
            derive_binding_tables(&input.ir)?
        } else {
            (
                input.ir.marker_bindings.clone(),
                input.ir.event_bindings.clone(),
            )
        };

        // SSR Data
        let prerender_ssr_data = if input.ir.prerender {
            if let Some(existing) = &input.ir.ssr_data {
                Some(existing.clone())
            } else {
                run_server_script(&input.ir.server_script, &BTreeMap::new())?
            }
        } else {
            input.ir.ssr_data.clone()
        };

        let js = generate_entry_js(
            &input.ir,
            &runtime_import_spec,
            &markers,
            &events,
            &component_assets,
            &input.route,
            prerender_ssr_data.as_ref(),
            &global_graph_hash,
            router_enabled,
        )?;

        // Hash depends on Global Graph Hash + Content
        let js_hash = stable_hash_8(&js);
        let js_rel = format!(
            "assets/{}.{}.js",
            sanitize_route_to_token(&input.route),
            js_hash
        );

        if has_runtime_zen_reference(&js) {
            return Err(format!(
                "Runtime graph purity violation: page bundle for route '{}' contains a .zen module specifier",
                input.route
            ));
        }

        let js_path = out_dir_tmp.join(&js_rel);
        write_file(&js_path, &js)?;

        manifest_chunks.insert(input.route.clone(), format!("/{}", js_rel));
        if input.ir.server_script.is_some() && !input.ir.prerender {
            server_runtime_routes.insert(input.route.clone());
        }
        page_assets.push((
            input.route.clone(),
            html_stripped.clone(),
            js_rel,
            input.ir.expressions.clone(),
            input
                .ir
                .server_script
                .as_ref()
                .map(|script| script.source.clone()),
            input
                .ir
                .server_script
                .as_ref()
                .and_then(|script| script.source_path.clone()),
            input.ir.prerender,
            prerender_ssr_data.clone(),
            input.ir.has_guard,
            input.ir.has_load,
            input.ir.guard_module_ref.clone(),
            input.ir.load_module_ref.clone(),
        ));
    }

    // 6. Generate Router & Manifest
    let mut router_rel_path = None;
    let manifest_hash = compute_manifest_hash(&global_graph_hash, &core_hash, &manifest_chunks);
    let manifest_json_str = {
        let manifest = Manifest {
            entry: format!("/{}", runtime_rel),
            vendor: vendor_result
                .as_ref()
                .map(|m| format!("/assets/{}", m.filename)),
            css: format!("/{}", css_rel),
            core: format!("/{}", core_rel),
            chunks: manifest_chunks.clone(),
            server_routes: server_runtime_routes.clone(),
            hash: manifest_hash.clone(),
            router: None, // Circular dependency if we hash router here. Router needs manifest.
        };
        // We serialize WITHOUT router first to generate the manifest for injection.
        // Wait, the router needs the manifest.
        // The manifest contains the chunks.
        // The router script is part of the bundle.
        // The MANIFEST file should contain the router path.
        // This is a cycle: Router -> needs Manifest -> needs Router Path -> needs Router Hash -> needs Router Content -> needs Manifest.
        // BREAK THE CYCLE:
        // 1. Generate Manifest (chunks, css, entry).
        // 2. Inject Manifest into Router.
        // 3. Hash Router.
        // 4. Update Manifest with Router Path.
        // 5. Write Manifest.
        serde_json::to_string(&manifest).expect("failed to serialize partial manifest")
    };

    if router_enabled {
        let rendered_assets =
            template_bridge::render_assets(&template_bridge::RenderAssetsRequest {
                manifest_json: manifest_json_str.clone(),
                runtime_import: format!("/{}", runtime_rel),
                core_import: format!("/{}", core_rel),
            })?;
        let router_source = rendered_assets.router_source;

        if has_runtime_zen_reference(&router_source) {
            return Err(
                "Runtime graph purity violation: router bundle contains a .zen module specifier"
                    .into(),
            );
        }
        if router_source.contains("zenith:") {
            return Err(
                "Runtime graph purity violation: router bundle contains a zenith:* specifier"
                    .into(),
            );
        }

        let router_hash = stable_hash_8(&router_source);
        let r_rel = format!("assets/router.{}.js", router_hash);
        router_rel_path = Some(format!("/{}", r_rel));
        write_file(&out_dir_tmp.join(&r_rel), &router_source)?;
    }

    verify_emitted_js_imports(&out_dir_tmp)?;

    // Final Manifest with Router
    let final_manifest = Manifest {
        entry: format!("/{}", runtime_rel),
        vendor: vendor_result
            .as_ref()
            .map(|m| format!("/assets/{}", m.filename)),
        css: format!("/{}", css_rel),
        core: format!("/{}", core_rel),
        chunks: manifest_chunks,
        server_routes: server_runtime_routes,
        hash: manifest_hash,
        router: router_rel_path.clone(),
    };
    let final_manifest_json = serde_json::to_string_pretty(&final_manifest)
        .map_err(|e| format!("failed to serialize manifest: {e}"))?;
    write_file(&out_dir_tmp.join("manifest.json"), &final_manifest_json)?;

    let mut router_manifest = RouterManifest::default();
    for (
        route,
        _html_tpl,
        js_rel,
        expressions,
        server_script,
        server_script_path,
        prerender,
        ssr_data,
        has_guard,
        has_load,
        guard_module_ref,
        load_module_ref,
    ) in &page_assets
    {
        let output = format!(
            "/{}",
            route_to_output_path(route)
                .to_string_lossy()
                .replace('\\', "/")
        );
        router_manifest.routes.push(RouterRouteEntry {
            path: route.clone(),
            output,
            html: route.clone(),
            expressions: expressions.clone(),
            page_asset: Some(js_rel.clone()),
            server_script: server_script.clone(),
            server_script_path: server_script_path.clone(),
            prerender: *prerender,
            ssr_data: ssr_data.clone(),
            has_guard: *has_guard,
            has_load: *has_load,
            guard_module_ref: guard_module_ref.clone(),
            load_module_ref: load_module_ref.clone(),
        });
    }
    router_manifest.routes.sort_by(|a, b| a.path.cmp(&b.path));
    let router_manifest_json = serde_json::to_string(&router_manifest)
        .map_err(|e| format!("failed to serialize router manifest: {e}"))?;
    write_file(
        &out_dir_tmp.join("assets/router-manifest.json"),
        &router_manifest_json,
    )?;

    // 7. Write HTML Files (Injecting Manifest Paths)
    for (
        route,
        html_tpl,
        js_rel,
        _expressions,
        _server_script,
        _server_script_path,
        _prerender,
        _ssr_data,
        _has_guard,
        _has_load,
        _guard_module_ref,
        _load_module_ref,
    ) in page_assets
    {
        let mut html = inject_stylesheet_link_once(&html_tpl, &css_rel, &route)?;

        if let Some(r_path) = &router_rel_path {
            // Router mode: single module entry point in HTML.
            html = inject_script_once(&html, r_path, "data-zx-router");
        } else {
            // Non-router mode: page module is the single module entry point.
            html = inject_script_once(&html, &format!("/{}", js_rel), "data-zx-page");
        }

        let module_script_count = html.matches("<script type=\"module\"").count();
        if module_script_count != 1 {
            return Err(format!(
                "Route '{}' must contain exactly one module entry script, found {}",
                route, module_script_count
            ));
        }
        let stylesheet_link_count = html.matches("rel=\"stylesheet\"").count();
        if stylesheet_link_count != 1 {
            return Err(format!(
                "Route '{}' must contain exactly one stylesheet link, found {}",
                route, stylesheet_link_count
            ));
        }

        // Output HTML
        let html_rel = route_to_output_path(&route);
        let html_path = out_dir_tmp.join(html_rel);
        write_file(&html_path, &html)?;
    }

    // 8. Atomic Swap
    // dist_tmp -> dist
    if out_dir.exists() {
        fs::remove_dir_all(&out_dir)
            .map_err(|e| format!("failed to remove existing out_dir: {e}"))?;
    }
    fs::rename(&out_dir_tmp, &out_dir)
        .map_err(|e| format!("failed to rename temp dir to output dir: {e}"))?;

    Ok(())
}

// Data Structures

#[derive(Debug, Serialize)]
struct Manifest {
    entry: String,
    vendor: Option<String>,
    router: Option<String>,
    css: String,
    core: String,
    hash: String,
    chunks: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    server_routes: BTreeSet<String>,
}

struct GlobalGraph {
    nodes: Vec<CompilerGraphNode>,
    edges: Vec<String>,
}

fn build_global_graph(inputs: &[BundlerInput]) -> Result<GlobalGraph, String> {
    let mut nodes = BTreeMap::new(); // hoist_id -> node
    let mut edges = Vec::new();

    for input in inputs {
        for node in &input.ir.graph_nodes {
            nodes.entry(node.hoist_id.clone()).or_insert(node.clone());
        }
        edges.extend(input.ir.graph_edges.clone());
    }

    // Topo Sort / Deterministic Order
    // For now, since we just need hash stability and emission list,
    // sorting by hoist_id keys is sufficient for current architecture.
    // Real topo-sort would require adjacency list, but since modules are self-contained
    // and just need consistent hashing, sorting keys works.
    let mut sorted_nodes: Vec<CompilerGraphNode> = nodes.into_values().collect();
    sorted_nodes.sort_by(|a, b| a.hoist_id.cmp(&b.hoist_id));

    edges.sort();
    edges.dedup();

    Ok(GlobalGraph {
        nodes: sorted_nodes,
        edges,
    })
}

fn compute_global_graph_hash(graph: &GlobalGraph) -> String {
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

fn build_module_registry(
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

fn write_file(path: &PathBuf, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create dir: {e}"))?;
    }
    fs::write(path, content).map_err(|e| format!("failed to write file '{}': {e}", path.display()))
}

fn sanitize_route_to_token(route: &str) -> String {
    let s = route.replace('/', "_");
    if s == "_" {
        return "index".to_string();
    }
    let trimmed = s.trim_start_matches('_');
    let mut normalized = String::with_capacity(trimmed.len());
    let mut last_was_underscore = false;

    for ch in trimmed.chars() {
        let safe = if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            ch
        } else {
            '_'
        };

        if safe == '_' {
            if last_was_underscore {
                continue;
            }
            last_was_underscore = true;
        } else {
            last_was_underscore = false;
        }

        normalized.push(safe);
    }

    let cleaned = normalized.trim_matches('_');
    if cleaned.is_empty() {
        "index".to_string()
    } else {
        cleaned.to_string()
    }
}

fn parse_out_dir() -> Result<PathBuf, String> {
    let mut out_dir: Option<PathBuf> = None;
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out-dir" => {
                let value = args
                    .next()
                    .ok_or_else(|| "missing value for --out-dir".to_string())?;
                out_dir = Some(PathBuf::from(value));
            }
            _ => {
                return Err(format!(
                    "unknown argument '{arg}'. usage: zenith-bundler --out-dir <path>"
                ));
            }
        }
    }

    out_dir.ok_or_else(|| "required flag missing: --out-dir <path>".to_string())
}

fn validate_payload(payload: &BundlerInput, expected_ir_version: u32) -> Result<(), String> {
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

fn ensure_document_html(fragment_or_doc: &str) -> String {
    // Diagnostic: warn if PascalCase component tags survived expansion
    let pascal_re = regex::Regex::new(r"<([A-Z][a-zA-Z0-9]+)[\s/>]").unwrap();
    for cap in pascal_re.captures_iter(fragment_or_doc) {
        eprintln!(
            "[zenith-bundler] WARNING: unresolved component tag <{}> in HTML emission. \
             The CLI did not expand all component references.",
            &cap[1]
        );
    }

    let lower = fragment_or_doc.to_ascii_lowercase();
    if lower.contains("<html") {
        if lower.contains("<!doctype") {
            return fragment_or_doc.to_string();
        }
        return format!("<!DOCTYPE html>{fragment_or_doc}");
    }
    format!(
        "<!DOCTYPE html><html><head></head><body>{}</body></html>",
        fragment_or_doc
    )
}

fn inject_script_once(html: &str, script_src: &str, marker_attr: &str) -> String {
    if html.contains(script_src) {
        return html.to_string();
    }
    let script_tag =
        format!("<script type=\"module\" src=\"{script_src}\" {marker_attr}></script>");
    if html.contains("</body>") {
        return html.replacen("</body>", &format!("{script_tag}</body>"), 1);
    }
    format!("{html}{script_tag}")
}

fn inject_stylesheet_link_once(html: &str, css_rel: &str, route: &str) -> Result<String, String> {
    let anchor = "<!-- ZENITH_STYLES_ANCHOR -->";
    let css_link = format!("<link href=\"/{}\" rel=\"stylesheet\">", css_rel);
    let anchor_count = html.matches(anchor).count();

    let updated = match anchor_count {
        1 => html.replacen(anchor, &css_link, 1),
        0 => {
            let stylesheet_count = count_stylesheet_links(html)?;
            match stylesheet_count {
                1 => replace_single_stylesheet_link(html, &css_link)?,
                0 => {
                    // Fallback: anchor was stripped by compiler (HTML comments are not preserved
                    // in AST). Inject the stylesheet link into <head> or append before </head>.
                    if html.contains("</head>") {
                        html.replacen("</head>", &format!("{}\n</head>", css_link), 1)
                    } else if html.contains("<head>") {
                        html.replacen("<head>", &format!("<head>\n{}", css_link), 1)
                    } else {
                        // Fragment-only case: prepend the link
                        format!("{}\n{}", css_link, html)
                    }
                }
                _ => {
                    return Err(format!(
                        "Route '{}' must contain exactly one ZENITH_STYLES_ANCHOR or one stylesheet link before emission, found anchors={} stylesheets={}",
                        route, anchor_count, stylesheet_count
                    ));
                }
            }
        }
        _ => {
            return Err(format!(
                "Route '{}' must contain exactly one ZENITH_STYLES_ANCHOR before emission, found {}",
                route, anchor_count
            ));
        }
    };

    if updated.contains(anchor) {
        return Err(format!(
            "Route '{}' retained ZENITH_STYLES_ANCHOR after stylesheet injection",
            route
        ));
    }
    let stylesheet_count = count_stylesheet_links(&updated)?;
    if stylesheet_count != 1 {
        return Err(format!(
            "Route '{}' must contain exactly one stylesheet link, found {}",
            route, stylesheet_count
        ));
    }
    if updated.matches(&format!("href=\"/{}\"", css_rel)).count() != 1 {
        return Err(format!(
            "Route '{}' must contain exactly one stylesheet link for '{}'",
            route, css_rel
        ));
    }

    Ok(updated)
}

fn count_stylesheet_links(html: &str) -> Result<usize, String> {
    let stylesheet_re = Regex::new(r#"(?i)<link\b[^>]*\brel\s*=\s*['"]stylesheet['"][^>]*>"#)
        .map_err(|e| format!("failed to compile stylesheet link regex: {e}"))?;
    Ok(stylesheet_re.find_iter(html).count())
}

fn replace_single_stylesheet_link(html: &str, replacement: &str) -> Result<String, String> {
    let stylesheet_re = Regex::new(r#"(?i)<link\b[^>]*\brel\s*=\s*['"]stylesheet['"][^>]*>"#)
        .map_err(|e| format!("failed to compile stylesheet link rewrite regex: {e}"))?;

    let mut replaced = false;
    let rewritten = stylesheet_re
        .replace_all(html, |captures: &regex::Captures| {
            if replaced {
                captures
                    .get(0)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default()
            } else {
                replaced = true;
                replacement.to_string()
            }
        })
        .into_owned();

    if !replaced {
        return Err("expected existing stylesheet link to rewrite".to_string());
    }
    Ok(rewritten)
}

fn route_to_output_path(route_path: &str) -> PathBuf {
    if route_path == "/" {
        return PathBuf::from("index.html");
    }

    let mut out = PathBuf::new();
    for segment in route_path.split('/').filter(|s| !s.is_empty()) {
        if let Some(name) = segment.strip_prefix(':') {
            // Keep dynamic routes distinct from their static siblings.
            // Example: /blog/:slug -> dist/blog/__param_slug/index.html
            out.push(format!("__param_{}", name));
            continue;
        }
        if let Some(raw_name) = segment.strip_prefix('*') {
            let name = raw_name.strip_suffix('?').unwrap_or(raw_name);
            out.push(format!("__splat_{}", name));
            continue;
        }
        out.push(segment);
    }
    out.push("index.html");
    out
}

fn stable_hash_8(content: &str) -> String {
    let mut hash: i32 = 0;
    for byte in content.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    let normalized = hash.wrapping_abs() as u32;
    format!("{normalized:08x}")
}

fn compute_manifest_hash(
    global_graph_hash: &str,
    core_hash: &str,
    chunks: &BTreeMap<String, String>,
) -> String {
    let mut seed = String::new();
    seed.push_str(global_graph_hash);
    seed.push('\n');
    seed.push_str(core_hash);
    seed.push('\n');
    for chunk_path in chunks.values() {
        seed.push_str(chunk_path);
        seed.push('\n');
    }
    sha256_hex(seed.as_bytes())
}

fn has_runtime_zen_reference(js: &str) -> bool {
    let specifier_re = Regex::new(
        r#"(?m)(?:from\s+['"][^'"]*\.zen['"]|import\s*\(\s*['"][^'"]*\.zen['"]\s*\)|require\s*\(\s*['"][^'"]*\.zen['"]\s*\))"#,
    )
    .expect("valid .zen specifier regex");
    specifier_re.is_match(js)
}

fn verify_emitted_js_imports(out_dir: &PathBuf) -> Result<(), String> {
    let assets_dir = out_dir.join("assets");
    if !assets_dir.exists() {
        return Ok(());
    }

    for file in list_js_assets(&assets_dir)? {
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
                out_dir.join(spec.trim_start_matches('/'))
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

fn list_js_assets(dir: &PathBuf) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    let mut stack = vec![dir.clone()];

    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("failed to read assets dir '{}': {e}", current.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| {
                format!(
                    "failed to read assets entry in '{}': {e}",
                    current.display()
                )
            })?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("js"))
                .unwrap_or(false)
            {
                out.push(path);
            }
        }
    }

    out.sort();
    Ok(out)
}

fn recompute_graph_hash(payload: &BundlerInput) -> String {
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

fn run_server_script(
    server_script: &Option<CompilerServerScript>,
    params: &BTreeMap<String, String>,
) -> Result<Option<serde_json::Value>, String> {
    let Some(server_script) = server_script else {
        return Ok(None);
    };

    let params_json =
        serde_json::to_string(params).map_err(|e| format!("failed to serialize params: {e}"))?;
    let runner = r#"
import vm from 'node:vm';
const source = process.env.ZENITH_SERVER_SOURCE || '';
const params = JSON.parse(process.env.ZENITH_SERVER_PARAMS || '{}');
const sourcePath = process.env.ZENITH_SERVER_SOURCE_PATH || '';
const requestUrl = process.env.ZENITH_SERVER_REQUEST_URL || 'http://localhost/';
const routePattern = process.env.ZENITH_SERVER_ROUTE_PATTERN || '';
const routeId = process.env.ZENITH_SERVER_ROUTE_ID || routePattern || '';
const routeFile = process.env.ZENITH_SERVER_ROUTE_FILE || sourcePath || '';

const ctx = {
  params: { ...params },
  url: new URL(requestUrl),
  request: new Request(requestUrl, { method: 'GET' }),
  route: {
    id: routeId,
    pattern: routePattern,
    file: routeFile
  }
};

const moduleSource = `${source}\nexport default {` +
  `data: typeof data === 'undefined' ? undefined : data,` +
  `load: typeof load === 'undefined' ? undefined : load,` +
  `ssr_data: typeof ssr_data === 'undefined' ? undefined : ssr_data,` +
  `props: typeof props === 'undefined' ? undefined : props,` +
  `ssr: typeof ssr === 'undefined' ? undefined : ssr,` +
  `prerender: typeof prerender === 'undefined' ? undefined : prerender` +
  `});`;
const context = vm.createContext({
  params: { ...params },
  ctx,
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  URL
});
const mod = new vm.SourceTextModule(moduleSource, {
  context,
  initializeImportMeta(meta) { meta.url = 'zenith:server-script'; }
});
await mod.link((specifier) => {
  throw new Error(`[zenith-bundler] server script imports are not allowed: ${specifier}`);
});
await mod.evaluate();
const namespaceKeys = Object.keys(mod.namespace).filter((key) => key !== 'default');
const allowed = new Set(['data', 'load', 'ssr_data', 'props', 'ssr', 'prerender']);
for (const key of namespaceKeys) {
  if (!allowed.has(key)) {
    throw new Error(`[zenith-bundler] unsupported server export '${key}'`);
  }
}
const exported = mod.namespace.default && typeof mod.namespace.default === 'object'
  ? mod.namespace.default
  : null;
if (!exported) {
  process.stdout.write('null');
  process.exit(0);
}
for (const key of Object.keys(exported)) {
  if (!allowed.has(key)) {
    throw new Error(`[zenith-bundler] unsupported server export '${key}'`);
  }
}
const hasData = Object.prototype.hasOwnProperty.call(exported, 'data') && exported.data !== undefined;
const hasLoad = Object.prototype.hasOwnProperty.call(exported, 'load') && typeof exported.load === 'function';
const hasSsrData = Object.prototype.hasOwnProperty.call(exported, 'ssr_data') && exported.ssr_data !== undefined;
const hasSsr = Object.prototype.hasOwnProperty.call(exported, 'ssr') && exported.ssr !== undefined;
const hasProps = Object.prototype.hasOwnProperty.call(exported, 'props') && exported.props !== undefined;
const hasPrerender = Object.prototype.hasOwnProperty.call(exported, 'prerender') && exported.prerender !== undefined;

try {
  if (hasPrerender && typeof exported.prerender !== 'boolean') {
    throw new Error('[zenith-bundler] prerender export must be a boolean');
  }
  if (hasData && hasLoad) {
    throw new Error('[zenith-bundler] server script cannot export both data and load');
  }
  if (hasData && (hasSsrData || hasSsr || hasProps)) {
    throw new Error('[zenith-bundler] data cannot be combined with legacy ssr_data/ssr/props exports');
  }
  if (hasLoad && (hasSsrData || hasSsr || hasProps)) {
    throw new Error('[zenith-bundler] load(ctx) cannot be combined with legacy ssr_data/ssr/props exports');
  }
  if (hasSsrData && hasSsr) {
    throw new Error('[zenith-bundler] server script cannot export both ssr_data and ssr');
  }
  if (hasLoad && exported.load.length !== 1) {
    throw new Error('[zenith-bundler] load(ctx) must accept exactly one argument');
  }

  let payload = null;
  if (hasLoad) {
    payload = await exported.load(ctx);
  } else if (hasData) {
    payload = exported.data;
  } else if (hasSsrData) {
    payload = exported.ssr_data;
  } else if (hasSsr) {
    payload = exported.ssr;
  }

  if (hasProps) {
    if (payload === null || payload === undefined) {
      payload = { props: exported.props };
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload = { ...payload, props: exported.props };
    } else {
      throw new Error('[zenith-bundler] `props` export requires object-compatible payload');
    }
  }

  assertJsonSerializable(payload, '$', new Set());
  process.stdout.write(JSON.stringify(payload === undefined ? null : payload));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({
    __zenith_error: {
      status: 500,
      code: 'LOAD_FAILED',
      message
    }
  }));
}

function assertJsonSerializable(value, path, seen) {
  if (value === null || value === undefined) {
    return;
  }
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: non-finite number`);
    }
    return;
  }
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: ${t}`);
  }
  if (t !== 'object') {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: ${t}`);
  }
  if (seen.has(value)) {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: circular reference`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertJsonSerializable(value[i], `${path}[${i}]`, seen);
      }
      return;
    }
    if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp || value instanceof URL) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: unsupported instance`);
    }
    const proto = Object.getPrototypeOf(value);
    const ctor = proto && proto.constructor;
    const isPlainObject = proto === null || proto === Object.prototype || (typeof ctor === 'function' && ctor.name === 'Object');
    if (!isPlainObject) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: class instance`);
    }
    for (const key of Object.keys(value)) {
      assertJsonSerializable(value[key], `${path}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}
"#;

    let result = Command::new("node")
        .arg("--experimental-vm-modules")
        .arg("--input-type=module")
        .arg("-e")
        .arg(runner)
        .env("ZENITH_SERVER_SOURCE", &server_script.source)
        .env("ZENITH_SERVER_PARAMS", params_json)
        .env(
            "ZENITH_SERVER_SOURCE_PATH",
            server_script.source_path.clone().unwrap_or_default(),
        )
        .env("ZENITH_SERVER_REQUEST_URL", "http://localhost/")
        .env("ZENITH_SERVER_ROUTE_PATTERN", "")
        .env(
            "ZENITH_SERVER_ROUTE_FILE",
            server_script.source_path.clone().unwrap_or_default(),
        )
        .env("ZENITH_SERVER_ROUTE_ID", "")
        .output()
        .map_err(|e| format!("failed to run server script runner: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!(
            "server script execution failed (status {}): {}",
            result.status, stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(None);
    }

    let value: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid server script JSON: {e}"))?;
    if !value.is_object() {
        return Err("server script must resolve to an object payload".into());
    }
    validate_server_payload(&value, "ssr_data")?;
    Ok(Some(value))
}

fn validate_server_payload(value: &serde_json::Value, path: &str) -> Result<(), String> {
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

fn derive_binding_tables(
    ir: &CompilerIr,
) -> Result<(Vec<MarkerBinding>, Vec<EventBinding>), String> {
    let expression_count = ir.expressions.len();
    if expression_count == 0 {
        return Ok((Vec::new(), Vec::new()));
    }

    let mut marker_slots: Vec<Option<MarkerBinding>> = vec![None; expression_count];
    let mut event_bindings = Vec::new();

    let attr_re = Regex::new(r#"data-zx-([A-Za-z0-9_-]+)=(?:"([^"]+)"|'([^']+)'|([^\s>"']+))"#)
        .map_err(|e| format!("failed to compile binding regex: {e}"))?;

    for captures in attr_re.captures_iter(&ir.html) {
        let attr_name = captures
            .get(1)
            .map(|m| m.as_str())
            .ok_or_else(|| "failed to parse data-zx attribute name".to_string())?;
        let raw_value = captures
            .get(2)
            .or_else(|| captures.get(3))
            .or_else(|| captures.get(4))
            .map(|m| m.as_str())
            .unwrap_or("");

        if attr_name == "e" {
            for part in raw_value.split_whitespace() {
                let index = parse_expression_index(part, expression_count, "data-zx-e")?;
                insert_marker(
                    &mut marker_slots,
                    MarkerBinding {
                        index,
                        kind: MarkerKind::Text,
                        selector: format!(r#"[data-zx-e~="{index}"]"#),
                        attr: None,
                    },
                )?;
            }
            continue;
        }

        if attr_name == "c" {
            continue;
        }

        if let Some(event_name) = attr_name.strip_prefix("on-") {
            let index = parse_expression_index(raw_value, expression_count, "data-zx-on-*")?;
            let selector = format!(r#"[data-zx-on-{event_name}="{index}"]"#);
            insert_marker(
                &mut marker_slots,
                MarkerBinding {
                    index,
                    kind: MarkerKind::Event,
                    selector: selector.clone(),
                    attr: None,
                },
            )?;
            event_bindings.push(EventBinding {
                index,
                event: event_name.to_string(),
                selector,
            });
            continue;
        }

        let index = parse_expression_index(raw_value, expression_count, "data-zx-*")?;
        insert_marker(
            &mut marker_slots,
            MarkerBinding {
                index,
                kind: MarkerKind::Attr,
                selector: format!(r#"[data-zx-{attr_name}="{index}"]"#),
                attr: Some(attr_name.to_string()),
            },
        )?;
    }

    let mut markers = Vec::with_capacity(expression_count);
    for (index, marker) in marker_slots.into_iter().enumerate() {
        if let Some(binding) = marker {
            markers.push(binding);
            continue;
        }
        return Err(format!(
            "marker/expression mismatch: missing marker for expression index {index}"
        ));
    }

    Ok((markers, event_bindings))
}

fn parse_expression_index(
    raw: &str,
    expression_count: usize,
    context: &str,
) -> Result<usize, String> {
    let parsed = raw
        .parse::<usize>()
        .map_err(|_| format!("invalid expression index '{raw}' in {context}"))?;

    if parsed >= expression_count {
        return Err(format!(
            "out-of-bounds expression index {parsed} in {context}; expression count is {expression_count}"
        ));
    }

    Ok(parsed)
}

fn insert_marker(slots: &mut [Option<MarkerBinding>], marker: MarkerBinding) -> Result<(), String> {
    let index = marker.index;

    if index >= slots.len() {
        return Err(format!(
            "marker index {} out of bounds; marker slots length is {}",
            index,
            slots.len()
        ));
    }

    if slots[index].is_some() {
        return Err(format!(
            "duplicate marker index {} detected while deriving binding tables",
            index
        ));
    }

    slots[index] = Some(marker);
    Ok(())
}

fn runtime_import_specifier(runtime_rel: &str) -> Result<String, String> {
    let runtime_path = PathBuf::from(runtime_rel);
    let file_name = runtime_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("invalid runtime asset path '{runtime_rel}'"))?;
    Ok(format!("./{file_name}"))
}

fn ensure_runtime_asset(out_dir: &PathBuf, runtime_js: &str) -> Result<String, String> {
    if has_runtime_zen_reference(runtime_js) {
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
    let runtime_rel = format!("assets/runtime.{runtime_hash}.js");
    let runtime_path = out_dir.join(&runtime_rel);

    if !runtime_path.exists() {
        if let Some(parent) = runtime_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "failed to create runtime asset dir '{}': {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&runtime_path, runtime_js).map_err(|e| {
            format!(
                "failed to write runtime asset '{}': {e}",
                runtime_path.display()
            )
        })?;
    }

    Ok(runtime_rel)
}

fn ensure_core_asset(out_dir: &PathBuf, runtime_rel: &str) -> Result<(String, String), String> {
    let runtime_spec = runtime_import_specifier(runtime_rel)?;
    let core_js = generate_core_module_js(&runtime_spec);
    let core_hash = stable_hash_8(&core_js);
    let core_rel = format!("assets/core.{core_hash}.js");
    let core_path = out_dir.join(&core_rel);

    if !core_path.exists() {
        if let Some(parent) = core_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "failed to create core asset dir '{}': {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&core_path, core_js)
            .map_err(|e| format!("failed to write core asset '{}': {e}", core_path.display()))?;
    }

    Ok((core_rel, core_hash))
}

fn emit_component_assets(
    out_dir: &PathBuf,
    components: &BTreeMap<String, CompilerComponentScript>,
    runtime_import_spec: &str,
    module_registry: &BTreeMap<String, CompilerModule>,
    core_import_spec: &str,
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
                // Component/template imports are compile-time only and should not leak into runtime assets.
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
                // Absolute emitted-asset imports (for example vendor bundle paths) are already finalized.
                module_source.push_str(import_line_trimmed);
                module_source.push('\n');
                continue;
            }

            let target_module_id = resolve_module_id_for_spec(module_registry, &owner_module_id, &spec)
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
                // Already points at an emitted asset path (for example /assets/vendor.<hash>.js).
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
        let rel = format!(
            "assets/component.{}.{}.js",
            sanitize_asset_token(hoist_id),
            module_hash
        );
        let path = out_dir.join(&rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "failed to create component asset dir '{}': {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&path, module_source)
            .map_err(|e| format!("failed to write component asset '{}': {e}", path.display()))?;

        out.insert(hoist_id.clone(), rel);
    }
    Ok(out)
}

fn emit_helper_module_recursive(
    out_dir: &PathBuf,
    module_registry: &BTreeMap<String, CompilerModule>,
    module_id: &str,
    emitted_helper_assets: &mut BTreeMap<String, String>,
    stack: &mut Vec<String>,
    core_import_spec: &str,
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
                module_id, module_id, stack.join(" -> ")
            ));
        }
        if !is_relative_or_absolute_specifier(&spec) {
            return Err(format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: assets/modules/{}\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                module_id, module_id, stack.join(" -> ")
            ));
        }
        if spec.starts_with('/') {
            // Absolute imports already reference emitted assets and must remain untouched.
            continue;
        }

        let dep_id = resolve_module_id_for_spec(module_registry, module_id, &spec).ok_or_else(|| {
            format!(
                "ERROR: Emission failed - unresolved import\n  unresolved_specifier: {spec}\n  referenced_from_asset: assets/modules/{}\n  originating_module: {}\n  dependency_chain:\n    {} -> {spec}\n  recommended_action: ensure compiler IR includes module {spec} OR inline helper into parent module",
                module_id, module_id, stack.join(" -> ")
            )
        })?;

        emit_helper_module_recursive(
            out_dir,
            module_registry,
            &dep_id,
            emitted_helper_assets,
            stack,
            core_import_spec,
        )?;

        let dep_rel = helper_asset_rel_path(&dep_id)?;
        let dep_spec = format!("/{}", dep_rel.replace('\\', "/"));
        rewritten_source = rewrite_js_import_specifiers(&rewritten_source, &spec, &dep_spec)?;
    }
    stack.pop();

    let rel = helper_asset_rel_path(module_id)?;
    let path = out_dir.join(&rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed to create helper asset dir '{}': {e}",
                parent.display()
            )
        })?;
    }
    fs::write(&path, &rewritten_source)
        .map_err(|e| format!("failed to write helper asset '{}': {e}", path.display()))?;
    emitted_helper_assets.insert(module_id.to_string(), rel.clone());
    Ok(rel)
}

fn helper_asset_rel_path(module_id: &str) -> Result<String, String> {
    let normalized = normalize_module_id(module_id);
    if normalized.starts_with('/') || normalized.contains("../") {
        return Err(format!(
            "invalid helper module id '{}' (path traversal is not allowed)",
            module_id
        ));
    }
    Ok(format!("assets/modules/{normalized}"))
}

fn helper_asset_specifier_from_rel(rel: &str) -> Result<String, String> {
    let rel_assets = rel
        .strip_prefix("assets/")
        .ok_or_else(|| format!("invalid helper asset path '{rel}'"))?;
    Ok(format!("./{}", rel_assets.replace('\\', "/")))
}

fn component_owner_module_id(component_module_id: &str) -> String {
    component_module_id
        .split_once(":script")
        .map(|(base, _)| base.to_string())
        .unwrap_or_else(|| component_module_id.to_string())
}

fn extract_static_import_specifier(import_line: &str) -> Option<String> {
    let re = Regex::new(r#"^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$"#).unwrap();
    re.captures(import_line)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

fn rewrite_import_specifier_literal(
    import_line: &str,
    old_specifier: &str,
    new_specifier: &str,
) -> Result<String, String> {
    let single = format!("'{}'", old_specifier);
    if import_line.contains(&single) {
        return Ok(import_line.replacen(&single, &format!("'{}'", new_specifier), 1));
    }
    let double = format!("\"{}\"", old_specifier);
    if import_line.contains(&double) {
        return Ok(import_line.replacen(&double, &format!("\"{}\"", new_specifier), 1));
    }
    Err(format!(
        "failed to rewrite import specifier '{}' in line '{}'",
        old_specifier, import_line
    ))
}

fn rewrite_js_import_specifiers(
    source: &str,
    old_specifier: &str,
    new_specifier: &str,
) -> Result<String, String> {
    if old_specifier == new_specifier {
        return Ok(source.to_string());
    }

    let escaped = regex::escape(old_specifier);
    let mut updated = source.to_string();
    let mut replaced_any = false;

    let patterns = [
        format!(
            r#"(?m)(\bimport\s+[^'"\n;]*?\s+from\s*['"]){}(['"])"#,
            escaped
        ),
        format!(r#"(?m)(\bimport\s*['"]){}(['"])"#, escaped),
        format!(r#"(?m)(\bimport\s*\(\s*['"]){}(['"]\s*\))"#, escaped),
        format!(
            r#"(?m)(\bexport\s+[^'"\n;]*?\s+from\s*['"]){}(['"])"#,
            escaped
        ),
    ];

    for pattern in patterns {
        let re = Regex::new(&pattern)
            .map_err(|err| format!("failed to compile import rewrite pattern: {err}"))?;
        let next = re
            .replace_all(&updated, |caps: &regex::Captures| {
                format!("{}{}{}", &caps[1], new_specifier, &caps[2])
            })
            .into_owned();
        if next != updated {
            replaced_any = true;
            updated = next;
        }
    }

    if !replaced_any {
        return Err(format!(
            "failed to rewrite import specifier '{}' in module source",
            old_specifier
        ));
    }

    Ok(updated)
}

fn resolve_module_id_for_spec(
    module_registry: &BTreeMap<String, CompilerModule>,
    owner_module_id: &str,
    specifier: &str,
) -> Option<String> {
    let owner = normalize_module_id(owner_module_id);
    let owner_dir = owner.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
    let mut candidates = Vec::new();
    if specifier.starts_with('/') {
        candidates.push(normalize_module_id(specifier.trim_start_matches('/')));
    } else {
        let joined = if owner_dir.is_empty() {
            specifier.to_string()
        } else {
            format!("{owner_dir}/{specifier}")
        };
        candidates.push(normalize_module_id(&joined));
    }

    if let Some(base) = candidates.first().cloned() {
        if !has_module_extension(&base) {
            for ext in ["js", "mjs", "cjs", "ts", "tsx", "jsx", "zen"] {
                candidates.push(format!("{base}.{ext}"));
            }
            for ext in ["js", "mjs", "cjs", "ts", "tsx", "jsx", "zen"] {
                candidates.push(format!("{base}/index.{ext}"));
            }
        }
    }

    candidates
        .into_iter()
        .find(|candidate| module_registry.contains_key(candidate))
}

fn normalize_module_id(raw: &str) -> String {
    let normalized = raw.replace('\\', "/");
    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    segments.join("/")
}

fn has_module_extension(module_id: &str) -> bool {
    let last = module_id.rsplit('/').next().unwrap_or(module_id);
    last.rsplit_once('.')
        .map(|(_, ext)| !ext.is_empty())
        .unwrap_or(false)
}

fn is_relative_or_absolute_specifier(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../") || specifier.starts_with('/')
}

fn is_css_specifier(specifier: &str) -> bool {
    let without_query = specifier.split('?').next().unwrap_or(specifier);
    let without_hash = without_query.split('#').next().unwrap_or(without_query);
    without_hash.ends_with(".css")
}

fn is_browser_js_module(module_id: &str) -> bool {
    let normalized = normalize_module_id(module_id);
    normalized.ends_with(".js")
        || normalized.ends_with(".mjs")
        || normalized.ends_with(".cjs")
        || normalized.ends_with(".jsx")
}

fn strip_css_import_statements(source: &str) -> String {
    let css_import_re = Regex::new(
        r#"(?m)^\s*import(?:\s+[^'"\n;]*?\s+from)?\s*['"][^'"]+\.css(?:[?#][^'"]*)?['"]\s*;?\s*$"#,
    )
    .unwrap();
    css_import_re.replace_all(source, "").to_string()
}

fn strip_zen_import_statements(source: &str) -> String {
    let zen_import_re = Regex::new(
        r#"(?m)^\s*import(?:\s+[^'"\n;]*?\s+from)?\s*['"][^'"]+\.zen(?:[?#][^'"]*)?['"]\s*;?\s*$"#,
    )
    .unwrap();
    zen_import_re.replace_all(source, "").to_string()
}

fn collect_js_import_specifiers(source: &str) -> Vec<String> {
    let static_import_re =
        Regex::new(r#"(?m)\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]"#).unwrap();
    let dynamic_import_re = Regex::new(r#"(?m)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    let export_from_re =
        Regex::new(r#"(?m)\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();

    let mut out = Vec::new();
    for captures in static_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in dynamic_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in export_from_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}

fn collect_dynamic_import_expressions(source: &str) -> Vec<String> {
    let dynamic_import_any_re = Regex::new(r#"(?m)\bimport\s*\(\s*([^)]+?)\s*\)"#).unwrap();
    let mut out = Vec::new();
    for captures in dynamic_import_any_re.captures_iter(source) {
        if let Some(expr) = captures.get(1) {
            let value = expr.as_str().trim().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}

#[derive(Debug, Clone)]
struct CssFragment {
    source_module_id: String,
    order: usize,
    content: String,
}

fn build_css_bundle(inputs: &[BundlerInput], project_root: &Path) -> Result<String, String> {
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

    // Ordering contract: CSS bytes are deterministic by sorted module id, then stable order index.
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
            zenith_bundler::utils::compile_tailwind_entry(project_root, &canonical_path, &content)
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

fn normalize_text_newlines(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_path_for_contract(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_css_bare_import(specifier: &str) -> bool {
    !is_relative_or_absolute_specifier(specifier) && is_css_package_specifier(specifier)
}

fn is_css_package_specifier(specifier: &str) -> bool {
    let normalized = specifier.strip_prefix("npm:").unwrap_or(specifier);
    normalized == "tailwindcss" || normalized.ends_with("/css") || is_css_specifier(normalized)
}

fn strip_import_suffix(specifier: &str) -> String {
    let without_query = specifier.split('?').next().unwrap_or(specifier);
    without_query
        .split('#')
        .next()
        .unwrap_or(without_query)
        .to_string()
}

fn sanitize_asset_token(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn generate_entry_js(
    ir: &CompilerIr,
    runtime_import_spec: &str,
    markers: &[MarkerBinding],
    events: &[EventBinding],
    component_assets: &BTreeMap<String, String>,
    route_pattern: &str,
    ssr_data: Option<&serde_json::Value>,
    global_graph_hash: &str,
    router_enabled: bool,
) -> Result<String, String> {
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
    };

    let markers_json = serde_json::to_string(markers)
        .map_err(|e| format!("failed to serialize marker table: {e}"))?;
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
    js.push_str(&format!("const __zenith_static_ssr_data = {};\n", ssr_json));
    js.push_str("function __zenith_read_ssr_data(staticValue) {\n");
    js.push_str("  const runtimeValue = typeof globalThis === 'object' ? globalThis.__zenith_ssr_data : undefined;\n");
    js.push_str("  if (runtimeValue && typeof runtimeValue === 'object' && !Array.isArray(runtimeValue)) {\n");
    js.push_str("    return runtimeValue;\n");
    js.push_str("  }\n");
    js.push_str("  return staticValue;\n");
    js.push_str("}\n");
    js.push_str("const __zenith_ssr_data = __zenith_read_ssr_data(__zenith_static_ssr_data);\n");
    js.push_str("const data = __zenith_ssr_data;\n");
    js.push_str("const ssr_data = __zenith_ssr_data;\n");
    for block in &ir.hoisted.code {
        let trimmed = block.trim();
        if !trimmed.is_empty() {
            js.push('\n');
            js.push_str(trimmed);
            js.push('\n');
        }
    }
    js.push_str(&format!("\nconst __zenith_markers = {};\n", markers_json));
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
            })
            .collect()
    } else {
        ir.expression_bindings.clone()
    };
    let (expr_fns_js, runtime_expression_bindings) =
        build_expression_fns_and_bindings(&bindings_to_use);
    let expression_bindings_json =
        serde_json::to_string(&runtime_expression_bindings)
            .map_err(|e| format!("failed to serialize expression table: {e}"))?;

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
    js.push_str(&format!(
        "const __zenith_expression_bindings = {};\n",
        expression_bindings_json
    ));
    let (component_imports, components_table) =
        generate_component_bootstrap_js(ir, component_assets)?;
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
    js.push_str("function __zenith_split_path(pathname) {\n");
    js.push_str("  return String(pathname || '/').split('/').filter(Boolean);\n");
    js.push_str("}\n");
    js.push_str("function __zenith_normalize_catch_all(segments) {\n");
    js.push_str("  return segments.filter(Boolean).join('/');\n");
    js.push_str("}\n");
    js.push_str("function __zenith_resolve_params(pattern, pathname) {\n");
    js.push_str("  const patternSegs = __zenith_split_path(pattern);\n");
    js.push_str("  const valueSegs = __zenith_split_path(pathname);\n");
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
    js.push_str("      if (rest.length === 0 && !optionalCatchAll && !rootRequiredCatchAll) {\n");
    js.push_str("        return {};\n");
    js.push_str("      }\n");
    js.push_str("      params[key] = __zenith_normalize_catch_all(rest);\n");
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
    js.push_str(&format!(
        "const __zenith_components = {};\n",
        components_table
    ));
    js.push_str("const __zenith_has_route_html = true;\n");
    js.push_str("function __zenith_apply_route_html(root) {\n");
    js.push_str("  if (typeof __zenith_html !== 'string' || __zenith_html.length === 0) {\n");
    js.push_str("    return;\n");
    js.push_str("  }\n");
    js.push_str("  if (typeof Document === 'undefined' || !(root instanceof Document)) {\n");
    js.push_str("    return;\n");
    js.push_str("  }\n");
    js.push_str("  if (typeof DOMParser === 'undefined') {\n");
    js.push_str("    return;\n");
    js.push_str("  }\n");
    js.push_str("  const parser = new DOMParser();\n");
    js.push_str("  const parsed = parser.parseFromString(__zenith_html, 'text/html');\n");
    js.push_str("  const currentApp = root.getElementById('app');\n");
    js.push_str("  const nextApp = parsed.getElementById('app');\n");
    js.push_str("  if (currentApp && nextApp) {\n");
    js.push_str("    currentApp.replaceWith(nextApp);\n");
    js.push_str("    return;\n");
    js.push_str("  }\n");
    js.push_str("  if (root.body && parsed.body) {\n");
    js.push_str("    root.body.replaceChildren(...parsed.body.children);\n");
    js.push_str("  }\n");
    js.push_str("}\n");
    js.push_str("export function __zenith_mount(root = document, params = {}) {\n");
    js.push_str("  if (__zenith_has_route_html === true) {\n");
    js.push_str("    __zenith_apply_route_html(root);\n");
    js.push_str("  }\n");
    js.push_str("  const __zenith_unmount = hydrate({\n");
    js.push_str("    root,\n");
    js.push_str("    ir_version: __zenith_ir_version,\n");
    js.push_str("    graph_hash: __zenith_graph_hash,\n");
    js.push_str("    expressions: __zenith_expression_bindings,\n");
    js.push_str("    expr_fns: typeof __zenith_expr_fns !== 'undefined' ? __zenith_expr_fns : [],\n");
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
    if !router_enabled {
        js.push_str("const __zenith_initial_path = typeof location === 'object' && typeof location.pathname === 'string'\n");
        js.push_str("  ? location.pathname\n");
        js.push_str("  : '/';\n");
        js.push_str("const __zenith_initial_params = __zenith_resolve_params(__zenith_route_pattern, __zenith_initial_path);\n");
        js.push_str("__zenith_mount(document, __zenith_initial_params);\n");
    }

    Ok(js)
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
fn build_expression_fns_and_bindings(
    bindings: &[CompilerExpressionBinding],
) -> (String, Vec<serde_json::Value>) {
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
            .map(|e| {
                format!(
                    "function(__ctx) {{ const signalMap = __ctx.signalMap; const params = __ctx.params; const props = __ctx.props; const ssrData = __ctx.ssrData; const data = ssrData; const ssr = ssrData; const componentBindings = __ctx.componentBindings; const __ZENITH_INTERNAL_ZENHTML = __ctx.zenhtml; const html = __ctx.zenhtml; return {}; }}",
                    e
                )
            })
            .collect();
        format!("const __zenith_expr_fns = [\n  {}\n];\n", fn_defs.join(",\n  "))
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
                "literal": b.literal
            });
            if let Some(&fi) = fn_index_by_binding.get(&i) {
                obj["fn_index"] = serde_json::json!(fi);
            }
            obj
        })
        .collect();
    (js, runtime_bindings)
}

#[cfg(test)]
mod tests {
    use super::{build_expression_fns_and_bindings, CompilerExpressionBinding};

    #[test]
    fn compiled_expression_bindings_emit_fn_index_and_signal_indices() {
        let bindings = vec![
            CompilerExpressionBinding {
                marker_index: 0,
                signal_index: Some(0),
                signal_indices: vec![0, 2],
                state_index: Some(0),
                component_instance: None,
                component_binding: None,
                literal: Some("count ? \"on\" : \"off\"".to_string()),
                compiled_expr: Some("signalMap.get(0).get() ? \"on\" : \"off\"".to_string()),
            },
            CompilerExpressionBinding {
                marker_index: 1,
                signal_index: None,
                signal_indices: Vec::new(),
                state_index: None,
                component_instance: None,
                component_binding: None,
                literal: Some("props.href".to_string()),
                compiled_expr: None,
            },
        ];

        let (js, runtime_bindings) = build_expression_fns_and_bindings(&bindings);
        assert!(js.contains("const __zenith_expr_fns = ["));
        assert!(js.contains("const signalMap = __ctx.signalMap;"));
        assert_eq!(runtime_bindings[0]["fn_index"], serde_json::json!(0));
        assert_eq!(runtime_bindings[0]["signal_indices"], serde_json::json!([0, 2]));
        assert!(runtime_bindings[1].get("fn_index").is_none());
    }
}

fn generate_component_bootstrap_js(
    ir: &CompilerIr,
    component_assets: &BTreeMap<String, String>,
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
        let module_json = serde_json::to_string(&format!("/{}", module_rel))
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

fn inject_runtime_hook_aliases(component_code: &str) -> String {
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

fn guard_component_bindings(component_code: &str) -> Result<String, String> {
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

fn generate_core_module_js(runtime_import_spec: &str) -> String {
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
