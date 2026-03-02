use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderAssetsRequest {
    pub manifest_json: String,
    pub runtime_import: String,
    pub core_import: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderAssetsResponse {
    pub ir_version: u32,
    pub runtime_source: String,
    pub router_source: String,
}

pub fn render_assets(request: &RenderAssetsRequest) -> Result<RenderAssetsResponse, String> {
    let script_path = resolve_render_script_path()?;
    let payload =
        serde_json::to_string(request).map_err(|e| format!("template payload error: {e}"))?;

    let mut child = Command::new("node")
        .arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "failed to spawn template bridge '{}': {e}",
                script_path.display()
            )
        })?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(payload.as_bytes())
            .map_err(|e| format!("failed to write template bridge stdin: {e}"))?;
    } else {
        return Err("template bridge stdin unavailable".into());
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("template bridge wait failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "template bridge failed (status: {:?})\nstdout:\n{}\nstderr:\n{}",
            output.status.code(),
            stdout.trim(),
            stderr.trim()
        ));
    }

    let stdout =
        String::from_utf8(output.stdout).map_err(|e| format!("invalid bridge stdout utf8: {e}"))?;
    let parsed: RenderAssetsResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("invalid bridge JSON payload: {e}\nraw={stdout}"))?;

    if parsed.runtime_source.contains('\r') {
        return Err("template bridge emitted runtime source with CR line endings".into());
    }
    if parsed.router_source.contains('\r') {
        return Err("template bridge emitted router source with CR line endings".into());
    }

    Ok(parsed)
}

fn resolve_render_script_path() -> Result<PathBuf, String> {
    let mut candidates = Vec::<PathBuf>::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(release_dir) = exe_path.parent() {
            if let Some(target_dir) = release_dir.parent() {
                if let Some(repo_root) = target_dir.parent() {
                    candidates.push(repo_root.join("scripts").join("render-assets.mjs"));
                }
            }
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("scripts")
            .join("render-assets.mjs"),
    );

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("scripts").join("render-assets.mjs"));
    }

    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }

    Err("unable to locate scripts/render-assets.mjs for template bridge".into())
}
