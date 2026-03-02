//! Zenith Bundler Configuration
//!
//! Provides helper functions to create a pre-configured Rolldown bundler
//! with Zenith's required settings (capability splitting, plugin injection, etc).

use rolldown::{Bundler, BundlerBuilder, BundlerOptions, InputItem};
use std::sync::Arc;

use crate::plugin::ZenithPlugin;

/// Create a configured Rolldown bundler for a Zenith project
pub fn create_zenith_bundler(entry_point: &str, components_dir: Option<&str>) -> Bundler {
    // 1. Initialize the Zenith Plugin
    let mut plugin = ZenithPlugin::new(entry_point);
    if let Some(dir) = components_dir {
        plugin = plugin.with_components_dir(dir);
    }

    // 2. Configure Bundler Options
    // Note: manual_chunks is currently experimental in Rolldown Rust API,
    // we'll need to verify the exact API surface.
    // For now, we rely on the plugin's dynamic imports to drive chunking naturally,
    // and we can enhance this with explicit manual_chunks if the API allows.

    let options = BundlerOptions {
        input: Some(vec![InputItem {
            name: Some("index".into()),
            import: "virtual:zenith-entry".into(), // Start with our Hydration Controller
        }]),
        // Enable code splitting
        format: Some(rolldown_common::OutputFormat::Esm),
        // Ensure we target browser environment
        platform: Some(rolldown_common::Platform::Browser),
        // Capability-Based Chunking:
        // GSAP should be handled as a separate chunk (capability: "anim").
        // We rely on dynamic imports (import('gsap')) in the user's code to automatically split it.
        // Explicit manual_chunks can be added here if stricter control is needed.
        // Capability-based chunking configuration will go here once verified
        ..Default::default()
    };

    let builder = BundlerBuilder::default()
        .with_options(options)
        .with_plugins(vec![Arc::new(plugin)]);

    builder.build().expect("Failed to build bundler")
}

/// Create a configured Rolldown bundler for Dev Mode (Watch + HMR + InMemory)
pub fn create_dev_bundler(
    entry_point: &str,
    components_dir: Option<&str>,
    store: std::sync::Arc<crate::store::AssetStore>,
) -> Bundler {
    // 1. Initialize the Zenith Plugin with Store and Dev Mode
    let mut plugin = ZenithPlugin::new(entry_point)
        .with_store(store)
        .with_dev_mode(true);

    if let Some(dir) = components_dir {
        plugin = plugin.with_components_dir(dir);
    }

    // 2. Configure Bundler Options (Dev Optimized)
    let options = BundlerOptions {
        input: Some(vec![InputItem {
            name: Some("index".into()),
            import: "virtual:zenith-entry".into(),
        }]),
        format: Some(rolldown_common::OutputFormat::Esm),
        platform: Some(rolldown_common::Platform::Browser),
        sourcemap: Some(rolldown_common::SourceMapType::File), // Enable sourcemaps for dev
        ..Default::default()
    };

    let builder = BundlerBuilder::default()
        .with_options(options)
        .with_plugins(vec![Arc::new(plugin)]);

    builder.build().expect("Failed to build dev bundler")
}
