use std::fs;
use std::path::{Path, PathBuf};
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    Standard,
    DevStable,
}

impl OutputMode {
    pub fn from_dev_stable_flag(enabled: bool) -> Self {
        if enabled {
            Self::DevStable
        } else {
            Self::Standard
        }
    }

    pub fn is_dev_stable(self) -> bool {
        matches!(self, Self::DevStable)
    }

    pub fn css_rel(self, hash: &str) -> String {
        if self.is_dev_stable() {
            "assets/styles.dev.css".to_string()
        } else {
            format!("assets/styles.{hash}.css")
        }
    }

    pub fn runtime_rel(self, hash: &str) -> String {
        if self.is_dev_stable() {
            "assets/runtime.dev.js".to_string()
        } else {
            format!("assets/runtime.{hash}.js")
        }
    }

    pub fn core_rel(self, hash: &str) -> String {
        if self.is_dev_stable() {
            "assets/core.dev.js".to_string()
        } else {
            format!("assets/core.{hash}.js")
        }
    }

    pub fn component_rel(self, token: &str, hash: &str) -> String {
        if self.is_dev_stable() {
            format!("assets/component.{token}.dev.js")
        } else {
            format!("assets/component.{token}.{hash}.js")
        }
    }

    pub fn page_rel(self, route_token: &str, hash: &str) -> String {
        if self.is_dev_stable() {
            format!("assets/{route_token}.dev.js")
        } else {
            format!("assets/{route_token}.{hash}.js")
        }
    }

    pub fn router_rel(self, hash: &str) -> String {
        if self.is_dev_stable() {
            "assets/router.dev.js".to_string()
        } else {
            format!("assets/router.{hash}.js")
        }
    }

    pub fn vendor_rel(self, hash: &str) -> String {
        if self.is_dev_stable() {
            "vendor.dev.js".to_string()
        } else {
            format!("vendor.{hash}.js")
        }
    }
}

pub fn prepare_output_root(out_dir: &Path, mode: OutputMode) -> Result<PathBuf, String> {
    if mode.is_dev_stable() {
        fs::create_dir_all(out_dir)
            .map_err(|e| format!("failed to create output dir '{}': {e}", out_dir.display()))?;
        return Ok(out_dir.to_path_buf());
    }

    let out_dir_tmp = out_dir.with_extension("tmp");
    if out_dir_tmp.exists() {
        fs::remove_dir_all(&out_dir_tmp)
            .map_err(|e| format!("failed to clean temp dir '{}': {e}", out_dir_tmp.display()))?;
    }
    fs::create_dir_all(&out_dir_tmp)
        .map_err(|e| format!("failed to create temp dir '{}': {e}", out_dir_tmp.display()))?;
    Ok(out_dir_tmp)
}

pub fn finalize_output_root(
    out_dir: &Path,
    emitted_root: &Path,
    mode: OutputMode,
) -> Result<(), String> {
    if mode.is_dev_stable() {
        return Ok(());
    }

    let legacy_out_dir_prev = out_dir.with_extension("prev");
    if legacy_out_dir_prev.exists() {
        let _ = fs::remove_dir_all(&legacy_out_dir_prev);
    }
    let backup_token = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let out_dir_prev = out_dir.with_extension(format!("prev.{}.{}", process::id(), backup_token));
    if out_dir.exists() {
        fs::rename(out_dir, &out_dir_prev).map_err(|e| {
            format!(
                "failed to move existing out_dir to backup '{}': {e}",
                out_dir_prev.display()
            )
        })?;
    }
    if let Err(error) = fs::rename(emitted_root, out_dir) {
        if out_dir_prev.exists() && !out_dir.exists() {
            let _ = fs::rename(&out_dir_prev, out_dir);
        }
        return Err(format!(
            "failed to rename temp dir '{}' to output dir '{}': {error}",
            emitted_root.display(),
            out_dir.display()
        ));
    }
    if out_dir_prev.exists() {
        let _ = fs::remove_dir_all(&out_dir_prev);
    }

    Ok(())
}

pub fn write_text_file(path: &Path, content: &str) -> Result<bool, String> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return Ok(false);
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create dir '{}': {e}", parent.display()))?;
    }

    let tmp_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp_name = format!(
        ".{}.tmp.{}.{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("zenith-asset"),
        process::id(),
        tmp_suffix
    );
    let tmp_path = path.with_file_name(tmp_name);

    fs::write(&tmp_path, content).map_err(|e| {
        format!(
            "failed to write temp file '{}' for '{}': {e}",
            tmp_path.display(),
            path.display()
        )
    })?;
    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!(
            "failed to atomically replace file '{}' from '{}': {e}",
            path.display(),
            tmp_path.display()
        )
    })?;
    Ok(true)
}

pub fn write_file_for_mode(path: &Path, content: &str, mode: OutputMode) -> Result<bool, String> {
    if mode.is_dev_stable() {
        return write_text_file(path, content);
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create dir '{}': {e}", parent.display()))?;
    }
    fs::write(path, content)
        .map_err(|e| format!("failed to write file '{}': {e}", path.display()))?;
    Ok(true)
}
