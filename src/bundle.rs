//! Core bundling logic.
//!
//! This module orchestrates the full bundle pipeline:
//! 1. Read and compile the `.zen` source via the ZenithLoader plugin
//! 2. Run through Rolldown for import resolution and graph building
//! 3. Validate output against metadata
//! 4. Return sealed BundleResult
//!
//! **Single emission engine.** All builds go through Rolldown.
//! There is one graph, one emission flow, one source of truth.
//! No inline bypass is permitted — determinism requires a unified pipeline.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use regex::Regex;
use rolldown::{BundlerBuilder, BundlerOptions, InputItem};
use rolldown_common::OutputFormat;
use zenith_compiler::compiler::CompilerOutput;
use zenith_compiler::script::ExtractedStyleBlock;

use crate::plugin::zenith_loader::{ZenithLoader, ZenithLoaderConfig};
use crate::utils;
use crate::{
    BuildMode, BundleError, BundleOptions, BundlePlan, BundleResult, Diagnostic, DiagnosticLevel,
};

// ---------------------------------------------------------------------------
// Single emission engine — all builds go through Rolldown
// ---------------------------------------------------------------------------

/// Execute the bundle pipeline using Rolldown as the single emission engine.
///
/// This creates a ZenithLoader plugin, wires it into Rolldown via
/// `BundlerBuilder`, runs the full build, and validates the output.
///
/// **Invariant:** There is no alternative codepath. Every build —
/// single-page, multi-page, dev, prod — runs through this function.
pub async fn execute_bundle(
    plan: BundlePlan,
    opts: BundleOptions,
) -> Result<BundleResult, BundleError> {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    let page_id = utils::canonicalize_page_id(&plan.page_path);

    // Pre-build: verify source file exists (clean IoError)
    if !Path::new(&plan.page_path).exists() {
        return Err(BundleError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source file not found: {}", plan.page_path),
        )));
    }

    diagnostics.push(Diagnostic {
        level: DiagnosticLevel::Info,
        message: format!(
            "Bundle started for page: {} (id: {})",
            plan.page_path, page_id
        ),
        context: None,
    });

    // Create the loader plugin
    let loader = ZenithLoader::new(ZenithLoaderConfig {
        components: opts.components.clone(),
        metadata: opts.metadata.clone(),
        strict: opts.strict,
        is_dev: plan.mode == BuildMode::Dev,
    });

    let compiled_outputs = loader.compiled_outputs();

    // Configure Rolldown — single-entry, ESM, browser
    let rolldown_options = BundlerOptions {
        input: Some(vec![InputItem {
            name: Some("index".into()),
            import: plan.page_path.clone(),
        }]),
        format: Some(OutputFormat::Esm),
        platform: Some(rolldown_common::Platform::Browser),
        minify: if opts.minify.unwrap_or(plan.mode == BuildMode::Prod) {
            Some(Default::default())
        } else {
            None
        },
        ..Default::default()
    };

    // Build bundler with plugin
    let mut bundler = BundlerBuilder::default()
        .with_options(rolldown_options)
        .with_plugins(vec![Arc::new(loader)])
        .build()
        .map_err(|e| BundleError::BuildError(format!("Rolldown init failed: {:?}", e)))?;

    // Run the bundling pass
    let bundle_output = bundler
        .generate()
        .await
        .map_err(|e| BundleError::BuildError(format!("Rolldown build failed: {:?}", e)))?;

    // Close the bundler
    bundler
        .close()
        .await
        .map_err(|e| BundleError::BuildError(format!("Rolldown close failed: {:?}", e)))?;

    // Extract the entry chunk
    let entry_js = bundle_output
        .assets
        .iter()
        .find_map(|asset| match asset {
            rolldown_common::Output::Chunk(chunk) => Some(chunk.code.clone()),
            _ => None,
        })
        .ok_or_else(|| BundleError::BuildError("No entry chunk in Rolldown output".into()))?;

    // Strip non-deterministic comments (Rolldown emits //#region with absolute paths)
    // Also normalizes line endings to \n
    let entry_js = entry_js
        .lines()
        .filter(|line| !line.starts_with("//#region") && !line.starts_with("//#endregion"))
        .collect::<Vec<_>>()
        .join("\n");

    // Get compiled output for the page (stored by the plugin during load)
    let compiled = compiled_outputs
        .get(&plan.page_path)
        .map(|entry| entry.value().clone())
        .unwrap_or_default();

    let expressions = compiled.expressions.clone();

    // Post-build strict validation
    if opts.strict {
        // 1. Verify expressions match metadata
        if let Some(ref metadata) = opts.metadata {
            utils::validate_expressions(&expressions, &metadata.expressions)?;
        }

        // 2. Verify HTML contains required placeholders
        if !expressions.is_empty() {
            if let Err(diags) = utils::validate_placeholders(&compiled.html, expressions.len()) {
                return Err(BundleError::ValidationError(
                    diags
                        .iter()
                        .map(|d| d.message.clone())
                        .collect::<Vec<_>>()
                        .join("; "),
                ));
            }
        }
    }

    let mut effective_style_blocks = compiled.style_blocks.clone();
    if effective_style_blocks.is_empty() {
        effective_style_blocks =
            collect_graph_style_blocks(&compiled_outputs, &plan.page_path, &compiled);
    }

    // Process CSS and Anchor.
    // For legacy fragment-only pages (no styles anchor), preserve previous behavior:
    // still emit deterministic CSS bytes, but keep HTML untouched in this codepath.
    let (processed_css, new_html) =
        match utils::process_css(&effective_style_blocks, &compiled.html) {
            Ok(value) => value,
            Err(err)
                if !effective_style_blocks.is_empty()
                    && compiled.style_blocks.is_empty()
                    && err.starts_with("Expected exactly one ZENITH_STYLES_ANCHOR, found") =>
            {
                let (css_only, _) = utils::process_css(
                    &effective_style_blocks,
                    "<!-- ZENITH_STYLES_ANCHOR -->",
                )
                .map_err(BundleError::ValidationError)?;
                (css_only, compiled.html.clone())
            }
            Err(err) => return Err(BundleError::ValidationError(err)),
        };

    let css = processed_css.as_ref().map(|p| p.content.clone());

    diagnostics.push(Diagnostic {
        level: DiagnosticLevel::Info,
        message: format!(
            "Bundle complete: {} expressions, {} bytes JS, {} bytes CSS",
            expressions.len(),
            entry_js.len(),
            css.as_ref().map_or(0, |c| c.len()),
        ),
        context: None,
    });

    // Write to disk if requested
    if opts.write_to_disk {
        let out_dir = plan
            .out_dir
            .unwrap_or_else(|| Path::new("dist").to_path_buf());
        let pages_dir = out_dir.join("pages");
        tokio::fs::create_dir_all(&pages_dir).await?;

        let js_path = pages_dir.join(format!("{}.js", page_id));
        tokio::fs::write(&js_path, &entry_js).await?;

        if let Some(ref css_data) = processed_css {
            let css_path = pages_dir.join(format!("styles.{}.css", css_data.hash));
            tokio::fs::write(&css_path, &css_data.content).await?;
        }

        diagnostics.push(Diagnostic {
            level: DiagnosticLevel::Info,
            message: format!("Written to {}", pages_dir.display()),
            context: None,
        });
    }

    Ok(BundleResult {
        entry_js,
        css,
        html: new_html,
        expressions,
        diagnostics,
    })
}

fn collect_graph_style_blocks(
    compiled_outputs: &dashmap::DashMap<String, CompilerOutput>,
    entry_path: &str,
    compiled_entry: &CompilerOutput,
) -> Vec<ExtractedStyleBlock> {
    let mut modules = BTreeMap::new();
    for item in compiled_outputs.iter() {
        modules.insert(item.key().clone(), item.value().clone());
    }

    if modules.is_empty() {
        return Vec::new();
    }

    let mut resolved_entry = entry_path.to_string();
    if !modules.contains_key(&resolved_entry) {
        if let Ok(canon) = std::fs::canonicalize(entry_path) {
            let candidate = canon.to_string_lossy().to_string();
            if modules.contains_key(&candidate) {
                resolved_entry = candidate;
            }
        }
    }

    if !modules.contains_key(&resolved_entry) {
        modules.insert(resolved_entry.clone(), compiled_entry.clone());
    }

    let mut ordered = Vec::new();
    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    dfs_modules(
        &resolved_entry,
        &modules,
        &mut visiting,
        &mut visited,
        &mut ordered,
    );

    let mut blocks = Vec::new();
    for module_id in ordered {
        let Some(output) = modules.get(&module_id) else {
            continue;
        };
        let module_blocks = extract_style_blocks_from_source_file(&module_id)
            .unwrap_or_else(|| extract_style_blocks_from_html(&module_id, &output.html));
        blocks.extend(module_blocks);
    }

    blocks
}

fn dfs_modules(
    module_id: &str,
    modules: &BTreeMap<String, CompilerOutput>,
    visiting: &mut BTreeSet<String>,
    visited: &mut BTreeSet<String>,
    ordered: &mut Vec<String>,
) {
    if visited.contains(module_id) {
        return;
    }
    if !visiting.insert(module_id.to_string()) {
        return;
    }

    if let Some(module) = modules.get(module_id) {
        for dep in extract_zen_imports(module_id, module) {
            if modules.contains_key(&dep) {
                dfs_modules(&dep, modules, visiting, visited, ordered);
            }
        }
    }

    visiting.remove(module_id);
    visited.insert(module_id.to_string());
    ordered.push(module_id.to_string());
}

fn extract_zen_imports(module_id: &str, module: &CompilerOutput) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();

    let import_re = Regex::new(r#"(?i)^\s*import\s+[^'"]*['"]([^'"]+)['"]"#).expect("valid regex");
    for line in module
        .hoisted
        .imports
        .iter()
        .chain(module.imports.iter())
    {
        let Some(caps) = import_re.captures(line) else {
            continue;
        };
        let Some(m) = caps.get(1) else {
            continue;
        };
        let spec = m.as_str();
        if !spec.ends_with(".zen") {
            continue;
        }
        let resolved = resolve_relative_specifier(module_id, spec);
        if seen.insert(resolved.clone()) {
            out.push(resolved);
        }
    }

    out
}

fn resolve_relative_specifier(module_id: &str, spec: &str) -> String {
    let module_path = Path::new(module_id);

    if spec.starts_with('/') {
        return spec.to_string();
    }

    if spec.starts_with("./") || spec.starts_with("../") {
        let parent = module_path.parent().unwrap_or_else(|| Path::new("."));
        let joined = parent.join(spec);
        if let Ok(canon) = std::fs::canonicalize(&joined) {
            return canon.to_string_lossy().to_string();
        }
        return normalize_path(joined);
    }

    spec.to_string()
}

fn normalize_path(path: PathBuf) -> String {
    path.components()
        .collect::<PathBuf>()
        .to_string_lossy()
        .to_string()
}

fn extract_style_blocks_from_html(module_id: &str, html: &str) -> Vec<ExtractedStyleBlock> {
    let style_re = Regex::new(r#"(?is)<style(?:\s[^>]*)?>(.*?)</style>"#).expect("valid regex");
    let mut out = Vec::new();
    for (idx, caps) in style_re.captures_iter(html).enumerate() {
        let Some(content_match) = caps.get(1) else {
            continue;
        };
        let content = content_match
            .as_str()
            .replace("\r\n", "\n")
            .trim()
            .to_string();
        if content.is_empty() {
            continue;
        }
        out.push(ExtractedStyleBlock {
            module_id: module_id.to_string(),
            order: idx as u32,
            content,
        });
    }
    out
}

fn extract_style_blocks_from_source_file(module_id: &str) -> Option<Vec<ExtractedStyleBlock>> {
    let path = Path::new(module_id);
    if !path.exists() {
        return None;
    }
    let source = std::fs::read_to_string(path).ok()?;
    Some(extract_style_blocks_from_html(module_id, &source))
}
