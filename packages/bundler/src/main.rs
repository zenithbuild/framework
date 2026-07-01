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
mod bundler_output_phase;
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
use bundler_output_phase::{emit_output_phase, BundlerOutputPhaseRequest};
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

    emit_output_phase(BundlerOutputPhaseRequest {
        out_dir: &out_dir,
        emitted_root: &emitted_root,
        inputs: &inputs,
        processed_htmls,
        output_mode,
        rebuild_strategy,
        changed_routes: &changed_routes,
        fast_path,
        router_enabled,
        route_check,
        forms_enabled,
        base_path: &base_path,
        css_rel,
        runtime_rel,
        core_rel,
        core_hash,
        runtime_import_spec: &runtime_import_spec,
        core_import_spec_str,
        component_assets: &component_assets,
        global_graph_hash: &global_graph_hash,
        runtime_profile: &runtime_profile,
        vendor_result: vendor_result.as_ref(),
        expected_asset_contents,
        known_emitted_assets,
        image_runtime_payload: image_runtime_payload.as_ref(),
    })?;
    Ok(())
}

#[cfg(test)]
mod bundler_main_tests;
