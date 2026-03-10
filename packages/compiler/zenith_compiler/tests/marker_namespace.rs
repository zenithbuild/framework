use zenith_compiler::compiler::{compile_structured_with_source, CompilerOutput};

fn compile_ok(input: &str, path: &str) -> CompilerOutput {
    compile_structured_with_source(input, path).expect("compile should succeed")
}

#[test]
fn svg_ref_and_dynamic_r_attr_use_distinct_marker_namespaces() {
    let output = compile_ok(
        r#"<script lang="ts">
const nodeRef = ref<SVGCircleElement>();
state cx = 40;
state radius = 20;
</script>
<svg viewBox="0 0 100 100">
  <circle cx={cx} cy="20" r="8" />
  <circle ref={nodeRef} cx="50" cy="50" r={radius} />
</svg>"#,
        "/tmp/marker-namespace-svg.zen",
    );

    assert!(
        output.html.contains(r#"<circle data-zx-ref="0" cx="50" cy="50" data-zx-r="1" />"#),
        "expected distinct ref/attr markers on the same SVG node, got html: {}",
        output.html
    );
    assert!(
        !output.html.contains(r#"data-zx-r="0" cx="50" cy="50" data-zx-r="1""#),
        "ref and attr markers must not serialize to duplicate data-zx-r attrs: {}",
        output.html
    );
    assert_eq!(output.ref_bindings.len(), 1);
    assert_eq!(output.ref_bindings[0].identifier, "nodeRef");
    assert_eq!(output.ref_bindings[0].selector, r#"[data-zx-ref="0"]"#);

    let r_marker = output
        .marker_bindings
        .iter()
        .find(|binding| binding.attr.as_deref() == Some("r"))
        .expect("expected r marker");
    assert_eq!(r_marker.selector, r#"[data-zx-r="1"]"#);
}

#[test]
fn html_ref_and_dynamic_r_attr_use_distinct_marker_namespaces() {
    let output = compile_ok(
        r#"<script lang="ts">
const panel = ref<HTMLDivElement>();
state title = "before";
state radius = "wide";
</script>
<section>
  <div title={title}></div>
  <div ref={panel} r={radius}></div>
</section>"#,
        "/tmp/marker-namespace-html.zen",
    );

    assert!(
        output.html.contains(r#"<div data-zx-ref="0" data-zx-r="1"></div>"#),
        "expected distinct ref/attr markers on the same HTML node, got html: {}",
        output.html
    );
    assert!(
        !output.html.contains(r#"data-zx-r="0" data-zx-r="1""#),
        "html attrs must not duplicate the old ref marker namespace: {}",
        output.html
    );
    assert_eq!(output.ref_bindings.len(), 1);
    assert_eq!(output.ref_bindings[0].identifier, "panel");
    assert_eq!(output.ref_bindings[0].selector, r#"[data-zx-ref="0"]"#);

    let r_marker = output
        .marker_bindings
        .iter()
        .find(|binding| binding.attr.as_deref() == Some("r"))
        .expect("expected html r marker");
    assert_eq!(r_marker.selector, r#"[data-zx-r="1"]"#);
}
