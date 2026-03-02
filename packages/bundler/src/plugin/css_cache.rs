//! Thread-safe CSS cache for collecting virtual CSS per page.
//!
//! The loader writes CSS here during `transform`. The bundler reads it
//! during `generateBundle` or when serving virtual CSS modules.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

/// Thread-safe CSS cache keyed by page ID.
/// Includes dirty tracking for HMR live reload.
#[derive(Debug, Clone)]
pub struct CssCache {
    inner: Arc<RwLock<HashMap<String, String>>>,
    /// Pages that have been modified since last check.
    dirty: Arc<RwLock<HashSet<String>>>,
}

impl CssCache {
    /// Create a new empty cache.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            dirty: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// Insert or overwrite CSS for a page. Returns the old value if any.
    pub fn insert(&self, page_id: &str, css: String) -> Option<String> {
        let mut map = self.inner.write().expect("CSS cache poisoned");
        let mut dirty = self.dirty.write().expect("CSS dirty set poisoned");
        dirty.insert(page_id.to_string());
        map.insert(page_id.to_string(), css)
    }

    /// Get the cached CSS for a page.
    pub fn get(&self, page_id: &str) -> Option<String> {
        let map = self.inner.read().expect("CSS cache poisoned");
        map.get(page_id).cloned()
    }

    /// Remove CSS for a page (used during HMR invalidation).
    pub fn remove(&self, page_id: &str) -> Option<String> {
        let mut map = self.inner.write().expect("CSS cache poisoned");
        map.remove(page_id)
    }

    /// Clear all cached CSS. Used between builds to prevent stale data.
    pub fn clear(&self) {
        let mut map = self.inner.write().expect("CSS cache poisoned");
        map.clear();
    }

    /// Check if a page has cached CSS.
    pub fn contains(&self, page_id: &str) -> bool {
        let map = self.inner.read().expect("CSS cache poisoned");
        map.contains_key(page_id)
    }

    /// Number of pages with cached CSS.
    pub fn len(&self) -> usize {
        let map = self.inner.read().expect("CSS cache poisoned");
        map.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Invalidate CSS for a page — removes from cache and marks dirty.
    /// Used during HMR to trigger CSS live reload.
    pub fn invalidate(&self, page_id: &str) {
        let mut map = self.inner.write().expect("CSS cache poisoned");
        let mut dirty = self.dirty.write().expect("CSS dirty set poisoned");
        map.remove(page_id);
        dirty.insert(page_id.to_string());
    }

    /// Check if a page's CSS has been modified since last check.
    /// Clears the dirty flag for this page after reading.
    pub fn has_changed(&self, page_id: &str) -> bool {
        let mut dirty = self.dirty.write().expect("CSS dirty set poisoned");
        dirty.remove(page_id)
    }
}

impl Default for CssCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_get() {
        let cache = CssCache::new();
        cache.insert("home", ".app { color: red }".into());
        assert_eq!(cache.get("home"), Some(".app { color: red }".into()));
    }

    #[test]
    fn get_nonexistent() {
        let cache = CssCache::new();
        assert_eq!(cache.get("missing"), None);
    }

    #[test]
    fn overwrite() {
        let cache = CssCache::new();
        cache.insert("home", "old".into());
        cache.insert("home", "new".into());
        assert_eq!(cache.get("home"), Some("new".into()));
    }

    #[test]
    fn remove() {
        let cache = CssCache::new();
        cache.insert("home", "css".into());
        let removed = cache.remove("home");
        assert_eq!(removed, Some("css".into()));
        assert!(cache.is_empty());
    }

    #[test]
    fn clear() {
        let cache = CssCache::new();
        cache.insert("a", "1".into());
        cache.insert("b", "2".into());
        assert_eq!(cache.len(), 2);
        cache.clear();
        assert!(cache.is_empty());
    }

    #[test]
    fn thread_safety() {
        use std::thread;

        let cache = CssCache::new();
        let cache_clone = cache.clone();

        let handle = thread::spawn(move || {
            cache_clone.insert("thread", "data".into());
        });

        handle.join().unwrap();
        assert_eq!(cache.get("thread"), Some("data".into()));
    }
}
