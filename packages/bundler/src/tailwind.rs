use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use zenith_compiler::deterministic::sha256_hex;

use crate::utils::{contains_raw_tailwind_import, stable_hash_8};

#[derive(Debug, Clone, Default)]
pub struct TailwindCompileStats {
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub cache_entries: usize,
}

#[derive(Default)]
struct TailwindCompileCache {
    entries: BTreeMap<String, String>,
    stats: TailwindCompileStats,
}

fn cache() -> &'static Mutex<TailwindCompileCache> {
    static CACHE: OnceLock<Mutex<TailwindCompileCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(TailwindCompileCache::default()))
}

fn tailwind_cli_candidates(project_root: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(override_path) = env::var("ZENITH_TAILWIND_BIN") {
        if !override_path.trim().is_empty() {
            candidates.push(PathBuf::from(override_path));
        }
    }

    let mut cursor = Some(project_root);
    while let Some(dir) = cursor {
        candidates.push(dir.join("node_modules/.bin/tailwindcss"));
        candidates.push(dir.join("node_modules/.bin/tailwindcss.cmd"));
        candidates.push(dir.join("node_modules/.bin/tailwindcss.ps1"));
        cursor = dir.parent();
    }

    candidates
}

fn resolve_tailwind_cli(project_root: &Path) -> Result<PathBuf, String> {
    for candidate in tailwind_cli_candidates(project_root) {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Tailwind CSS integration error: could not locate the Tailwind v4 CLI binary.\n  project_root: {}\n  expected: node_modules/.bin/tailwindcss (or set ZENITH_TAILWIND_BIN)\n  fix: install tailwindcss and @tailwindcss/cli in the app project",
        project_root.display()
    ))
}

fn build_compile_cache_key(
    project_root: &Path,
    cli_bin: &Path,
    input_path: &Path,
    source: &str,
) -> String {
    format!(
        "{}:{}:{}:{}",
        project_root.display(),
        cli_bin.display(),
        input_path.display(),
        sha256_hex(source.as_bytes()),
    )
}

pub fn compile_stats() -> TailwindCompileStats {
    let cache = cache().lock().expect("tailwind compile cache poisoned");
    let mut stats = cache.stats.clone();
    stats.cache_entries = cache.entries.len();
    stats
}

pub fn compile_tailwind_entry(
    project_root: &Path,
    input_path: &Path,
    source: &str,
) -> Result<String, String> {
    if !contains_raw_tailwind_import(source) {
        return Ok(source.to_string());
    }

    let cli_bin = resolve_tailwind_cli(project_root)?;
    let cache_key = build_compile_cache_key(project_root, &cli_bin, input_path, source);
    {
        let mut cache = cache().lock().expect("tailwind compile cache poisoned");
        if let Some(compiled) = cache.entries.get(&cache_key).cloned() {
            cache.stats.cache_hits += 1;
            return Ok(compiled);
        }
    }

    let hash_seed = format!("{}:{}", input_path.display(), sha256_hex(source.as_bytes()));
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp_name = format!(
        "zenith-tailwind-{}-{}-{}.css",
        stable_hash_8(&hash_seed),
        std::process::id(),
        unique_suffix
    );
    let out_path = env::temp_dir().join(tmp_name);

    let output = Command::new(&cli_bin)
        .current_dir(project_root)
        .arg("-i")
        .arg(input_path)
        .arg("-o")
        .arg(&out_path)
        .arg("--minify")
        .output()
        .map_err(|err| {
            format!(
                "Tailwind CSS integration error: failed to spawn CLI.\n  project_root: {}\n  input: {}\n  cli: {}\n  reason: {err}",
                project_root.display(),
                input_path.display(),
                cli_bin.display()
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Tailwind CSS integration error: CLI compilation failed.\n  project_root: {}\n  input: {}\n  cli: {}\n  status: {}\n  stdout: {}\n  stderr: {}",
            project_root.display(),
            input_path.display(),
            cli_bin.display(),
            output.status,
            stdout.trim(),
            stderr.trim()
        ));
    }

    let compiled = fs::read_to_string(&out_path).map_err(|err| {
        format!(
            "Tailwind CSS integration error: failed to read compiled output.\n  input: {}\n  output: {}\n  reason: {err}",
            input_path.display(),
            out_path.display()
        )
    })?;
    let _ = fs::remove_file(&out_path);

    if compiled.trim().is_empty() {
        return Err(format!(
            "Tailwind CSS integration error: compiled CSS was empty.\n  input: {}\n  output: {}",
            input_path.display(),
            out_path.display()
        ));
    }

    if contains_raw_tailwind_import(&compiled) {
        return Err(format!(
            "Tailwind CSS integration error: raw @import \"tailwindcss\" survived internal compilation.\n  input: {}\n  output: {}",
            input_path.display(),
            out_path.display()
        ));
    }

    let mut cache = cache().lock().expect("tailwind compile cache poisoned");
    cache.stats.cache_misses += 1;
    cache.entries.insert(cache_key, compiled.clone());
    Ok(compiled)
}
