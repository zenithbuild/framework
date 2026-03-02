use crate::validate::ZenIR;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct CacheEntry {
    pub hash: String,
    pub ir: ZenIR,
}

pub struct IncrementalCache {
    cache_dir: PathBuf,
}

impl IncrementalCache {
    pub fn new() -> Self {
        // Default to .zenith/cache in the current workspace
        let cache_dir = PathBuf::from(".zenith/cache");
        if !cache_dir.exists() {
            fs::create_dir_all(&cache_dir).ok();
        }
        Self { cache_dir }
    }

    pub fn compute_hash(source: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn get_cache_path(&self, file_path: &str) -> PathBuf {
        // Create a stable file name for the cache entry
        let safe_name = file_path
            .replace("/", "_")
            .replace("\\", "_")
            .replace(":", "_");
        self.cache_dir.join(format!("{}.json", safe_name))
    }

    pub fn get(&self, file_path: &str, source: &str) -> Option<ZenIR> {
        let cache_path = self.get_cache_path(file_path);
        if !cache_path.exists() {
            return None;
        }

        let data = match fs::read_to_string(&cache_path) {
            Ok(d) => d,
            Err(_) => return None,
        };

        let entry: CacheEntry = match serde_json::from_str(&data) {
            Ok(e) => e,
            Err(e) => {
                eprintln!(
                    "[ZenithNative] Cache deserialization failed for {}: {}",
                    file_path, e
                );
                // Invalidate corrupt cache file
                fs::remove_file(cache_path).ok();
                return None;
            }
        };

        let current_hash = Self::compute_hash(source);
        if entry.hash == current_hash {
            Some(entry.ir)
        } else {
            None
        }
    }

    pub fn set(&self, file_path: &str, source: &str, ir: ZenIR) {
        let cache_path = self.get_cache_path(file_path);
        let hash = Self::compute_hash(source);
        let entry = CacheEntry { hash, ir };

        if let Ok(data) = serde_json::to_string(&entry) {
            fs::write(cache_path, data).ok();
        }
    }
}
