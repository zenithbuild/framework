use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use zenith_compiler::deterministic::sha256_hex;
pub fn bundler_bin() -> PathBuf {
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
pub fn graph_hash(hoist_id: &str) -> String {
    sha256_hex(format!("id:{hoist_id}\n").as_bytes())
}
pub fn run_bundler(
    root: &Path,
    payload: Value,
    out_dir: &Path,
    base_path: &str,
) -> std::process::Output {
    let mut child = Command::new(bundler_bin())
        .arg("--out-dir")
        .arg(out_dir)
        .arg("--base-path")
        .arg(base_path)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn bundler");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(payload.to_string().as_bytes())
        .expect("write payload");
    child.wait_with_output().expect("wait bundler")
}
pub fn write_vendor_package(root: &Path) {
    fs::write(
        root.join("package.json"),
        r#"{"name":"modulepreload-fixture","type":"module"}"#,
    )
    .unwrap();
    let package = root.join("node_modules").join("preload-dep");
    fs::create_dir_all(&package).unwrap();
    fs::write(
        package.join("package.json"),
        r#"{"name":"preload-dep","type":"module","main":"index.js"}"#,
    )
    .unwrap();
    fs::write(
        package.join("index.js"),
        r#"export { marker as ready } from "./shared.js";
export async function optionalFeature() { return import("./lazy.js"); }
"#,
    )
    .unwrap();
    fs::write(
        package.join("shared.js"),
        r#"export const marker = "shared-marker";"#,
    )
    .unwrap();
    fs::write(package.join("lazy.js"), r#"export default "lazy-marker";"#).unwrap();
}
pub fn page(
    route: &str,
    hoist_id: &str,
    html: &str,
    router: bool,
    prerender: bool,
    vendor: bool,
    component: bool,
) -> Value {
    let mut hoisted_imports = Vec::new();
    let mut hoisted_code = Vec::new();
    let mut imports = Vec::new();
    let mut import_records = Vec::new();
    if vendor {
        hoisted_imports.push("import { ready } from 'preload-dep';");
        hoisted_code.push("void ready;");
        imports.push(json!({
            "local": "ready",
            "spec": "preload-dep",
            "hoist_id": "preload_dep",
            "file_hash": "preload_dep_hash"
        }));
        import_records.push(json!({
            "specifier": "preload-dep",
            "raw_source": "import { ready } from 'preload-dep';"
        }));
    }
    let mut components_scripts = serde_json::Map::new();
    let mut component_instances = Vec::new();
    let mut modules = Vec::new();
    if component {
        components_scripts.insert(
            "comp_hoist".to_string(),
            json!({
                "hoist_id": "comp_hoist",
                "module_id": "src/components/Widget.zen:script0",
                "factory": "createComponent_comp_hoist",
                "imports": ["import { setup } from './helpers/Logic.js';"],
                "deps": ["src/components/helpers/Logic.js"],
                "code": "export function createComponent_comp_hoist(host, props, runtime) { setup(); return { mount(){ void host; void props; void runtime; }, update(){}, destroy(){}, bindings: Object.freeze({}) }; }"
            }),
        );
        component_instances.push(json!({
            "instance": "Widget",
            "instance_id": 1,
            "hoist_id": "comp_hoist",
            "marker_index": 0,
            "selector": "[data-widget]",
            "props": []
        }));
        modules.push(json!({
            "id": "src/components/helpers/Logic.js",
            "source": "import { zenOnMount } from 'zenith:core';\nexport function setup(){ return zenOnMount(() => {}); }\n",
            "deps": ["external:zenith:core"]
        }));
    }
    let mut ir = json!({
        "ir_version": 1,
        "graph_hash": graph_hash(hoist_id),
        "graph_edges": [],
        "graph_nodes": [{ "id": format!("src/pages/{hoist_id}.zen"), "hoist_id": hoist_id }],
        "html": html,
        "expressions": [],
        "hoisted": {
            "imports": hoisted_imports,
            "declarations": [],
            "functions": [],
            "signals": [],
            "state": [],
            "code": hoisted_code
        },
        "components_scripts": components_scripts,
        "component_instances": component_instances,
        "imports": imports,
        "import_records": import_records,
        "modules": modules,
        "signals": [],
        "expression_bindings": [],
        "marker_bindings": [],
        "event_bindings": [],
        "style_blocks": [],
        "prerender": prerender
    });
    if prerender {
        ir["server_script"] = json!({
            "source": "export const data = { heading: \"home\" };",
            "prerender": true
        });
    }

    json!({
        "route": route,
        "file": format!("src/pages/{hoist_id}.zen"),
        "router": router,
        "ir": ir
    })
}
