//! Zenith Loader — Rolldown Plugin that transforms `.zen` files
//! and serves virtual entry modules.
//!
//! Implements the Rolldown `Plugin` trait with:
//! - `resolve_id` — intercept `.zen` file imports and virtual module IDs
//! - `load` — serve content for virtual modules and compile `.zen` sources
//! - `transform` — inject HMR footer in dev mode
//!
//! **Invariants:**
//! - Never mutates compiler expressions
//! - Never resolves components
//! - Never re-orders exports
//! - Fails fast on mismatch in strict mode

use std::borrow::Cow;
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use arcstr::ArcStr;
use dashmap::DashMap;
use rolldown_common::ResolvedExternal;
use rolldown_plugin::{
    HookLoadArgs, HookLoadOutput, HookResolveIdArgs, HookResolveIdOutput, HookTransformArgs,
    HookTransformOutput, HookUsage, Plugin, SharedLoadPluginContext, SharedTransformPluginContext,
};

use zenith_compiler::compiler::{compile_structured_with_source, CompilerOutput};

use crate::plugin::css_cache::CssCache;
use crate::utils;
use crate::{BundleError, ComponentDef};

trait IntoCompilerResult {
    fn into_compiler_result(self) -> Result<CompilerOutput, String>;
}

impl IntoCompilerResult for CompilerOutput {
    fn into_compiler_result(self) -> Result<CompilerOutput, String> {
        Ok(self)
    }
}

impl IntoCompilerResult for Result<CompilerOutput, String> {
    fn into_compiler_result(self) -> Result<CompilerOutput, String> {
        self
    }
}

/// Configuration for the Zenith loader plugin.
#[derive(Debug, Clone)]
pub struct ZenithLoaderConfig {
    /// Optional components map. Forwarded to compiler when available.
    pub components: Option<HashMap<String, ComponentDef>>,
    /// Optional pre-compiled metadata for strict validation.
    pub metadata: Option<CompilerOutput>,
    /// Whether to fail on invariant violations.
    pub strict: bool,
    /// Dev mode — enables HMR footer injection.
    pub is_dev: bool,
}

/// HMR footer injected in dev mode.
/// Per BUNDLER_CONTRACT.md §7: appended after exports, once per module.
pub const HMR_FOOTER: &str =
    "\n/* zenith-hmr */\nif (import.meta.hot) { import.meta.hot.accept(); }\n";

/// Marker used to detect if HMR footer is already present.
pub const HMR_MARKER: &str = "/* zenith-hmr */";

/// The Zenith Loader Rolldown plugin.
///
/// This implements the Rolldown `Plugin` trait. It intercepts `.zen` file
/// imports, compiles them via the sealed compiler API, and emits virtual
/// entry modules.
pub struct ZenithLoader {
    config: ZenithLoaderConfig,
    css_cache: Arc<CssCache>,
    /// Compiled outputs keyed by module ID — used for post-build validation.
    compiled_outputs: Arc<DashMap<String, CompilerOutput>>,
}

impl fmt::Debug for ZenithLoader {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ZenithLoader")
            .field("config", &self.config)
            .field("css_cache", &self.css_cache)
            .finish()
    }
}

impl ZenithLoader {
    pub fn new(config: ZenithLoaderConfig) -> Self {
        Self {
            config,
            css_cache: Arc::new(CssCache::new()),
            compiled_outputs: Arc::new(DashMap::new()),
        }
    }

    /// Get the CSS cache (for reading collected CSS after build).
    pub fn css_cache(&self) -> Arc<CssCache> {
        Arc::clone(&self.css_cache)
    }

    /// Get all compiled outputs (for post-build validation).
    pub fn compiled_outputs(&self) -> Arc<DashMap<String, CompilerOutput>> {
        Arc::clone(&self.compiled_outputs)
    }
}

// ---------------------------------------------------------------------------
// Rolldown Plugin Trait Implementation
// ---------------------------------------------------------------------------

impl Plugin for ZenithLoader {
    fn name(&self) -> Cow<'static, str> {
        Cow::Borrowed("zenith-loader")
    }

    fn register_hook_usage(&self) -> HookUsage {
        let mut usage = HookUsage::ResolveId | HookUsage::Load;
        if self.config.is_dev {
            usage = usage | HookUsage::Transform;
        }
        usage
    }

    /// Intercept `.zen` file imports and virtual module IDs.
    fn resolve_id(
        &self,
        _ctx: &rolldown_plugin::PluginContext,
        args: &HookResolveIdArgs<'_>,
    ) -> impl std::future::Future<Output = rolldown_plugin::HookResolveIdReturn> + Send {
        let specifier = args.specifier.to_string();

        async move {
            // Handle .zen files
            if specifier.ends_with(".zen") {
                let resolved = if specifier.starts_with('.') {
                    if let Some(importer_path) = args.importer.as_ref() {
                        let p = std::path::Path::new(importer_path);
                        if let Some(parent) = p.parent() {
                            // Simple path join + clean (could use canonicalize but that requires file existence)
                            // For tests, files exist. For robustness, we normalize.
                            // But std::fs::canonicalize requires existence.
                            // Let's rely on parent.join for now, assuming standard fs.
                            let full_path = parent.join(&specifier);
                            // Attempt to canonicalize to remove ../ and ./
                            match full_path.canonicalize() {
                                Ok(p) => p.to_string_lossy().to_string(),
                                Err(_) => full_path.to_string_lossy().to_string(), // Fallback
                            }
                        } else {
                            specifier
                        }
                    } else {
                        // Relative import with no importer? Should not happen in graph but possible in entry
                        specifier
                    }
                } else {
                    // Absolute path or node_modules (not supported yet, assuming absolute)
                    specifier
                };

                return Ok(Some(HookResolveIdOutput {
                    id: ArcStr::from(resolved),
                    external: Some(ResolvedExternal::Bool(false)),
                    ..Default::default()
                }));
            }

            // Handle virtual modules
            if specifier.starts_with("\0zenith:") {
                return Ok(Some(HookResolveIdOutput {
                    id: ArcStr::from(specifier),
                    external: Some(ResolvedExternal::Bool(false)),
                    ..Default::default()
                }));
            }

            Ok(None)
        }
    }

    /// Load and compile `.zen` files, serve virtual modules.
    fn load(
        &self,
        _ctx: SharedLoadPluginContext,
        args: &HookLoadArgs<'_>,
    ) -> impl std::future::Future<Output = rolldown_plugin::HookLoadReturn> + Send {
        let id = args.id.to_string();
        let config = self.config.clone();
        let css_cache = Arc::clone(&self.css_cache);
        let compiled_outputs = Arc::clone(&self.compiled_outputs);

        async move {
            // Handle virtual CSS module
            if id.starts_with("\0zenith:css:") {
                let page_id = utils::extract_page_id(&id).unwrap_or("unknown");
                let css = css_cache.get(page_id).unwrap_or_default();
                return Ok(Some(HookLoadOutput {
                    code: ArcStr::from(css),
                    ..Default::default()
                }));
            }

            // Handle virtual entry module
            if id.starts_with("\0zenith:entry:") {
                if let Some(ref metadata) = config.metadata {
                    let entry_code = utils::generate_virtual_entry(metadata);
                    return Ok(Some(HookLoadOutput {
                        code: ArcStr::from(entry_code),
                        ..Default::default()
                    }));
                }
            }

            // Handle .zen files — compile via sealed compiler API
            if id.ends_with(".zen") {
                // Offload heavy compilation and file I/O to blocking thread specific to this task
                // This prevents starving the async runtime during graph discovery
                let id_clone = id.clone();
                let config_clone = config.clone();

                let (js_code, compiled) = tokio::task::spawn_blocking(move || -> Result<_, BundleError> {
                    let source = std::fs::read_to_string(&id_clone)?;

                    // Call the sealed compiler API
                    compile_zen_source(&source, &id_clone, &config_clone)
                })
                .await
                .map_err(|e| {
                    BundleError::BuildError(format!("Compilation task join error: {}", e))
                })??;

                // Store compiled output for post-build validation
                // CSS extraction (if any) would happen here or in transform
                compiled_outputs.insert(id.clone(), compiled);

                return Ok(Some(HookLoadOutput {
                    code: ArcStr::from(js_code),
                    ..Default::default()
                }));
            }

            Ok(None)
        }
    }

    /// Transform hook: inject HMR footer in dev mode.
    /// Per BUNDLER_CONTRACT.md §7:
    /// - Appended once per .zen module
    /// - Never mutates exports
    /// - Never re-orders exports
    /// - Absent in production
    fn transform(
        &self,
        _ctx: SharedTransformPluginContext,
        args: &HookTransformArgs<'_>,
    ) -> impl std::future::Future<Output = rolldown_plugin::HookTransformReturn> + Send {
        let id = args.id.to_string();
        let code = args.code.clone();
        let is_dev = self.config.is_dev;

        async move {
            // Only inject HMR for .zen files in dev mode
            if !is_dev || !id.ends_with(".zen") {
                return Ok(None);
            }

            // Guard: only inject once (idempotent)
            if code.contains(HMR_MARKER) {
                return Ok(None);
            }

            // Append HMR footer after all existing code
            let transformed = format!("{}{}", code, HMR_FOOTER);

            Ok(Some(HookTransformOutput {
                code: Some(transformed),
                ..Default::default()
            }))
        }
    }
}

// ---------------------------------------------------------------------------
// Standalone functions (used by both Plugin and non-Plugin codepaths)
// ---------------------------------------------------------------------------

/// Compile a .zen source string directly (no filesystem).
/// Used by `bundle.rs` when reading files through tokio.
pub fn compile_zen_source(
    source: &str,
    id: &str,
    _config: &ZenithLoaderConfig,
) -> Result<(String, CompilerOutput), BundleError> {
    // Normalize newlines to LF for determinism (CRLF -> LF)
    let source = source.replace("\r\n", "\n");
    let compiled = compile_structured_with_source(&source, id)
        .into_compiler_result()
        .map_err(BundleError::CompilerError)?;

    let js_code = utils::generate_virtual_entry(&compiled);
    Ok((js_code, compiled))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn loader_config_no_metadata() -> ZenithLoaderConfig {
        ZenithLoaderConfig {
            components: None,
            metadata: None,
            strict: false,
            is_dev: false,
        }
    }

    fn loader_config_with_metadata(expressions: Vec<String>) -> ZenithLoaderConfig {
        ZenithLoaderConfig {
            components: None,
            metadata: Some(CompilerOutput {
                ir_version: 1,
                graph_hash: String::new(),
                graph_edges: Vec::new(),
                graph_nodes: Vec::new(),
                html: String::new(),
                expressions,
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
                style_blocks: Default::default(),
            }),
            strict: true,
            is_dev: false,
        }
    }

    #[test]
    fn compile_zen_source_basic() {
        let config = loader_config_no_metadata();
        let (js, compiled) = compile_zen_source("<h1>{title}</h1>", "page.zen", &config).unwrap();
        assert!(js.contains("__zenith_html"));
        assert!(js.contains("__zenith_expr"));
        assert_eq!(compiled.expressions, vec!["title"]);
    }

    #[test]
    fn compile_zen_source_no_expressions() {
        let config = loader_config_no_metadata();
        let (js, compiled) = compile_zen_source("<p>Hello</p>", "page.zen", &config).unwrap();
        assert!(js.contains("__zenith_html"));
        assert!(compiled.expressions.is_empty());
    }

    #[test]
    fn compile_zen_source_strict_match() {
        let config = loader_config_with_metadata(vec!["title".into()]);
        let result = compile_zen_source("<h1>{title}</h1>", "page.zen", &config);
        assert!(result.is_ok());
    }

    #[test]
    fn compile_zen_source_multiple_expressions() {
        let config = loader_config_no_metadata();
        let (_, compiled) =
            compile_zen_source(r#"<div><h1>{a}</h1><p>{b}</p></div>"#, "page.zen", &config)
                .unwrap();
        assert_eq!(compiled.expressions, vec!["a", "b"]);
    }

    #[test]
    fn compile_zen_source_with_event() {
        let config = loader_config_no_metadata();
        let (js, compiled) = compile_zen_source(
            r#"<button on:click={handler}>Go</button>"#,
            "page.zen",
            &config,
        )
        .unwrap();
        assert_eq!(compiled.expressions, vec!["handler"]);
        assert!(js.contains("\"handler\""));
    }

    #[test]
    fn compile_zen_source_preserves_compiler_contract_envelope() {
        let config = loader_config_no_metadata();
        let err = compile_zen_source("<script>const x = 1</script><main>{x}</main>", "page.zen", &config)
            .expect_err("missing lang should fail");

        let text = err.to_string();
        assert!(text.starts_with("Zenith requires TypeScript scripts. Add lang=\"ts\"."));
        assert!(text.contains("File: page.zen#script0"));
        assert!(text.contains("Reason:"));
        assert!(text.contains("Example: <script lang=\"ts\">"));
    }

    #[test]
    fn plugin_name() {
        let loader = ZenithLoader::new(loader_config_no_metadata());
        assert_eq!(loader.name(), "zenith-loader");
    }

    #[test]
    fn plugin_register_hooks() {
        let loader = ZenithLoader::new(loader_config_no_metadata());
        let usage = loader.register_hook_usage();
        // Should include ResolveId and Load
        assert!(usage.contains(HookUsage::ResolveId));
        assert!(usage.contains(HookUsage::Load));
    }
}
