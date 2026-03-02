//! In-memory Asset Store for Dev Server
//!
//! Provides a thread-safe DashMap to store compiled assets (JS/CSS)
//! for memory-only serving in dev mode.

use dashmap::DashMap;
use std::sync::Arc;

/// Thread-safe in-memory asset store
#[derive(Debug, Clone)]
pub struct AssetStore {
    /// Map of normalized file path (starts with /) to content
    assets: Arc<DashMap<String, String>>,
}

impl AssetStore {
    pub fn new() -> Self {
        Self {
            assets: Arc::new(DashMap::new()),
        }
    }

    /// Update asset content
    /// Automatically ensures path starts with /
    pub fn update(&self, path: String, content: String) {
        let normalized = if path.starts_with('/') {
            path
        } else {
            format!("/{}", path)
        };
        self.assets.insert(normalized, content);
    }

    /// Retrieve asset content
    pub fn get(&self, path: &str) -> Option<String> {
        self.assets.get(path).map(|r| r.value().clone())
    }
}

impl Default for AssetStore {
    fn default() -> Self {
        Self::new()
    }
}
