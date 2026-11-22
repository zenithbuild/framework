mod support;

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use support::{page, run_bundler, write_vendor_package};

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn modulepreload_hrefs(html: &str) -> Vec<String> {
    let mut hrefs = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find("<link") {
        let rest_from_tag = &rest[start..];
        let Some(end) = rest_from_tag.find('>') else {
            break;
        };
        let tag = &rest_from_tag[..=end];
        let lower = tag.to_ascii_lowercase();
        if lower.contains("rel=\"modulepreload\"") || lower.contains("rel='modulepreload'") {
            hrefs.push(attr_value(tag, "href").expect("modulepreload href"));
            assert!(
                !lower.contains("crossorigin"),
                "modulepreload hint must keep the module script credentials mode: {tag}"
            );
        }
        rest = &rest_from_tag[end + 1..];
    }
    hrefs
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let marker = format!("{name}={quote}");
        if let Some(start) = tag.find(&marker) {
            let value_start = start + marker.len();
            let value_end = tag[value_start..].find(quote)? + value_start;
            return Some(tag[value_start..value_end].to_string());
        }
    }
    None
}

fn module_script_srcs(html: &str) -> Vec<String> {
    let mut srcs = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find("<script") {
        let rest_from_tag = &rest[start..];
        let Some(end) = rest_from_tag.find('>') else {
            break;
        };
        let tag = &rest_from_tag[..=end];
        if tag.contains("type=\"module\"") || tag.contains("type='module'") {
            srcs.push(attr_value(tag, "src").unwrap_or_default());
        }
        rest = &rest_from_tag[end + 1..];
    }
    srcs
}

fn assert_exact_hints(html: &str, mut expected: Vec<String>, label: &str) {
    let mut found = modulepreload_hrefs(html);
    found.sort();
    expected.sort();
    assert_eq!(
        found, expected,
        "{label} modulepreload hints diverged\n{html}"
    );
    for href in &found {
        assert_eq!(found.iter().filter(|item| *item == href).count(), 1);
        assert!(
            !href.ends_with(".css"),
            "{label} preloaded a stylesheet: {href}"
        );
    }
}

fn asset_file(out_dir: &Path, public_path: &str) -> PathBuf {
    out_dir.join(
        public_path
            .trim_start_matches("/app/")
            .trim_start_matches('/'),
    )
}

fn assert_hints_exist(out_dir: &Path, html: &str) {
    for href in modulepreload_hrefs(html) {
        if !href.starts_with('/') {
            continue;
        }
        let path = asset_file(out_dir, &href);
        assert!(
            path.is_file(),
            "modulepreload URL is missing on disk: {href} ({})",
            path.display()
        );
    }
}

fn quoted_specifiers_after(source: &str, token: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut rest = source;
    while let Some(index) = rest.find(token) {
        let after = &rest[index + token.len()..];
        let trimmed = after.trim_start();
        if trimmed.starts_with('(') {
            rest = &after[1..];
            continue;
        }
        let bytes = trimmed.as_bytes();
        if bytes.first().copied() == Some(b'"') || bytes.first().copied() == Some(b'\'') {
            let quote = bytes[0] as char;
            if let Some(end) = trimmed[1..].find(quote) {
                found.push(trimmed[1..1 + end].to_string());
            }
        }
        rest = after;
    }
    found
}

fn static_module_specifiers(source: &str) -> Vec<String> {
    let mut specs = quoted_specifiers_after(source, "from");
    specs.extend(quoted_specifiers_after(source, "import"));
    specs.retain(|spec| {
        !spec.contains('*')
            && (spec.starts_with("./") || spec.starts_with("../") || spec.starts_with('/'))
            && (spec.ends_with(".js")
                || spec
                    .split(['?', '#'])
                    .next()
                    .unwrap_or(spec)
                    .ends_with(".js"))
    });
    specs.sort();
    specs.dedup();
    specs
}

fn dynamic_module_specifiers(source: &str) -> Vec<String> {
    let mut specs = Vec::new();
    let mut rest = source;
    while let Some(index) = rest.find("import(") {
        let after = rest[index + "import(".len()..].trim_start();
        if after.starts_with('"') || after.starts_with('\'') {
            let quote = after.as_bytes()[0] as char;
            if let Some(end) = after[1..].find(quote) {
                specs.push(after[1..1 + end].to_string());
            }
        }
        rest = &rest[index + "import(".len()..];
    }
    specs
}

#[test]
fn router_pages_preload_only_the_initial_route_graph() {
    let fixture = tempfile::tempdir().unwrap();
    let root = fixture.path();
    write_vendor_package(root);
    let out_dir = root.join("dist");
    let home_html = "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>";
    let about_html = "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --><link rel=\"modulepreload\" href=\"https://cdn.example/site-workaround.js\"></head><body><main>About</main></body></html>";
    let deep_html = "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Deep</main></body></html>";
    let payload = json!([
        page("/", "mod_home", home_html, true, true, false, false),
        page("/about", "mod_about", about_html, true, false, false, false),
        page(
            "/docs/guide/install",
            "mod_deep",
            deep_html,
            true,
            false,
            true,
            true
        )
    ]);

    let output = run_bundler(root, payload, &out_dir, "/app");
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest = read_json(&out_dir.join("manifest.json"));
    let runtime = manifest["entry"].as_str().unwrap().to_string();
    let core = manifest["core"].as_str().unwrap().to_string();
    let router = manifest["router"].as_str().unwrap().to_string();
    let home_chunk = manifest["chunks"]["/"].as_str().unwrap().to_string();
    let about_chunk = manifest["chunks"]["/about"].as_str().unwrap().to_string();
    let deep_chunk = manifest["chunks"]["/docs/guide/install"]
        .as_str()
        .unwrap()
        .to_string();

    let home = fs::read_to_string(out_dir.join("index.html")).unwrap();
    let about = fs::read_to_string(out_dir.join("about/index.html")).unwrap();
    let deep = fs::read_to_string(out_dir.join("docs/guide/install/index.html")).unwrap();

    for (label, html) in [("home", &home), ("about", &about), ("deep", &deep)] {
        let scripts = module_script_srcs(html);
        assert_eq!(
            scripts,
            vec![router.clone()],
            "{label} must keep one router entry"
        );
        assert_eq!(
            html.matches("rel=\"stylesheet\"").count(),
            1,
            "{label} stylesheet"
        );
        assert!(
            html.contains("href=\"/app/assets/styles."),
            "{label} basePath css"
        );
        assert_hints_exist(&out_dir, html);
        assert!(
            !modulepreload_hrefs(html).contains(&router),
            "{label} preloaded the entry"
        );
    }

    assert_exact_hints(
        &home,
        vec![runtime.clone(), core.clone(), home_chunk.clone()],
        "static home",
    );
    assert!(
        !home.contains(&about_chunk) && !home.contains(&deep_chunk),
        "home preloaded another route"
    );

    let mut about_expected = vec![runtime.clone(), core.clone(), about_chunk.clone()];
    about_expected.push("https://cdn.example/site-workaround.js".to_string());
    assert_exact_hints(&about, about_expected, "hosted about");
    assert_eq!(
        about
            .matches("https://cdn.example/site-workaround.js")
            .count(),
        1
    );
    assert!(!about.contains(&home_chunk) && !about.contains(&deep_chunk));

    let deep_hints = modulepreload_hrefs(&deep);
    for required in [&runtime, &core, &deep_chunk] {
        assert!(
            deep_hints.contains(required),
            "deep missing {required}\n{deep}"
        );
    }
    assert!(!deep_hints.contains(&home_chunk));
    assert!(!deep_hints.contains(&about_chunk));
    assert!(!deep_hints.iter().any(|href| href.contains("lazy")));

    let deep_page = fs::read_to_string(asset_file(&out_dir, &deep_chunk)).unwrap();
    assert!(
        static_module_specifiers(&deep_page)
            .iter()
            .any(|spec| spec.contains("component.")),
        "deep page should statically import its component\n{deep_page}"
    );
    for specifier in static_module_specifiers(&deep_page) {
        let public = if specifier.starts_with('/') {
            specifier
        } else {
            format!("/app/assets/{}", specifier.trim_start_matches("./"))
        };
        assert!(
            deep_hints.contains(&public),
            "deep page static import {public} was not preloaded\nhints={deep_hints:?}"
        );
    }

    let component_href = deep_hints
        .iter()
        .find(|href| href.contains("/component."))
        .expect("component hint")
        .clone();
    let component_source = fs::read_to_string(asset_file(&out_dir, &component_href)).unwrap();
    assert!(
        static_module_specifiers(&component_source)
            .iter()
            .any(|spec| spec.contains("Logic.")),
        "component should statically import Logic\n{component_source}"
    );
    for specifier in static_module_specifiers(&component_source) {
        let public = if specifier.starts_with('/') {
            specifier
        } else {
            format!("/app/assets/{}", specifier.trim_start_matches("./"))
        };
        assert!(
            deep_hints.contains(&public),
            "component dep {public} missing"
        );
    }

    let vendor_href = deep_hints
        .iter()
        .find(|href| href.contains("/vendor."))
        .expect("vendor hint")
        .clone();
    let vendor_source = fs::read_to_string(asset_file(&out_dir, &vendor_href)).unwrap();
    for specifier in dynamic_module_specifiers(&vendor_source) {
        assert!(
            !deep_hints
                .iter()
                .any(|href| href.ends_with(specifier.trim_start_matches("./"))
                    || href.ends_with(&specifier)),
            "lazy vendor import {specifier} was preloaded"
        );
    }
    for specifier in static_module_specifiers(&vendor_source) {
        if specifier.starts_with("./") || specifier.starts_with("../") {
            let file_name = specifier.rsplit('/').next().unwrap();
            assert!(
                deep_hints.iter().any(|href| href.ends_with(file_name)),
                "static vendor import {specifier} was not preloaded\nhints={deep_hints:?}\n{vendor_source}"
            );
        }
    }
}

#[test]
fn non_router_pages_preload_their_own_static_dependencies() {
    let fixture = tempfile::tempdir().unwrap();
    let root = fixture.path();
    write_vendor_package(root);
    let out_dir = root.join("dist");
    let home_html = "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>";
    let deep_html = "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Deep</main></body></html>";
    let payload = json!([
        page("/", "mod_home", home_html, false, true, false, false),
        page(
            "/docs/guide/install",
            "mod_deep",
            deep_html,
            false,
            false,
            true,
            false
        )
    ]);

    let output = run_bundler(root, payload, &out_dir, "/app");
    assert!(
        output.status.success(),
        "bundler failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let manifest = read_json(&out_dir.join("manifest.json"));
    assert!(
        manifest["router"].is_null(),
        "non-router manifest must omit router"
    );
    let runtime = manifest["entry"].as_str().unwrap().to_string();
    let core = manifest["core"].as_str().unwrap().to_string();
    let home_chunk = manifest["chunks"]["/"].as_str().unwrap().to_string();
    let deep_chunk = manifest["chunks"]["/docs/guide/install"]
        .as_str()
        .unwrap()
        .to_string();

    let home = fs::read_to_string(out_dir.join("index.html")).unwrap();
    let deep = fs::read_to_string(out_dir.join("docs/guide/install/index.html")).unwrap();

    assert_eq!(module_script_srcs(&home), vec![home_chunk.clone()]);
    assert_eq!(module_script_srcs(&deep), vec![deep_chunk.clone()]);
    assert!(home.contains("data-zx-page") && deep.contains("data-zx-page"));
    assert!(!home.contains("data-zx-router") && !deep.contains("data-zx-router"));

    assert_exact_hints(&home, vec![runtime.clone()], "non-router static home");
    assert!(!modulepreload_hrefs(&home).contains(&core));
    assert!(!home.contains(&deep_chunk));
    assert_hints_exist(&out_dir, &home);

    let deep_hints = modulepreload_hrefs(&deep);
    assert!(deep_hints.contains(&runtime));
    assert!(!deep_hints.contains(&deep_chunk));
    assert!(!deep_hints.contains(&home_chunk));
    assert!(
        !deep_hints.contains(&core),
        "non-router deep page does not import core"
    );
    assert!(
        deep_hints.iter().any(|href| href.contains("/vendor.")),
        "deep page must preload its vendor entry\n{deep}"
    );
    assert!(!deep_hints.iter().any(|href| href.contains("lazy")));
    assert_hints_exist(&out_dir, &deep);
    for href in &deep_hints {
        assert!(
            href.starts_with("/app/"),
            "non-root basePath missing on {href}"
        );
    }
}
