use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;
use regex::Regex;

use output_mode::{finalize_output_root, prepare_output_root, write_file_for_mode, OutputMode};
use serde::{Deserialize, Serialize};
use zenith_bundler::CompilerOutput;
use zenith_compiler::deterministic::sha256_hex;
use zenith_compiler::script::ExtractedStyleBlock;

mod image_materialization;
mod bundler_cli;
mod bundler_css;
mod bundler_contracts;
mod bundler_graph;
mod bundler_emit_assets;
mod bundler_emit_assets_helpers;
mod bundler_emit_assets_imports;
mod bundler_emit_page;
mod bundler_emit_page_tables;
mod bundler_hash;
mod bundler_html_emit;
mod bundler_input;
mod bundler_minify;
mod bundler_page_entry;
mod bundler_paths;
mod bundler_runtime_profile;
mod bundler_server_script;
mod bundler_types;
mod output_mode;
mod page_runtime;
mod template_bridge;
mod vendor;

use bundler_cli::parse_cli_options;
use bundler_graph::{
    build_global_graph, build_module_registry, collect_fast_path_vendor_map,
    compute_global_graph_hash, derive_fast_path_component_assets,
};
use bundler_contracts::{
    has_runtime_zen_reference, validate_payload, verify_emitted_js_imports,
};
use bundler_css::build_css_bundle;
use bundler_hash::{compute_manifest_hash, stable_hash_8};
use bundler_html_emit::{
    ensure_document_html, inject_script_once, inject_stylesheet_link_once, write_file,
};
use bundler_input::read_bundler_inputs_from_stdin;
use bundler_emit_assets::{
    collect_dynamic_import_expressions, collect_js_import_specifiers, component_owner_module_id,
    emit_component_assets, ensure_core_asset, ensure_runtime_asset, extract_static_import_specifier,
    is_browser_js_module, is_css_specifier, is_relative_or_absolute_specifier, normalize_module_id,
    rewrite_import_specifier_literal, strip_css_import_statements, strip_zen_import_statements,
};
use bundler_emit_page::{
    derive_binding_tables, generate_component_bootstrap_js, generate_core_module_js,
    guard_component_bindings, inject_runtime_hook_aliases,
    render_compacted_page_payload_tables_js, runtime_import_specifier,
};
use bundler_minify::{
    maybe_minify_page_for_output, maybe_minify_router_for_output, maybe_minify_runtime_for_output,
};
use bundler_page_entry::generate_entry_js;
use bundler_paths::{
    normalize_path_for_contract, normalize_text_newlines, public_asset_path,
    route_to_output_path, sanitize_asset_token, sanitize_route_to_token, strip_import_suffix,
};
use bundler_runtime_profile::{
    resolve_bundler_version, runtime_presence_required, runtime_profile_for_output,
};
use bundler_server_script::run_server_script;
use bundler_types::*;
use image_materialization::{
    materialize_image_markup_in_build_html, ImageMaterializationEntry, ImageRuntimePayload,
};

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

fn run() -> Result<(), String> {
    let cli_options = parse_cli_options()?;
    let out_dir = cli_options.out_dir;
    let base_path = cli_options.base_path;
    let route_check = cli_options.route_check;
    let output_mode = cli_options.output_mode;
    let rebuild_strategy = cli_options.rebuild_strategy;
    let changed_routes = cli_options.changed_routes;
    let global_graph_hash_override = cli_options.global_graph_hash_override;
    let fast_path = cli_options.fast_path
        && output_mode.is_dev_stable()
        && rebuild_strategy.is_page_only()
        && !changed_routes.is_empty();
    let emitted_root = prepare_output_root(&out_dir, output_mode)?;
    let (inputs, image_runtime_payload) = read_bundler_inputs_from_stdin()?;

    if inputs.is_empty() {
        return Ok(());
    }

    let router_enabled = inputs.iter().any(|i| i.router);
    let forms_enabled = inputs
        .iter()
        .any(|input| input.ir.html.contains("data-zen-form"));
    let presence_required = runtime_presence_required(&inputs);
    let runtime_profile = runtime_profile_for_output(output_mode, presence_required).to_string();

    let template_assets = template_bridge::render_assets(&template_bridge::RenderAssetsRequest {
        manifest_json: "{}".to_string(),
        runtime_import: String::new(),
        core_import: String::new(),
        route_check,
        forms_enabled,
        runtime_profile: runtime_profile.clone(),
    })?;
    if template_assets.runtime_profile != runtime_profile {
        return Err(format!(
            "template bridge runtime profile mismatch: requested '{}', received '{}'",
            runtime_profile, template_assets.runtime_profile
        ));
    }
    if template_assets
        .runtime_contributors
        .iter()
        .any(|entry| entry.id.trim().is_empty() || entry.source_file.trim().is_empty())
    {
        return Err("template bridge emitted invalid runtime contributor metadata".into());
    }
    let runtime_coverage_bytes_from_contributors: usize = template_assets
        .runtime_contributors
        .iter()
        .map(|entry| entry.bytes)
        .sum();
    if runtime_coverage_bytes_from_contributors != template_assets.runtime_coverage_bytes {
        return Err(format!(
            "template bridge runtime coverage mismatch: contributors={}, coverage={}",
            runtime_coverage_bytes_from_contributors, template_assets.runtime_coverage_bytes
        ));
    }
    let expected_ir_version = template_assets.ir_version;

    // Validate all inputs
    for input in &inputs {
        validate_payload(input, expected_ir_version)?;
    }

    // 2. Build Global Graph (In-Memory)
    // We must deduplicate modules and edges across all pages to form a single authority.
    let global_graph = build_global_graph(&inputs)?;
    let global_graph_hash = if fast_path {
        global_graph_hash_override.unwrap_or_else(|| compute_global_graph_hash(&global_graph))
    } else {
        compute_global_graph_hash(&global_graph)
    };
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
    let final_css_content = if fast_path {
        None
    } else {
        Some(build_css_bundle(&inputs, &project_root)?)
    };

    // 3b. Vendor Bundling (Rolldown)
    // We must run this before emitting JS assets so we can rewrite imports.
    let vendor_result = if fast_path {
        None
    } else {
        let rt = tokio::runtime::Runtime::new().expect("failed to init tokio runtime");
        rt.block_on(vendor::bundle_vendor(&inputs, &emitted_root, output_mode))
            .map_err(|e| format!("Vendor bundling failed: {}", e))?
    };

    let vendor_map = if let Some(meta) = &vendor_result {
        println!(
            "[zenith] Vendor bundle: {} ({} specifiers matched)",
            meta.filename,
            meta.specifiers.len()
        );
        let replacement = public_asset_path(&base_path, &format!("assets/{}", meta.filename));
        meta.specifiers
            .iter()
            .map(|s| (s.clone(), replacement.clone()))
            .collect::<BTreeMap<_, _>>()
    } else if fast_path {
        collect_fast_path_vendor_map(&inputs, output_mode, &base_path)
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
    let css_rel = if let Some(css_content) = &final_css_content {
        let css_hash = stable_hash_8(css_content);
        let css_rel = output_mode.css_rel(&css_hash);
        let css_path = emitted_root.join(&css_rel);
        write_file(&css_path, css_content, output_mode)?;
        css_rel
    } else {
        output_mode.css_rel("")
    };
    let any_requires_js = inputs.iter().any(|i| i.requires_js);
    let mut expected_asset_contents = BTreeMap::<String, String>::new();
    let mut known_emitted_assets = BTreeSet::<String>::new();
    known_emitted_assets.insert(css_rel.clone());
    if fast_path && !vendor_map.is_empty() {
        known_emitted_assets.insert(format!("assets/{}", output_mode.vendor_rel("")));
    }
    if let Some(css_content) = &final_css_content {
        expected_asset_contents.insert(css_rel.clone(), css_content.clone());
    }

    if output_mode.is_dev_stable() && rebuild_strategy.is_bundle_only() {
        finalize_output_root(&out_dir, &emitted_root, output_mode)?;
        return Ok(());
    }

    // 4. Generate Runtime & Assets
    let runtime_rel = if !any_requires_js {
        None
    } else if fast_path {
        Some(output_mode.runtime_rel(""))
    } else {
        Some(ensure_runtime_asset(
            &emitted_root,
            &template_assets.runtime_source,
            output_mode,
        )?)
    };

    let runtime_import_spec = if let Some(rel) = &runtime_rel {
        runtime_import_specifier(rel)?
    } else {
        "/* omitted */".to_string()
    };

    if let Some(rel) = &runtime_rel {
        known_emitted_assets.insert(rel.clone());
        if !fast_path {
            expected_asset_contents.insert(rel.clone(), template_assets.runtime_source.clone());
        }
    }

    let core_js = if any_requires_js {
        Some(generate_core_module_js(&runtime_import_spec))
    } else {
        None
    };

    let core_rel = if let Some(js) = &core_js {
        let rel = if fast_path {
            output_mode.core_rel("")
        } else {
            let (rel, _hash) =
                ensure_core_asset(&emitted_root, &runtime_rel.as_ref().unwrap(), output_mode)?;
            rel
        };
        known_emitted_assets.insert(rel.clone());
        if !fast_path {
            expected_asset_contents.insert(rel.clone(), js.clone());
        }
        Some(rel)
    } else {
        None
    };

    let core_import_spec = core_rel
        .as_ref()
        .map(|rel| public_asset_path(&base_path, rel));
    let core_import_spec_str = core_import_spec.as_deref().unwrap_or("/* omitted */");
    let core_hash = core_js
        .as_ref()
        .map(|js| stable_hash_8(js))
        .unwrap_or_else(|| "00000000".to_string());

    let component_assets = if fast_path {
        let derived = derive_fast_path_component_assets(&inputs, &changed_routes, output_mode);
        for rel in derived.values() {
            known_emitted_assets.insert(rel.clone());
        }
        derived
    } else {
        // Collect all component scripts from inputs
        let mut all_component_scripts = BTreeMap::new();
        for input in &inputs {
            for (id, script) in &input.ir.components_scripts {
                all_component_scripts.insert(id.clone(), script.clone());
            }
        }
        let module_registry = build_module_registry(&inputs)?;

        // Emit Components
        let emitted = emit_component_assets(
            &emitted_root,
            &all_component_scripts,
            &runtime_import_spec,
            &module_registry,
            &core_import_spec_str,
            &base_path,
            output_mode,
        )?;
        for rel in emitted.values() {
            known_emitted_assets.insert(rel.clone());
        }
        emitted
    };

    // 5. Generate Manifest Struct (In-Memory)
    let mut manifest_chunks = BTreeMap::new();
    let mut server_runtime_routes = BTreeSet::new();
    let mut page_assets = Vec::new();

    // Process each page
    for (input, html_stripped) in inputs.iter().zip(processed_htmls) {
        if fast_path && !changed_routes.contains(&input.route) {
            continue;
        }
        let route_token = sanitize_route_to_token(&input.route);
        let should_emit_page_bundle = !(output_mode.is_dev_stable()
            && rebuild_strategy.is_page_only()
            && !changed_routes.contains(&input.route));
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

        let js_rel = if should_emit_page_bundle && input.requires_js {
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
                &base_path,
                output_mode,
            )?;
            let js = maybe_minify_page_for_output(&js, output_mode)?;

            let js_hash = stable_hash_8(&js);
            let js_rel = output_mode.page_rel(&route_token, &js_hash);

            if has_runtime_zen_reference(&js) {
                return Err(format!(
                    "Runtime graph purity violation: page bundle for route '{}' contains a .zen module specifier",
                    input.route
                ));
            }

            let js_path = emitted_root.join(&js_rel);
            write_file(&js_path, &js, output_mode)?;
            expected_asset_contents.insert(js_rel.clone(), js.clone());
            known_emitted_assets.insert(js_rel.clone());
            Some(js_rel)
        } else if input.requires_js {
            Some(output_mode.page_rel(&route_token, ""))
        } else {
            None
        };

        manifest_chunks.insert(
            input.route.clone(),
            js_rel
                .as_ref()
                .map(|rel| public_asset_path(&base_path, rel)),
        );
        if input.ir.server_script.is_some() && !input.ir.prerender {
            server_runtime_routes.insert(input.route.clone());
        }
        page_assets.push((
            input.route.clone(),
            html_stripped.clone(),
            js_rel,
            input.ir.expressions.clone(),
            input.image_materialization.clone(),
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
            input.ir.has_scoped_server_data,
            input.ir.scoped_server_data.clone(),
        ));
    }

    // 6. Generate Router & Manifest
    let mut router_rel_path = if fast_path && router_enabled {
        Some(public_asset_path(&base_path, &output_mode.router_rel("")))
    } else {
        None
    };
    if fast_path && router_rel_path.is_some() {
        known_emitted_assets.insert(output_mode.router_rel(""));
    }
    let manifest_hash = compute_manifest_hash(&global_graph_hash, &core_hash, &manifest_chunks);
    if !fast_path {
        let manifest_json_str = {
            let manifest = Manifest {
                entry: runtime_rel
                    .as_ref()
                    .map(|rel| public_asset_path(&base_path, rel)),
                base_path: base_path.clone(),
                vendor: vendor_result
                    .as_ref()
                    .map(|m| public_asset_path(&base_path, &format!("assets/{}", m.filename))),
                css: public_asset_path(&base_path, &css_rel),
                core: core_rel
                    .as_ref()
                    .map(|rel| public_asset_path(&base_path, rel)),
                chunks: manifest_chunks.clone(),
                server_routes: server_runtime_routes.clone(),
                hash: manifest_hash.clone(),
                router: None,
            };
            serde_json::to_string(&manifest).expect("failed to serialize partial manifest")
        };

        if router_enabled {
            let rendered_assets =
                template_bridge::render_assets(&template_bridge::RenderAssetsRequest {
                    manifest_json: manifest_json_str.clone(),
                    runtime_import: runtime_rel
                        .as_ref()
                        .map(|rel| public_asset_path(&base_path, rel))
                        .unwrap_or_else(|| "/* omitted */".to_string()),
                    core_import: core_import_spec_str.to_string(),
                    route_check,
                    forms_enabled,
                    runtime_profile: runtime_profile.clone(),
                })?;
            let router_source =
                maybe_minify_router_for_output(&rendered_assets.router_source, output_mode)?;

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
            let r_rel = output_mode.router_rel(&router_hash);
            router_rel_path = Some(public_asset_path(&base_path, &r_rel));
            write_file(&emitted_root.join(&r_rel), &router_source, output_mode)?;
            expected_asset_contents.insert(r_rel.clone(), router_source);
            known_emitted_assets.insert(r_rel);
        }
    }

    if let Some(meta) = &vendor_result {
        let vendor_path = emitted_root.join("assets").join(&meta.filename);
        expected_asset_contents.insert(format!("assets/{}", meta.filename), meta.content.clone());
        if !vendor_path.exists() {
            write_file(&vendor_path, &meta.content, output_mode)?;
        }
    }

    for (rel, content) in &expected_asset_contents {
        let path = emitted_root.join(rel);
        if !path.exists() {
            write_file(&path, content, output_mode)?;
        }
    }

    verify_emitted_js_imports(&emitted_root, &known_emitted_assets, &base_path)?;

    if !fast_path {
        let manifest_hash = compute_manifest_hash(&global_graph_hash, &core_hash, &manifest_chunks);

        let final_manifest = Manifest {
            entry: runtime_rel
                .as_ref()
                .map(|rel| public_asset_path(&base_path, rel)),
            base_path: base_path.clone(),
            vendor: vendor_result
                .as_ref()
                .map(|m| public_asset_path(&base_path, &format!("assets/{}", m.filename))),
            css: public_asset_path(&base_path, &css_rel),
            core: core_rel
                .as_ref()
                .map(|rel| public_asset_path(&base_path, rel)),
            chunks: manifest_chunks,
            server_routes: server_runtime_routes,
            hash: manifest_hash,
            router: router_rel_path.clone(),
        };
        let final_manifest_json = serde_json::to_string_pretty(&final_manifest)
            .map_err(|e| format!("failed to serialize manifest: {e}"))?;
        write_file(
            &emitted_root.join("manifest.json"),
            &final_manifest_json,
            output_mode,
        )?;

        let mut router_manifest = RouterManifest {
            base_path: base_path.clone(),
            ..RouterManifest::default()
        };
        for (
            route,
            _html_tpl,
            js_rel,
            expressions,
            image_materialization,
            server_script,
            server_script_path,
            prerender,
            ssr_data,
            has_guard,
            has_load,
            guard_module_ref,
            load_module_ref,
            has_scoped_server_data,
            scoped_server_data,
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
                page_asset: js_rel.clone(),
                image_materialization: image_materialization.clone(),
                server_script: server_script.clone(),
                server_script_path: server_script_path.clone(),
                prerender: *prerender,
                ssr_data: ssr_data.clone(),
                has_guard: *has_guard,
                has_load: *has_load,
                guard_module_ref: guard_module_ref.clone(),
                load_module_ref: load_module_ref.clone(),
                has_scoped_server_data: *has_scoped_server_data,
                scoped_server_data: scoped_server_data.clone(),
            });
        }
        router_manifest.routes.sort_by(|a, b| a.path.cmp(&b.path));
        let router_manifest_json = serde_json::to_string(&router_manifest)
            .map_err(|e| format!("failed to serialize router manifest: {e}"))?;
        write_file(
            &emitted_root.join("assets/router-manifest.json"),
            &router_manifest_json,
            output_mode,
        )?;
    }

    // 7. Write HTML Files (Injecting Manifest Paths)
    for (
        route,
        html_tpl,
        js_rel,
        _expressions,
        _image_materialization,
        _server_script,
        _server_script_path,
        _prerender,
        _ssr_data,
        _has_guard,
        _has_load,
        _guard_module_ref,
        _load_module_ref,
        _has_scoped_server_data,
        _scoped_server_data,
    ) in page_assets
    {
        if output_mode.is_dev_stable()
            && rebuild_strategy.is_page_only()
            && !changed_routes.contains(&route)
        {
            continue;
        }
        let mut html = inject_stylesheet_link_once(
            &html_tpl,
            &public_asset_path(&base_path, &css_rel),
            &route,
        )?;

        if let Some(r_path) = &router_rel_path {
            // Router mode: single module entry point in HTML.
            html = inject_script_once(&html, r_path, "data-zx-router");
        } else if let Some(rel) = &js_rel {
            // Non-router mode: page module is the single module entry point.
            html = inject_script_once(&html, &public_asset_path(&base_path, rel), "data-zx-page");
        }

        let module_script_count = html.matches("<script type=\"module\"").count();
        let expected_module_scripts = if js_rel.is_some() || router_rel_path.is_some() {
            1
        } else {
            0
        };

        if module_script_count != expected_module_scripts {
            return Err(format!(
                "Route '{}' must contain exactly {} module entry script(s), found {}",
                route, expected_module_scripts, module_script_count
            ));
        }
        let stylesheet_link_count = html.matches("rel=\"stylesheet\"").count();
        if stylesheet_link_count != 1 {
            return Err(format!(
                "Route '{}' must contain exactly one stylesheet link, found {}",
                route, stylesheet_link_count
            ));
        }

        html = materialize_image_markup_in_build_html(
            &html,
            image_runtime_payload.as_ref(),
            &_image_materialization,
        )
        .map_err(|error| format!("route '{route}' failed image materialization: {error}"))?;

        // Output HTML
        let html_rel = route_to_output_path(&route);
        let html_path = emitted_root.join(html_rel);
        write_file(&html_path, &html, output_mode)?;
    }
    finalize_output_root(&out_dir, &emitted_root, output_mode)?;
    Ok(())
}

#[cfg(test)]
mod bundler_main_tests;
