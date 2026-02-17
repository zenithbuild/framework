//! # Zenith Bundler
//!
//! Deterministic bundler that consumes the sealed `CompilerOutput` from
//! `zenith_compiler` and produces executable JS + virtual CSS.
//!
//! The bundler must NOT mutate, re-index, or reinterpret compiler output.
//! It resolves modules/imports only — never components or cross-file semantics.

pub mod bundle;
pub mod plugin;
pub mod utils;

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use thiserror::Error;

// Re-export the compiler's sealed type so consumers don't need a separate dep
pub use zenith_compiler::compiler::CompilerOutput;

// ---------------------------------------------------------------------------
// Build Mode
// ---------------------------------------------------------------------------

/// The build mode determines sourcemap behavior and optimization level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildMode {
    /// Development — sourcemaps enabled, no minification.
    Dev,
    /// Production — no sourcemaps by default, minification enabled.
    Prod,
    /// Static Site Generation — write to disk, production optimizations.
    SSG,
}

// ---------------------------------------------------------------------------
// Component Definition (opaque to bundler)
// ---------------------------------------------------------------------------

/// A discovered component definition.
/// The bundler forwards this to the loader but never interprets it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentDef {
    /// Filesystem path to the component's `.zen` file.
    pub path: PathBuf,
    /// Raw template source (if pre-loaded).
    pub source: Option<String>,
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

/// A structured diagnostic emitted during bundling.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub level: DiagnosticLevel,
    pub message: String,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiagnosticLevel {
    Error,
    Warning,
    Info,
}

// ---------------------------------------------------------------------------
// BundlePlan
// ---------------------------------------------------------------------------

/// Describes WHAT to bundle.
#[derive(Debug, Clone)]
pub struct BundlePlan {
    /// Path to the `.zen` page file (relative or absolute).
    pub page_path: String,
    /// Output directory. Defaults to `dist/`.
    pub out_dir: Option<PathBuf>,
    /// Build mode.
    pub mode: BuildMode,
}

// ---------------------------------------------------------------------------
// BundleOptions
// ---------------------------------------------------------------------------

/// Describes HOW to bundle.
#[derive(Debug, Clone)]
pub struct BundleOptions {
    /// Optional discovered components map (tag name → definition).
    /// Forwarded to the loader. Bundler never resolves these.
    pub components: Option<HashMap<String, ComponentDef>>,
    /// Optional pre-compiled metadata for validation.
    /// If provided, the bundler validates post-build expressions match.
    pub metadata: Option<CompilerOutput>,
    /// Strict mode (default: true). Invariant violations abort the build.
    pub strict: bool,
    /// Whether to write output files to disk.
    pub write_to_disk: bool,
    /// Explicitly enable/disable minification (overrides mode default).
    pub minify: Option<bool>,
}

impl Default for BundleOptions {
    fn default() -> Self {
        Self {
            components: None,
            metadata: None,
            strict: true,
            write_to_disk: false,
            minify: None,
        }
    }
}

// ---------------------------------------------------------------------------
// BundleResult
// ---------------------------------------------------------------------------

/// The sealed output of a successful bundle.
/// CLI and dev server consume this as-is — no post-concat or mutation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleResult {
    /// Final JS (entry chunk as a string).
    pub entry_js: String,
    /// Virtual collected CSS (if any).
    pub css: Option<String>,
    /// The processed HTML with injected resources.
    pub html: String,
    /// Expression table — must exactly match metadata if provided.
    pub expressions: Vec<String>,
    /// Diagnostics collected during the build.
    pub diagnostics: Vec<Diagnostic>,
}

// ---------------------------------------------------------------------------
// BundleError
// ---------------------------------------------------------------------------

/// Errors that abort the bundle.
#[derive(Debug, Error)]
pub enum BundleError {
    #[error("{0}")]
    CompilerError(String),

    #[error("Expression mismatch: expected {expected} expressions, got {got}")]
    ExpressionMismatch { expected: usize, got: usize },

    #[error("Expression content mismatch at index {index}: expected `{expected}`, got `{got}`")]
    ExpressionContentMismatch {
        index: usize,
        expected: String,
        got: String,
    },

    #[error("Missing data-zx-e placeholder for index {index}")]
    MissingPlaceholder { index: usize },

    #[error("Build failed: {0}")]
    BuildError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Validation failed: {0}")]
    ValidationError(String),
}

// ---------------------------------------------------------------------------
// Public API — Single Emission Engine
// ---------------------------------------------------------------------------

/// Bundle a single page using the Rolldown engine.
///
/// **There is only one bundling codepath.** Every build — single-page,
/// multi-page, dev, prod — runs through Rolldown with the ZenithLoader
/// plugin. This guarantees:
///
/// - One graph builder
/// - One emission flow
/// - One ordering source
/// - Zero divergence vectors
///
/// The bundler:
/// 1. Compiles the `.zen` source via the ZenithLoader plugin
/// 2. Runs Rolldown for graph resolution and chunk emission
/// 3. Validates output against metadata (if provided, in strict mode)
/// 4. Returns a sealed `BundleResult`
pub async fn bundle_page(
    plan: BundlePlan,
    opts: BundleOptions,
) -> Result<BundleResult, BundleError> {
    bundle::execute_bundle(plan, opts).await
}
