//! ZenithPlugin - Rolldown Plugin for .zen file compilation
//!
//! Implements the Rolldown Plugin trait to:
//! 1. Intercept `.zen` file imports via `resolve_id`
//! 2. Compile `.zen` files via Zenith compiler in `load`
//! 3. Buffer CSS for later pruning/stitching
//! 4. Emit optimized CSS in `generate_bundle`

use std::sync::Arc;

use dashmap::DashMap;
use rolldown_common::{EmittedAsset, Output, ResolvedExternal, StrOrBytes};
use rolldown_plugin::{
    HookGenerateBundleArgs, HookLoadArgs, HookLoadOutput, HookResolveIdArgs, HookResolveIdOutput,
    HookTransformArgs, HookTransformReturn, HookUsage, LoadPluginContext, Plugin, PluginContext,
    TransformPluginContext,
};

use crate::css::CssBuffer;
use crate::store::AssetStore;

// Re-export ZenManifestExport from compiler-native as our canonical Manifest type
pub use compiler_native::{
    compile_zen_internal, CompileOptions, CompileResult, ZenManifestExport as ZenManifest,
};

/// The Zenith Plugin for Rolldown
#[derive(Debug)]
pub struct ZenithPlugin {
    /// Buffer for CSS extracted from .zen files
    css_buffer: Arc<CssBuffer>,
    /// Collected CSS classes for pruning
    used_classes: Arc<DashMap<String, ()>>,
    /// Components directory path
    components_dir: Option<String>,
    /// User's entry point (e.g., "./src/main.zen")
    entry_point: String,

    /// In-memory asset store for Dev Server (optional)
    store: Option<Arc<AssetStore>>,

    /// Dev mode flag (enables HMR footer injection)
    is_dev: bool,
}

impl ZenithPlugin {
    pub fn new(entry_point: impl Into<String>) -> Self {
        Self {
            css_buffer: Arc::new(CssBuffer::new()),
            used_classes: Arc::new(DashMap::new()),
            components_dir: None,
            entry_point: entry_point.into(),
            store: None,
            is_dev: false,
        }
    }

    pub fn with_store(mut self, store: Arc<AssetStore>) -> Self {
        self.store = Some(store);
        self
    }

    pub fn with_dev_mode(mut self, is_dev: bool) -> Self {
        self.is_dev = is_dev;
        self
    }

    pub fn with_components_dir(mut self, dir: impl Into<String>) -> Self {
        self.components_dir = Some(dir.into());
        self
    }

    /// Get the collected CSS buffer for final emission
    pub fn css_buffer(&self) -> Arc<CssBuffer> {
        Arc::clone(&self.css_buffer)
    }

    /// Get all used CSS classes for pruning
    pub fn used_classes(&self) -> Vec<String> {
        self.used_classes.iter().map(|r| r.key().clone()).collect()
    }
}

impl Plugin for ZenithPlugin {
    fn name(&self) -> std::borrow::Cow<'static, str> {
        std::borrow::Cow::Borrowed("zenith")
    }

    fn register_hook_usage(&self) -> HookUsage {
        HookUsage::ResolveId | HookUsage::Load | HookUsage::GenerateBundle | HookUsage::Transform
    }

    /// Inject HMR footer if in dev mode
    async fn transform(
        &self,
        _ctx: std::sync::Arc<TransformPluginContext>,
        args: &HookTransformArgs<'_>,
    ) -> HookTransformReturn {
        if !self.is_dev {
            return Ok(None);
        }

        if args.id.ends_with(".zen") {
            let mut code = args.code.to_string();
            // Inject HMR Logic
            let footer = format!(
                r#"
if (import.meta.hot) {{
    import.meta.hot.accept((newModule) => {{
        // Surgical Re-Mount Logic
        // Find anchors with data-z-id matching this file?
        // For now, reload page if hydration fails?
        // Or assume the component handles re-mount?
        // newModule.default(target, props);
    }});
}}
"#
            );
            code.push_str(&footer);

            return Ok(Some(rolldown_plugin::HookTransformOutput {
                code: Some(code),
                ..Default::default()
            }));
        }
        Ok(None)
    }

    /// Intercept .zen file imports
    async fn resolve_id(
        &self,
        _ctx: &PluginContext,
        args: &HookResolveIdArgs<'_>,
    ) -> rolldown_plugin::HookResolveIdReturn {
        let specifier = args.specifier;

        // Handle .zen files
        if specifier.ends_with(".zen") {
            return Ok(Some(HookResolveIdOutput {
                id: specifier.to_string().into(),
                external: Some(ResolvedExternal::Bool(false)),
                ..Default::default()
            }));
        }

        // Handle virtual entry
        if specifier == "virtual:zenith-entry" || specifier.starts_with("\0zenith:") {
            return Ok(Some(HookResolveIdOutput {
                id: specifier.to_string().into(),
                external: Some(ResolvedExternal::Bool(false)),
                ..Default::default()
            }));
        }

        Ok(None)
    }

    /// Load and compile .zen files
    async fn load(
        &self,
        _ctx: Arc<LoadPluginContext>,
        args: &HookLoadArgs<'_>,
    ) -> rolldown_plugin::HookLoadReturn {
        let id = &args.id;

        // Handle virtual entry - this is the Hydration Controller
        if &**id == "virtual:zenith-entry" {
            return Ok(Some(HookLoadOutput {
                code: self.generate_hydration_controller().into(),
                ..Default::default()
            }));
        }

        // Handle .zen files
        if id.ends_with(".zen") {
            let source = match std::fs::read_to_string(&**id) {
                Ok(s) => s,
                Err(e) => {
                    return Err(anyhow::anyhow!("Failed to read .zen file: {}", e));
                }
            };

            // Compile using internal Rust-to-Rust API (no JSON serialization)
            let result = compile_zen_internal(&source, &**id, CompileOptions::default())
                .map_err(|e| anyhow::anyhow!("{}", e))?;

            if result.has_errors {
                return Err(anyhow::anyhow!("Compilation errors: {:?}", result.errors));
            }

            // Get manifest for capability info
            let manifest = result
                .manifest
                .ok_or_else(|| anyhow::anyhow!("No manifest generated"))?;

            // Buffer the CSS for later pruning/emission
            if !manifest.styles.is_empty() {
                self.css_buffer
                    .insert(id.to_string(), manifest.styles.clone());
            }

            // Collect CSS classes for pruning
            for class in &manifest.css_classes {
                self.used_classes.insert(class.to_owned(), ());
            }

            // Generate the module code (script + expressions)
            let js_code = self.generate_module_code(&manifest);

            return Ok(Some(HookLoadOutput {
                code: js_code.into(),
                ..Default::default()
            }));
        }

        Ok(None)
    }

    /// Emit the final optimized CSS asset
    async fn generate_bundle(
        &self,
        ctx: &PluginContext,
        args: &mut HookGenerateBundleArgs<'_>,
    ) -> rolldown_plugin::HookNoopReturn {
        // 1. Populate Store (if present)
        if let Some(store) = &self.store {
            for output in args.bundle.iter() {
                match output {
                    Output::Asset(a) => {
                        // Attempt to extract source string
                        // rolldown_common::StrOrBytes (Assuming Str/Bytes variants)
                        let source = match &a.source {
                            StrOrBytes::Str(s) => s.to_string(),
                            StrOrBytes::Bytes(b) => String::from_utf8_lossy(b).to_string(),
                        };
                        store.update(a.filename.to_string(), source);
                    }
                    Output::Chunk(c) => {
                        store.update(c.filename.to_string(), c.code.clone());
                    }
                }
            }
        }

        let used_classes = self.used_classes();
        let css_content = self
            .css_buffer
            .stitch_and_prune(&used_classes)
            .map_err(|e| anyhow::anyhow!("{}", e))?;

        if !css_content.is_empty() {
            // Emit the CSS asset
            let asset = EmittedAsset {
                name: Some("zenith.css".into()),
                file_name: None,
                original_file_name: None,
                source: css_content.into_bytes().into(),
            };
            ctx.emit_file(asset, None, None)?;
        }

        Ok(())
    }
}

impl ZenithPlugin {
    /// Generate the Hydration Controller (Bootstrap Loader)
    ///
    /// This is the entry point that:
    /// 1. Immediately: Sets up event delegation (zero-cost, <2KB)
    /// 2. Deferred: Imports the actual app logic via dynamic import
    /// 3. Trigger: Idle callback or timeout
    fn generate_hydration_controller(&self) -> String {
        let entry = &self.entry_point;
        format!(
            r#"
// === ZENITH HYDRATION CONTROLLER ===
// Generated by ZenithPlugin

import {{ delegateEvents }} from 'zenith/runtime/core';

// 1. Immediate: Global listeners (The "Zero-Cost" part)
delegateEvents();

// 2. Deferred: The actual App Logic (The "Heavy" part)
// We wrap the user's entry in a dynamic import to keep it off the main thread
const hydrate = () => import('{entry}');

// 3. Trigger: Interaction or Idle
if ('requestIdleCallback' in window) {{
    requestIdleCallback(hydrate, {{ timeout: 2000 }});
}} else {{
    // Fallback for Safari/older browsers
    setTimeout(hydrate, 200);
}}
"#
        )
    }

    /// Generate the module code for a compiled .zen file
    fn generate_module_code(&self, manifest: &ZenManifest) -> String {
        let mut code = String::new();

        // NPM imports first
        if !manifest.npm_imports.is_empty() {
            code.push_str(&manifest.npm_imports);
            code.push('\n');
        }

        // Author script (component logic)
        if !manifest.script.is_empty() {
            code.push_str("\n// --- COMPONENT SCRIPT ---\n");
            code.push_str(&manifest.script);
            code.push('\n');
        }

        // Expressions (reactive bindings)
        if !manifest.expressions.is_empty() {
            code.push_str("\n// --- EXPRESSIONS ---\n");
            code.push_str(&manifest.expressions);
            code.push('\n');
        }

        // Template (for hydration)
        if !manifest.template.is_empty() {
            code.push_str("\n// --- TEMPLATE (for hydration) ---\n");
            code.push_str(&format!(
                "export const __ZENITH_TEMPLATE__ = `{}`;\n",
                manifest.template.replace("`", "\\`").replace("${", "\\${")
            ));
        }

        // Export capabilities for code splitting
        code.push_str("\n// --- CAPABILITIES ---\n");
        code.push_str(&format!(
            "export const __ZENITH_CAPABILITIES__ = {:?};\n",
            manifest.required_capabilities
        ));
        code.push_str(&format!(
            "export const __ZENITH_USES_STATE__ = {};\n",
            manifest.uses_state
        ));
        code.push_str(&format!(
            "export const __ZENITH_HAS_EVENTS__ = {};\n",
            manifest.has_events
        ));
        code.push_str(&format!(
            "export const __ZENITH_IS_STATIC__ = {};\n",
            manifest.is_static
        ));

        code
    }
}
