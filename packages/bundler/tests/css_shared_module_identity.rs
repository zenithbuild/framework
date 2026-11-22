#[path = "css_shared/mod.rs"]
mod support;

use serde_json::json;
use support::{
    assert_asset_references, assert_shared_once, build_payload, build_specs, count_occurrences,
    named_page, route_spec, RouteSpec,
};

#[test]
fn shared_imported_css_emitted_once_for_one_three_and_thirty_routes() {
    for count in [1usize, 3, 30] {
        let tmp = tempfile::tempdir().expect("temp");
        let specs = (0..count)
            .map(|index| route_spec(index, count))
            .collect::<Vec<_>>();
        let built = build_specs(tmp.path(), &specs, "dist");
        assert_shared_once(&built.css, count);
        assert_asset_references(&built, &specs);
    }
}

#[test]
fn import_order_scoped_styles_and_repeated_builds_stay_stable() {
    let tmp = tempfile::tempdir().expect("temp");
    let root = tmp.path();
    let pages = root.join("pages");
    let styles = pages.join("styles");
    std::fs::create_dir_all(&styles).expect("styles");
    std::fs::write(pages.join("home.zen"), "<main>home</main>\n").expect("home");
    std::fs::write(pages.join("about.zen"), "<main>about</main>\n").expect("about");
    std::fs::write(
        styles.join("reset.css"),
        "/* RESET */\n.reset { color: canvas; }\n",
    )
    .expect("reset");
    std::fs::write(
        styles.join("shared.css"),
        "/* SHARED_MARKER */\n.shared { color: canvastext; }\n.twin { color: red; }\n",
    )
    .expect("shared");
    std::fs::write(
        styles.join("home.css"),
        "/* HOME */\n.home { color: green; }\n.twin { color: red; }\n",
    )
    .expect("home css");
    std::fs::write(
        styles.join("about.css"),
        "/* ABOUT */\n.about { color: blue; }\n",
    )
    .expect("about css");

    let home = named_page(
        root,
        "/",
        "home.zen",
        &[
            "import \"./styles/reset.css\";",
            "import \"./styles/shared.css\";",
            "import \"./styles/home.css\";",
        ],
        &[
            "home.zen->styles/reset.css",
            "home.zen->styles/shared.css",
            "home.zen->styles/home.css",
        ],
        "/* SCOPE_HOME */\n.scope-home { color: #111; }\n",
    );
    let about = named_page(
        root,
        "/about",
        "about.zen",
        &[
            "import \"./styles/shared.css\";",
            "import \"./styles/about.css\";",
        ],
        &[
            "about.zen->styles/shared.css",
            "about.zen->styles/about.css",
        ],
        "/* SCOPE_ABOUT */\n.scope-about { color: #333; }\n",
    );

    let first = build_payload(root, json!([home.clone(), about.clone()]), "dist-a");
    let second = build_payload(root, json!([about, home]), "dist-b");
    assert_eq!(first.css_public_path, second.css_public_path);
    assert_eq!(first.css, second.css);

    let css = &first.css;
    assert_eq!(count_occurrences(css, "/* SHARED_MARKER */"), 1);
    assert_eq!(count_occurrences(css, ".twin { color: red; }"), 2);
    let pos = |needle: &str| {
        css.find(needle)
            .unwrap_or_else(|| panic!("missing {needle}"))
    };
    // Home requires scope, reset, shared, home. About requires scope, shared,
    // about. The shared module waits until about's scoped block, which must
    // precede it, has been placed.
    assert!(pos("/* SCOPE_HOME */") < pos("/* RESET */"));
    assert!(pos("/* RESET */") < pos("/* SCOPE_ABOUT */"));
    assert!(pos("/* SCOPE_ABOUT */") < pos("/* SHARED_MARKER */"));
    assert!(pos("/* SHARED_MARKER */") < pos("/* HOME */"));
    assert!(pos("/* HOME */") < pos("/* ABOUT */"));
    assert_asset_references(
        &first,
        &[
            RouteSpec {
                route: "/".to_string(),
                module_id: "home.zen".to_string(),
                file_name: "home.zen".to_string(),
                hoisted_imports: Vec::new(),
                unique_css_name: String::new(),
                unique_css: String::new(),
                scoped_css: String::new(),
                component_import: false,
            },
            RouteSpec {
                route: "/about".to_string(),
                module_id: "about.zen".to_string(),
                file_name: "about.zen".to_string(),
                hoisted_imports: Vec::new(),
                unique_css_name: String::new(),
                unique_css: String::new(),
                scoped_css: String::new(),
                component_import: false,
            },
        ],
    );
}

#[test]
fn later_route_base_precedes_override_first_seen_on_an_earlier_route() {
    let tmp = tempfile::tempdir().expect("temp");
    let root = tmp.path();
    let pages = root.join("pages");
    let styles = pages.join("styles");
    std::fs::create_dir_all(&styles).expect("styles");
    std::fs::write(pages.join("early.zen"), "<main>early</main>\n").expect("early");
    std::fs::write(pages.join("later.zen"), "<main>later</main>\n").expect("later");
    std::fs::write(
        styles.join("z-override.css"),
        "/* OVERRIDE */\n.cascade { color: red; }\n",
    )
    .expect("override");
    std::fs::write(
        styles.join("a-base.css"),
        "/* BASE */\n.cascade { color: blue; }\n",
    )
    .expect("base");

    let early = named_page(
        root,
        "/",
        "early.zen",
        &["import \"./styles/z-override.css\";"],
        &["early.zen->styles/z-override.css"],
        "/* SCOPE_EARLY */\n.scope-early { color: #111; }\n",
    );
    let later = named_page(
        root,
        "/later",
        "later.zen",
        &[
            "import \"./styles/a-base.css\";",
            "import \"./styles/z-override.css\";",
        ],
        &[
            "later.zen->styles/a-base.css",
            "later.zen->styles/z-override.css",
        ],
        "/* SCOPE_LATER */\n.scope-later { color: #222; }\n",
    );

    let first = build_payload(root, json!([early.clone(), later.clone()]), "dist-a");
    let second = build_payload(root, json!([later, early]), "dist-b");
    assert_eq!(first.css, second.css);
    assert_eq!(first.css_public_path, second.css_public_path);
    assert!(
        !first.stderr.contains("CSS import order conflict"),
        "compatible import order must not warn: {}",
        first.stderr
    );

    let css = &first.css;
    assert_eq!(count_occurrences(css, "/* BASE */"), 1);
    assert_eq!(count_occurrences(css, "/* OVERRIDE */"), 1);
    assert_eq!(count_occurrences(css, "/* SCOPE_EARLY */"), 1);
    assert_eq!(count_occurrences(css, "/* SCOPE_LATER */"), 1);
    let pos = |needle: &str| {
        css.find(needle)
            .unwrap_or_else(|| panic!("missing {needle}"))
    };
    assert!(pos("/* SCOPE_EARLY */") < pos("/* SCOPE_LATER */"));
    assert!(pos("/* SCOPE_LATER */") < pos("/* BASE */"));
    assert!(pos("/* BASE */") < pos("/* OVERRIDE */"));
    assert!(pos(".cascade { color: blue; }") < pos(".cascade { color: red; }"));
}

#[test]
fn conflicting_import_order_keeps_the_earlier_route_constraint() {
    let tmp = tempfile::tempdir().expect("temp");
    let root = tmp.path();
    let pages = root.join("pages");
    let styles = pages.join("styles");
    std::fs::create_dir_all(&styles).expect("styles");
    std::fs::write(pages.join("home.zen"), "<main>home</main>\n").expect("home");
    std::fs::write(pages.join("later.zen"), "<main>later</main>\n").expect("later");
    std::fs::write(
        styles.join("a-base.css"),
        "/* BASE */\n.cascade { color: blue; }\n",
    )
    .expect("base");
    std::fs::write(
        styles.join("z-override.css"),
        "/* OVERRIDE */\n.cascade { color: red; }\n",
    )
    .expect("override");

    let home = named_page(
        root,
        "/",
        "home.zen",
        &[
            "import \"./styles/a-base.css\";",
            "import \"./styles/z-override.css\";",
        ],
        &[
            "home.zen->styles/a-base.css",
            "home.zen->styles/z-override.css",
        ],
        "/* SCOPE_HOME */\n.scope-home { color: #111; }\n",
    );
    let later = named_page(
        root,
        "/later",
        "later.zen",
        &[
            "import \"./styles/z-override.css\";",
            "import \"./styles/a-base.css\";",
        ],
        &[
            "later.zen->styles/z-override.css",
            "later.zen->styles/a-base.css",
        ],
        "/* SCOPE_LATER */\n.scope-later { color: #222; }\n",
    );

    let built = build_payload(root, json!([later, home]), "dist");
    let css = &built.css;
    assert_eq!(count_occurrences(css, "/* BASE */"), 1);
    assert_eq!(count_occurrences(css, "/* OVERRIDE */"), 1);
    let pos = |needle: &str| {
        css.find(needle)
            .unwrap_or_else(|| panic!("missing {needle}"))
    };
    assert!(pos("/* SCOPE_HOME */") < pos("/* BASE */"));
    assert!(pos("/* BASE */") < pos("/* SCOPE_LATER */"));
    assert!(pos("/* SCOPE_LATER */") < pos("/* OVERRIDE */"));
    let warning = "[zenith-bundler] WARNING: CSS import order conflict: route \"/later\" (pages/later.zen) imports \"pages/styles/z-override.css\" before \"pages/styles/a-base.css\", which conflicts with route \"/\" (pages/home.zen). Keeping the earlier route's order.";
    assert_eq!(
        count_occurrences(&built.stderr, warning),
        1,
        "expected one cascade warning, stderr:\n{}",
        built.stderr
    );
}
