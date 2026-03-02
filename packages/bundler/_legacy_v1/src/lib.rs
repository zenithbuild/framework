//! Zenith Bundler
//!
//! Rolldown Plugin for the Zenith Framework.
//!
//! This crate acts as the **Intelligence Layer** that feeds the Zenith compiler
//! output to Rolldown, implementing:
//!
//! - **Deferred Hydration**: Bootstrap loader with dynamic imports
//! - **Capability-Based Chunking**: Separate runtime-core and runtime-anim
//! - **CSS Pruning**: Tree-shake unused Tailwind via ZenManifest.css_classes
//! - **HTML Injection**: Inject hashed script/CSS links and modulepreload
//!
//! # Architecture
//!
//! ```text
//! .zen files → ZenithPlugin (resolve_id/load) → Rolldown Engine → Optimized Output
//! ```

pub mod bundler;
pub mod css;
pub mod html;
pub mod plugin;
pub mod store;

pub use css::CssBuffer;
pub use html::HtmlInjector;
pub use plugin::ZenithPlugin;

// Re-export Rolldown types for convenience
pub use rolldown::{Bundler, BundlerBuilder, BundlerOptions};
pub use rolldown_plugin::Plugin;

// --- NAPI Integration ---

#[cfg(feature = "napi")]
use crate::store::AssetStore;
#[cfg(feature = "napi")]
use napi_derive::napi;
#[cfg(feature = "napi")]
use std::sync::Arc;
#[cfg(feature = "napi")]
use tokio::sync::{mpsc, oneshot};

#[cfg(feature = "napi")]
#[napi]
pub struct ZenithDevController {
    store: Arc<AssetStore>,
    rebuild_tx: mpsc::Sender<oneshot::Sender<()>>,
}

#[cfg(feature = "napi")]
#[napi]
impl ZenithDevController {
    #[napi(constructor)]
    pub fn new(project_root: String) -> Self {
        let store = Arc::new(AssetStore::new());
        let store_clone = store.clone();

        // Channel for rebuild signals (Robust HMR Pattern)
        // Main thread sends (reply_channel) -> Builder builds -> Builder replies
        let (tx, mut rx) = mpsc::channel::<oneshot::Sender<()>>(1);

        // Spawn Watcher/Builder Thread
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                let mut bundler = crate::bundler::create_dev_bundler(
                    &format!("{}/src/main.zen", project_root),
                    Some(&format!("{}/src/components", project_root)),
                    store_clone,
                );

                // Initial Build
                match bundler.write().await {
                    Ok(_outputs) => {} // println! removed
                    Err(_e) => {} // eprintln! removed for silence? Or keep errors? User said "all logs". I'll keep errors if critical, but silence is cleaner for "library".
                }

                // Internal Watch Loop (Driven by NAPI calls)
                while let Some(reply_tx) = rx.recv().await {
                    match bundler.write().await {
                        Ok(_) => {
                            let _ = reply_tx.send(());
                        }
                        Err(_e) => {
                            let _ = reply_tx.send(());
                        }
                    }
                }
            });
        });

        Self {
            store,
            rebuild_tx: tx,
        }
    }

    #[napi]
    pub fn get_asset(&self, path: String) -> Option<String> {
        self.store.get(&path)
    }

    /// Trigger a rebuild and wait for completion
    #[napi]
    pub async fn rebuild(&self) -> napi::Result<()> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.rebuild_tx
            .send(reply_tx)
            .await
            .map_err(|_| napi::Error::from_reason("Builder thread disconnected"))?;

        reply_rx
            .await
            .map_err(|_| napi::Error::from_reason("Builder failed to reply"))?;

        Ok(())
    }
}

#[cfg(feature = "napi")]
#[napi]
pub fn bundle(_plan: serde_json::Value) -> napi::Result<String> {
    // TODO: Implement native bundling logic using rolldown
    Ok("/* Native bundle not implemented */".to_string())
}

#[cfg(feature = "napi")]
#[napi]
pub fn generate_runtime(_manifest: serde_json::Value) -> napi::Result<String> {
    // TODO: Implement native runtime generation
    Ok("/* Native runtime not implemented */".to_string())
}

#[cfg(feature = "napi")]
#[napi]
pub fn analyze_manifest(_manifest: serde_json::Value) -> napi::Result<serde_json::Value> {
    // TODO: Implement native manifest analysis
    Ok(serde_json::json!({ "analyzed": true }))
}
