//! Discovery Module for Zenith Compiler
//!
//! Port of componentDiscovery.ts and layouts.ts to Rust.
//! Recursively scans directories for .zen files and extracts metadata.

// ═══════════════════════════════════════════════════════════════════════════════

pub fn extract_styles_native(source: String) -> Vec<String> {
    let re = regex::Regex::new(r"(?is)<style[^>]*>([\s\S]*?)</style>").unwrap();
    re.captures_iter(&source)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}
