use std::process::Command;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct NpmPackEntry {
    files: Vec<NpmPackFile>,
}

#[derive(Debug, Deserialize)]
struct NpmPackFile {
    path: String,
}

#[test]
fn npm_pack_includes_runtime_bridge_script() {
    let npm_bin = if cfg!(windows) { "npm.cmd" } else { "npm" };
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let output = Command::new(npm_bin)
        .args(["pack", "--dry-run", "--json", "."])
        .current_dir(manifest_dir)
        .output()
        .expect("run npm pack --dry-run --json");

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        panic!(
            "npm pack --dry-run failed with status {:?}\nstdout:\n{}\nstderr:\n{}",
            output.status.code(),
            stdout.trim(),
            stderr.trim()
        );
    }

    let entries: Vec<NpmPackEntry> =
        serde_json::from_slice(&output.stdout).expect("parse npm pack json payload");
    let entry = entries
        .first()
        .expect("expected npm pack output to contain one tarball entry");
    let files = entry
        .files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<Vec<_>>();

    assert!(
        files.contains(&"scripts/render-assets.mjs"),
        "expected scripts/render-assets.mjs in npm pack file list, found:\n{}",
        files.join("\n")
    );
    assert!(
        files.iter().any(|path| path.starts_with("dist/")),
        "expected dist/** in npm pack file list, found:\n{}",
        files.join("\n")
    );
}
