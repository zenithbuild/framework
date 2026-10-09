use regex::Regex;
use rolldown::{Bundler, BundlerOptions, InputItem};
use rolldown_common::{Output, OutputFormat, Platform};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use zenith_compiler::deterministic::sha256_hex;

use crate::output_mode::{write_file_for_mode, OutputMode};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendorBuildResult {
    pub specifiers: Vec<String>,
    pub filename: String,
    pub content: String,
    pub entries: BTreeMap<String, String>,
    pub assets: BTreeMap<String, Vec<u8>>,
}

pub async fn bundle_vendor(
    inputs: &[BundlerInput],
    out_dir: &Path,
    output_mode: OutputMode,
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

    let lockfile_hash = read_lockfile_hash(out_dir).unwrap_or_else(|| "no_lockfile".to_string());
    let seed = format!(
        "ZENITH_VENDOR_CACHE_v3\n{lockfile_hash}\n{EXPECTED_ROLLDOWN_COMMIT}\n{output_mode:?}\n{}",
        sorted_externals.join("\n")
    );
    let seed_hash = sha256_hex(seed.as_bytes());
    let project_root = find_project_root(out_dir).unwrap_or_else(|| PathBuf::from("."));
    let cache_dir = project_root.join(".zenith/cache/vendor");
    let cached_file = cache_dir.join(format!("{}.json", &seed_hash[..16]));
    if let Ok(bytes) = std::fs::read(&cached_file) {
        if let Ok(result) = serde_json::from_slice::<VendorBuildResult>(&bytes) {
            emit_vendor_assets(&result, out_dir, output_mode)?;
            println!("[zenith] Vendor cache hit: {}", &seed_hash[..16]);
            return Ok(Some(result));
        }
    }

    // Each dependency is its own ESM entry. Merging export-star declarations
    // loses defaults and makes otherwise unrelated named exports ambiguous.
    let mut options = BundlerOptions::default();
    options.cwd = Some(project_root);
    options.input = Some(
        sorted_externals
            .iter()
            .map(|specifier| InputItem {
                name: Some(vendor_entry_name(specifier)),
                import: specifier.clone(),
            })
            .collect(),
    );
    options.platform = Some(Platform::Browser);
    options.format = Some(OutputFormat::Esm);
    options.entry_filenames = Some(
        if output_mode.is_dev_stable() {
            "[name].dev.js".to_string()
        } else {
            format!("[name].{}.[hash].js", &seed_hash[..8])
        }
        .into(),
    );
    options.chunk_filenames = Some("vendor-chunks/[name]-[hash].js".to_string().into());
    options.asset_filenames = Some("vendor-assets/[name]-[hash][extname]".to_string().into());
    let mut bundler =
        Bundler::new(options).map_err(|error| format!("Rolldown init error: {error:?}"))?;
    // Generate in memory: write() also writes to Rolldown's default dist folder.
    let output = bundler
        .generate()
        .await
        .map_err(|error| format!("Rolldown build error: {error:?}"))?;
    let mut entries = BTreeMap::new();
    let mut assets = BTreeMap::new();
    for asset in output.assets {
        if let Output::Chunk(chunk) = &asset {
            if chunk.is_entry {
                for specifier in &sorted_externals {
                    if chunk.name.as_str() == vendor_entry_name(specifier) {
                        entries.insert(specifier.clone(), chunk.filename.to_string());
                    }
                }
            }
        }
        assets.insert(
            asset.filename().to_string(),
            asset.content_as_bytes().to_vec(),
        );
    }
    if entries.len() != sorted_externals.len() {
        return Err("Rolldown did not emit every vendor entry".to_string());
    }
    // Retain the manifest's singular vendor preload field; page imports select
    // the matching dependency entry, including on the incremental fast path.
    let filename = entries[&sorted_externals[0]].clone();
    let content = String::from_utf8(assets[&filename].clone()).map_err(|e| e.to_string())?;
    let result = VendorBuildResult {
        specifiers: sorted_externals,
        filename,
        content,
        entries,
        assets,
    };
    emit_vendor_assets(&result, out_dir, output_mode)?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        cached_file,
        serde_json::to_vec(&result).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(Some(result))
}

pub(crate) fn vendor_entry_name(specifier: &str) -> String {
    format!("vendor.{}", &sha256_hex(specifier.as_bytes())[..16])
}

fn emit_vendor_assets(
    result: &VendorBuildResult,
    out_dir: &Path,
    mode: OutputMode,
) -> Result<(), String> {
    for (filename, bytes) in &result.assets {
        let relative = Path::new(filename);
        if relative
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err(format!("invalid vendor output path: {filename}"));
        }
        let path = out_dir.join("assets").join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        if let Ok(text) = std::str::from_utf8(bytes) {
            write_file_for_mode(&path, text, mode)?;
        } else {
            std::fs::write(path, bytes).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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

fn read_lockfile_hash(base_dir: &Path) -> Option<String> {
    let mut current = base_dir;
    loop {
        let lock_bun = current.join("bun.lock");
        let lock_bun_binary = current.join("bun.lockb");
        let lock_npm = current.join("package-lock.json");
        let lock_pnpm = current.join("pnpm-lock.yaml");
        let lock_yarn = current.join("yarn.lock");

        if lock_bun.exists() {
            return std::fs::read(&lock_bun).ok().map(|b| sha256_hex(&b));
        }
        if lock_bun_binary.exists() {
            return std::fs::read(&lock_bun_binary).ok().map(|b| sha256_hex(&b));
        }
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
