use super::*;

pub(crate) struct BundlerOutputPhaseRequest<'a> {
    pub(crate) out_dir: &'a Path,
    pub(crate) emitted_root: &'a PathBuf,
    pub(crate) inputs: &'a [BundlerInput],
    pub(crate) processed_htmls: Vec<String>,
    pub(crate) output_mode: OutputMode,
    pub(crate) rebuild_strategy: bundler_cli::RebuildStrategy,
    pub(crate) changed_routes: &'a BTreeSet<String>,
    pub(crate) fast_path: bool,
    pub(crate) router_enabled: bool,
    pub(crate) route_check: bool,
    pub(crate) forms_enabled: bool,
    pub(crate) base_path: &'a str,
    pub(crate) css_rel: String,
    pub(crate) runtime_rel: Option<String>,
    pub(crate) core_rel: Option<String>,
    pub(crate) core_hash: String,
    pub(crate) runtime_import_spec: &'a str,
    pub(crate) core_import_spec_str: &'a str,
    pub(crate) component_assets: &'a BTreeMap<String, String>,
    pub(crate) module_registry: &'a BTreeMap<String, CompilerModule>,
    pub(crate) global_graph_hash: &'a str,
    pub(crate) runtime_profile: &'a str,
    pub(crate) vendor_result: Option<&'a vendor::VendorBuildResult>,
    pub(crate) expected_asset_contents: BTreeMap<String, String>,
    pub(crate) known_emitted_assets: BTreeSet<String>,
    pub(crate) image_runtime_payload: Option<&'a ImageRuntimePayload>,
}

pub(crate) fn emit_output_phase(request: BundlerOutputPhaseRequest<'_>) -> Result<(), String> {
    let BundlerOutputPhaseRequest {
        out_dir,
        emitted_root,
        inputs,
        processed_htmls,
        output_mode,
        rebuild_strategy,
        changed_routes,
        fast_path,
        router_enabled,
        route_check,
        forms_enabled,
        base_path,
        css_rel,
        runtime_rel,
        core_rel,
        core_hash,
        runtime_import_spec,
        core_import_spec_str,
        component_assets,
        module_registry,
        global_graph_hash,
        runtime_profile,
        vendor_result,
        expected_asset_contents,
        known_emitted_assets,
        image_runtime_payload,
    } = request;
    let mut expected_asset_contents = expected_asset_contents;
    let mut known_emitted_assets = known_emitted_assets;

    // 5. Generate Manifest Struct (In-Memory)
    let mut manifest_chunks = BTreeMap::new();
    let mut server_runtime_routes = BTreeSet::new();
    let mut page_assets = Vec::new();
    let mut emitted_helper_assets = BTreeMap::new();

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

        let page_helper_assets = if input.requires_js {
            emit_page_helper_assets(
                emitted_root,
                &input.ir,
                module_registry,
                &mut emitted_helper_assets,
                core_import_spec_str,
                base_path,
                output_mode,
            )?
        } else {
            BTreeMap::new()
        };

        let js_rel = if should_emit_page_bundle && input.requires_js {
            let js = generate_entry_js(
                &input.ir,
                runtime_import_spec,
                &markers,
                &events,
                component_assets,
                &page_helper_assets,
                &input.route,
                prerender_ssr_data.as_ref(),
                global_graph_hash,
                router_enabled,
                base_path,
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
            js_rel.as_ref().map(|rel| public_asset_path(base_path, rel)),
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

    for rel in emitted_helper_assets.values() {
        known_emitted_assets.insert(rel.clone());
    }

    // 6. Generate Router & Manifest
    let mut router_rel_path = if fast_path && router_enabled {
        Some(public_asset_path(base_path, &output_mode.router_rel("")))
    } else {
        None
    };
    if fast_path && router_rel_path.is_some() {
        known_emitted_assets.insert(output_mode.router_rel(""));
    }
    let manifest_hash = compute_manifest_hash(global_graph_hash, &core_hash, &manifest_chunks);
    if !fast_path {
        let manifest_json_str = {
            let manifest = Manifest {
                entry: runtime_rel
                    .as_ref()
                    .map(|rel| public_asset_path(base_path, rel)),
                base_path: base_path.to_string(),
                vendor: vendor_result
                    .map(|m| public_asset_path(base_path, &format!("assets/{}", m.filename))),
                css: public_asset_path(base_path, &css_rel),
                core: core_rel
                    .as_ref()
                    .map(|rel| public_asset_path(base_path, rel)),
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
                        .map(|rel| public_asset_path(base_path, rel))
                        .unwrap_or_else(|| "/* omitted */".to_string()),
                    core_import: core_import_spec_str.to_string(),
                    route_check,
                    forms_enabled,
                    runtime_profile: runtime_profile.to_string(),
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
            router_rel_path = Some(public_asset_path(base_path, &r_rel));
            write_file(&emitted_root.join(&r_rel), &router_source, output_mode)?;
            expected_asset_contents.insert(r_rel.clone(), router_source);
            known_emitted_assets.insert(r_rel);
        }
    }

    if let Some(meta) = vendor_result {
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

    verify_emitted_js_imports(emitted_root, &known_emitted_assets, base_path)?;

    if !fast_path {
        let manifest_hash = compute_manifest_hash(global_graph_hash, &core_hash, &manifest_chunks);

        let final_manifest = Manifest {
            entry: runtime_rel
                .as_ref()
                .map(|rel| public_asset_path(base_path, rel)),
            base_path: base_path.to_string(),
            vendor: vendor_result
                .map(|m| public_asset_path(base_path, &format!("assets/{}", m.filename))),
            css: public_asset_path(base_path, &css_rel),
            core: core_rel
                .as_ref()
                .map(|rel| public_asset_path(base_path, rel)),
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
            base_path: base_path.to_string(),
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
            &public_asset_path(base_path, &css_rel),
            &route,
        )?;

        if let Some(r_path) = &router_rel_path {
            // Router mode: single module entry point in HTML.
            html = inject_script_once(&html, r_path, "data-zx-router");
        } else if let Some(rel) = &js_rel {
            // Non-router mode: page module is the single module entry point.
            html = inject_script_once(&html, &public_asset_path(base_path, rel), "data-zx-page");
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
            image_runtime_payload,
            &_image_materialization,
        )
        .map_err(|error| format!("route '{route}' failed image materialization: {error}"))?;

        // Output HTML
        let html_rel = route_to_output_path(&route);
        let html_path = emitted_root.join(html_rel);
        write_file(&html_path, &html, output_mode)?;
    }
    finalize_output_root(out_dir, emitted_root, output_mode)?;
    Ok(())
}
