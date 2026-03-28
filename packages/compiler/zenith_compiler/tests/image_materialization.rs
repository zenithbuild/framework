use zenith_compiler::compiler::MarkerPayload;
use zenith_compiler::image_materialization::build_image_materialization;

fn sample_markers() -> Vec<MarkerPayload> {
    vec![
        MarkerPayload {
            index: 0,
            kind: "attr".into(),
            selector: "[data-zx-data-zenith-image=\"0\"]".into(),
            attr: Some("data-zenith-image".into()),
            ..Default::default()
        },
        MarkerPayload {
            index: 1,
            kind: "attr".into(),
            selector: "[data-zx-unsafeHTML=\"1\"]".into(),
            attr: Some("unsafeHTML".into()),
            ..Default::default()
        },
    ]
}

#[test]
fn static_image_props_emits_materialization_entries() {
    let literals = vec!["{ src: \"/hero.png\", alt: \"Hero\", sizes: \"100vw\" }".to_string()];
    let out = build_image_materialization(&sample_markers(), &literals).expect("build");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].selector, "[data-zx-data-zenith-image=\"0\"]");
    assert_eq!(out[0].props["src"], "/hero.png");
    assert_eq!(out[0].props["alt"], "Hero");
    assert_eq!(out[0].props["sizes"], "100vw");
}

#[test]
fn dynamic_image_props_rejected() {
    let literals = vec!["{ src: someVar, alt: \"x\" }".to_string()];
    let err = build_image_materialization(&sample_markers(), &literals).unwrap_err();
    assert!(
        err.contains("unsupported dynamic") || err.contains("dynamic Image"),
        "unexpected error: {err}"
    );
}
