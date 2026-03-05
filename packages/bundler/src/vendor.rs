use regex::Regex;
use rolldown::{Bundler, BundlerOptions, InputItem};
use rolldown_common::{Output, OutputFormat, Platform};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use zenith_compiler::deterministic::sha256_hex;

use crate::BundlerInput;
use zenith_bundler::utils::{EXPECTED_ROLLDOWN_COMMIT, VIRTUAL_PREFIX};

const FRAMEWORK_INTEROP_DENYLIST: &[&str] = &[
    "react",
    "react-dom",
    "vue",
    "svelte",
    "solid-js",
    "preact",
    "lit",
    "@angular/core",
];

#[derive(Debug, Clone)]
pub struct VendorBuildResult {
    pub specifiers: Vec<String>,
    pub filename: String,
}

pub async fn bundle_vendor(
    inputs: &[BundlerInput],
    out_dir: &Path,
) -> Result<Option<VendorBuildResult>, String> {
    // 1. Collect and deduplicate external specifiers
    let mut externals = BTreeSet::new();

    for input in inputs {
        for import in &input.ir.imports {
            if is_external(&import.spec) {
                externals.insert(import.spec.clone());
            }
        }
        // Also check hoisted imports if any (legacy IR compatibility).
        for entry in &input.ir.hoisted.imports {
            let specs = collect_js_import_specifiers(entry);
            if specs.is_empty() {
                if is_external(entry) {
                    externals.insert(entry.clone());
                }
                continue;
            }
            for spec in specs {
                if is_external(&spec) {
                    externals.insert(spec);
                }
            }
        }
        // Extract from module sources and component scripts so vendor detection
        // matches emitted runtime assets, not just compiler import metadata.
        for module in &input.ir.modules {
            for spec in collect_js_import_specifiers(&module.source) {
                if is_external(&spec) {
                    externals.insert(spec);
                }
            }
        }
        for script in input.ir.components_scripts.values() {
            for spec in collect_js_import_specifiers(&script.code) {
                if is_external(&spec) {
                    externals.insert(spec);
                }
            }
            for import_stmt in &script.imports {
                for spec in collect_js_import_specifiers(import_stmt) {
                    if is_external(&spec) {
                        externals.insert(spec);
                    }
                }
            }
        }
    }

    if externals.is_empty() {
        return Ok(None);
    }

    let sorted_externals: Vec<String> = externals.into_iter().collect();
    let blocked_frameworks: BTreeSet<String> = sorted_externals
        .iter()
        .filter_map(|spec| framework_interop_match(spec).map(|_| spec.clone()))
        .collect();
    if !blocked_frameworks.is_empty() {
        let blocked = blocked_frameworks
            .into_iter()
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "Framework interop imports are not supported yet. If you want this, we need an explicit adapter/islands layer.\nblocked_specifiers: {}\nallowed_now: framework-neutral third-party ESM libraries (for example: gsap, three, date-fns)",
            blocked
        ));
    }

    // 2. Compute Vendor Seed Hash
    let lockfile_hash = read_lockfile_hash(out_dir).unwrap_or_else(|| "no_lockfile".to_string());

    // Seed construction
    let mut seed = String::with_capacity(1024);
    seed.push_str("ZENITH_VENDOR_CACHE_v2\n");
    seed.push_str(&lockfile_hash);
    seed.push('\n');
    seed.push_str("ROLLDOWN_COMMIT:\n");
    seed.push_str(EXPECTED_ROLLDOWN_COMMIT);
    seed.push_str("\nEXTERNALS:\n");
    for spec in &sorted_externals {
        seed.push_str(spec);
        seed.push('\n');
    }
    let seed_hash = sha256_hex(seed.as_bytes());
    let short_hash = seed_hash[0..16].to_string(); // 16 chars enough for cache key

    // 3. Check Cache
    let project_root = find_project_root(out_dir).unwrap_or_else(|| PathBuf::from("."));
    let cache_dir = project_root.join(".zenith").join("cache").join("vendor");
    let cached_file = cache_dir.join(format!("{}.js", short_hash));

    if cached_file.exists() {
        // Cache Hit
        println!("[zenith] Vendor cache hit: {}", short_hash);
        let content = std::fs::read_to_string(&cached_file).map_err(|e| e.to_string())?;

        let content_hash = compute_vendor_content_hash(&lockfile_hash, &sorted_externals, &content);
        let final_filename = format!("vendor.{}.js", content_hash);

        // Write to assets
        let assets_dir = out_dir.join("assets");
        std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
        std::fs::write(assets_dir.join(&final_filename), &content).map_err(|e| e.to_string())?;

        return Ok(Some(VendorBuildResult {
            specifiers: sorted_externals,
            filename: final_filename,
        }));
    }

    // 4. Generate Virtual Entry
    let mut entry_source = String::new();
    for spec in &sorted_externals {
        entry_source.push_str(&format!("export * from \"{}\";\n", spec));
    }

    // 5. Run Rolldown
    let entry_path = out_dir.join("__zenith_vendor_entry__.js");
    std::fs::write(&entry_path, &entry_source).map_err(|e| e.to_string())?;

    let mut options = BundlerOptions::default();
    options.input = Some(vec![InputItem {
        name: Some("vendor".to_string()),
        import: entry_path.to_string_lossy().to_string(),
    }]);
    options.platform = Some(Platform::Browser);
    options.format = Some(OutputFormat::Esm);

    let bundler = Bundler::new(options);

    let mut bundler = match bundler {
        Ok(b) => b,
        Err(e) => return Err(format!("Rolldown init error: {:?}", e)),
    };

    let build_result = bundler
        .write()
        .await
        .map_err(|e| format!("Rolldown build error: {:?}", e))?;

    // Find output chunk
    let chunk_code = build_result
        .assets
        .iter()
        .find_map(|output| {
            match output {
                Output::Chunk(chunk) => {
                    // Check if this is the vendor chunk.
                    // OutputChunk usually has `name` which matches input name ("vendor").
                    // Or filename "vendor.js" (if no hash).
                    // Rolldown default filename is "[name].js" for entry.
                    if chunk.name.as_str() == "vendor" || chunk.filename.as_str().contains("vendor")
                    {
                        Some(chunk.code.clone())
                    } else {
                        None
                    }
                }
                _ => None,
            }
        })
        .ok_or("Rolldown did not emit vendor chunk")?;

    let content = &chunk_code;

    // 6. Compute Final Metadata
    let content_hash = compute_vendor_content_hash(&lockfile_hash, &sorted_externals, content);
    let final_filename = format!("vendor.{}.js", content_hash);

    // 7. Write to Output & Cache
    let assets_dir = out_dir.join("assets");
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    std::fs::write(assets_dir.join(&final_filename), content).map_err(|e| e.to_string())?;

    // Write to cache
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    std::fs::write(&cached_file, content).map_err(|e| e.to_string())?;

    Ok(Some(VendorBuildResult {
        specifiers: sorted_externals,
        filename: final_filename,
    }))
}

fn is_external(spec: &str) -> bool {
    !spec.starts_with('.')
        && !spec.starts_with('/')
        && !spec.starts_with("@/")
        && !spec.starts_with(VIRTUAL_PREFIX)
        && !spec.contains("zenith:")
}

fn collect_js_import_specifiers(source: &str) -> Vec<String> {
    let static_import_re =
        Regex::new(r#"(?m)\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]"#).unwrap();
    let dynamic_import_re = Regex::new(r#"(?m)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    let export_from_re =
        Regex::new(r#"(?m)\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();

    let mut out = Vec::new();
    for captures in static_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in dynamic_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in export_from_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}

fn framework_interop_match(spec: &str) -> Option<&'static str> {
    let normalized = spec.strip_prefix("npm:").unwrap_or(spec);
    FRAMEWORK_INTEROP_DENYLIST
        .iter()
        .copied()
        .find(|denied| normalized == *denied || normalized.starts_with(&format!("{denied}/")))
}

fn compute_vendor_content_hash(
    lockfile_hash: &str,
    externals: &[String],
    vendor_code: &str,
) -> String {
    let mut seed = String::with_capacity(vendor_code.len() + 1024);
    seed.push_str("ZENITH_VENDOR_HASH_v2\n");
    seed.push_str("LOCKFILE:\n");
    seed.push_str(lockfile_hash);
    seed.push('\n');
    seed.push_str("ROLLDOWN_COMMIT:\n");
    seed.push_str(EXPECTED_ROLLDOWN_COMMIT);
    seed.push('\n');
    seed.push_str("EXTERNALS:\n");
    for spec in externals {
        seed.push_str(spec);
        seed.push('\n');
    }
    seed.push_str("VENDOR_CODE:\n");
    seed.push_str(vendor_code);
    sha256_hex(seed.as_bytes())[0..8].to_string()
}

fn read_lockfile_hash(base_dir: &Path) -> Option<String> {
    let mut current = base_dir;
    loop {
        let lock_npm = current.join("package-lock.json");
        let lock_pnpm = current.join("pnpm-lock.yaml");
        let lock_yarn = current.join("yarn.lock");

        if lock_npm.exists() {
            return std::fs::read(&lock_npm).ok().map(|b| sha256_hex(&b));
        }
        if lock_pnpm.exists() {
            return std::fs::read(&lock_pnpm).ok().map(|b| sha256_hex(&b));
        }
        if lock_yarn.exists() {
            return std::fs::read(&lock_yarn).ok().map(|b| sha256_hex(&b));
        }

        if let Some(parent) = current.parent() {
            current = parent;
        } else {
            break;
        }
    }
    None
}

fn find_project_root(start: &Path) -> Option<PathBuf> {
    let mut current = start;
    loop {
        if current.join("package.json").exists() {
            return Some(current.to_path_buf());
        }
        if let Some(parent) = current.parent() {
            current = parent;
        } else {
            break;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_denylist_blocks_exact_and_subpath() {
        assert_eq!(framework_interop_match("react"), Some("react"));
        assert_eq!(
            framework_interop_match("react-dom/client"),
            Some("react-dom")
        );
        assert_eq!(
            framework_interop_match("@angular/core/testing"),
            Some("@angular/core")
        );
        assert_eq!(framework_interop_match("gsap"), None);
        assert_eq!(framework_interop_match("date-fns"), None);
    }

    #[test]
    fn collect_js_import_specifiers_extracts_static_dynamic_and_export_from() {
        let source = "import { gsap } from 'gsap'; import \"./styles/output.css\"; export { format } from \"date-fns\"; const m = import('three');";
        let specs = collect_js_import_specifiers(source);
        assert!(specs.contains(&"gsap".to_string()));
        assert!(specs.contains(&"./styles/output.css".to_string()));
        assert!(specs.contains(&"date-fns".to_string()));
        assert!(specs.contains(&"three".to_string()));
    }

    #[test]
    fn is_external_skips_zenith_alias_paths() {
        assert!(!is_external("@/components/ui/Hero.zen"));
        assert!(is_external("@scope/pkg"));
        assert!(is_external("gsap"));
    }
}
