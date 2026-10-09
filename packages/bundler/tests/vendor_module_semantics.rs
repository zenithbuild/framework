use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::json;
use zenith_compiler::deterministic::sha256_hex;

fn bundler_bin() -> PathBuf {
    if let Ok(path) = env::var("CARGO_BIN_EXE_zenith-bundler") {
        return PathBuf::from(path);
    }

    let current = env::current_exe().expect("resolve current test binary");
    let debug_dir = current
        .parent()
        .and_then(Path::parent)
        .expect("resolve target debug directory");
    debug_dir.join(format!("zenith-bundler{}", env::consts::EXE_SUFFIX))
}

fn snapshot_assets(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn visit(root: &Path, dir: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(root, &path, files);
            } else {
                files.insert(
                    path.strip_prefix(root).unwrap().to_path_buf(),
                    fs::read(path).unwrap(),
                );
            }
        }
    }
    let mut files = BTreeMap::new();
    visit(root, root, &mut files);
    files
}

fn graph_hash() -> String {
    sha256_hex(b"id:root\n")
}

fn payload() -> serde_json::Value {
    json!([{
        "route": "/",
        "file": "pages/index.zen",
        "router": false,
        "ir": {
            "ir_version": 1,
            "graph_hash": graph_hash(),
            "graph_nodes": [{ "id": "root", "hoist_id": "root" }],
            "graph_edges": [],
            "html": "<!doctype html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Cache fixture</main></body></html>",
            "expressions": [],
            "expression_bindings": [],
            "marker_bindings": [],
            "event_bindings": [],
            "ref_bindings": [],
            "signals": [],
            "style_blocks": [],
            "hoisted": {
                "code": ["void first; void second; void firstShared; void secondShared;"],
                "state": [],
                "imports": ["import first, { shared as firstShared } from 'first-dep';", "import second, {\n shared as secondShared\n} from 'second-dep';"]
            },
            "components_scripts": {},
            "component_instances": [],
            "imports": [{
                "local": "first",
                "spec": "first-dep",
                "hoist_id": "cache_dep",
                "file_hash": "cache_dep_hash"
            }],
            "import_records": [
                { "specifier": "first-dep", "raw_source": "import first, { shared as firstShared } from 'first-dep';" },
                { "specifier": "second-dep", "raw_source": "import second, {\n shared as secondShared\n} from 'second-dep';" }
            ],
            "modules": [{ "id": "local-helper", "source": "// import fake from 'not-a-real-package';\nexport const local = \"import ghost from 'not-a-real-package';\";" }]
        }
    }])
}

fn run_bundler(root: &Path, out_dir: &Path, dev: bool, fast: bool) {
    let mut command = Command::new(bundler_bin());
    if dev {
        command.arg("--dev-stable-assets");
    }
    if fast {
        command.args([
            "--fast-path",
            "--rebuild-strategy",
            "page-only",
            "--changed-route",
            "/",
        ]);
    }
    let mut child = command
        .arg("--out-dir")
        .arg(out_dir)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn bundler");

    child
        .stdin
        .as_mut()
        .expect("bundler stdin")
        .write_all(payload().to_string().as_bytes())
        .expect("write bundler payload");

    let output = child.wait_with_output().expect("wait for bundler");
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn vendor_entries_preserve_defaults_collisions_and_lazy_chunks_on_cold_and_warm_builds() {
    let fixture = tempfile::tempdir().unwrap();
    let root = fixture.path();
    fs::write(
        root.join("package.json"),
        r#"{"name":"vendor-semantics","type":"module"}"#,
    )
    .unwrap();
    for (package, value) in [("first-dep", "first"), ("second-dep", "second")] {
        let dependency = root.join("node_modules").join(package);
        fs::create_dir_all(&dependency).unwrap();
        fs::write(
            dependency.join("package.json"),
            format!(r#"{{"name":"{package}","type":"module","main":"index.js"}}"#),
        )
        .unwrap();
        fs::write(
            dependency.join("index.js"),
            format!(
                r#"
            export default "{value}";
            export const shared = "{value}-shared";
            export async function lazy() {{ return (await import('./lazy.js')).default; }}
        "#
            ),
        )
        .unwrap();
        fs::write(
            dependency.join("lazy.js"),
            format!(r#"export default "{value}-lazy";"#),
        )
        .unwrap();
    }
    for dev in [false, true] {
        let out_dir = root.join(if dev { "dev" } else { "dist" });
        let mut first_assets = None;
        for _ in 0..2 {
            if out_dir.exists() {
                fs::remove_dir_all(&out_dir).unwrap();
            }
            run_bundler(root, &out_dir, dev, false);
            if dev {
                let before = snapshot_assets(&out_dir.join("assets"));
                run_bundler(root, &out_dir, dev, true);
                assert_eq!(
                    before,
                    snapshot_assets(&out_dir.join("assets")),
                    "page-only rebuild must preserve vendor chunks"
                );
            }
            let assets = snapshot_assets(&out_dir.join("assets"));
            if let Some(first) = &first_assets {
                assert_eq!(
                    first, &assets,
                    "cold and warm builds must emit identical asset names and bytes"
                );
            } else {
                first_assets = Some(assets);
            }
            let manifest: serde_json::Value =
                serde_json::from_slice(&fs::read(out_dir.join("manifest.json")).unwrap()).unwrap();
            let page_path = manifest["chunks"]["/"]
                .as_str()
                .unwrap()
                .trim_start_matches('/');
            let page = fs::read_to_string(out_dir.join(page_path)).unwrap();
            for specifier in ["first-dep", "second-dep"] {
                let token = &sha256_hex(specifier.as_bytes())[..16];
                assert!(
                    page.contains(&format!("vendor.{token}")),
                    "page must import its own dependency entry"
                );
            }
            let check = r#"
                import { readdir, writeFile } from 'node:fs/promises';
                import { pathToFileURL } from 'node:url';
                import { resolve } from 'node:path';
                import assert from 'node:assert/strict';
                const dir = resolve(process.argv[1], 'assets');
                const files = (await readdir(dir)).filter(name => name.startsWith('vendor.') && name.endsWith('.js'));
                assert.equal(files.length, 2);
                const values = [];
                for (const name of files) {
                    const consumer = resolve(process.argv[1], `${name}.consumer.mjs`);
                    await writeFile(consumer, `import value, { shared as aliased, lazy } from './assets/${name}'; export { value, aliased, lazy };`);
                    const mod = await import(pathToFileURL(consumer));
                    assert.equal(mod.aliased, `${mod.value}-shared`);
                    assert.equal(await mod.lazy(), `${mod.value}-lazy`);
                    values.push(mod.value);
                }
                assert.deepEqual(values.sort(), ['first', 'second']);
            "#;
            let output = Command::new("node")
                .args(["--input-type=module", "-e", check])
                .arg(&out_dir)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}
