use zenith_compiler::compiler::{
    compile_structured_with_source_options, CompileOptions, CompilerOutput,
};

fn compile_with_embedded_markup(input: &str) -> Result<CompilerOutput, String> {
    compile_structured_with_source_options(
        input,
        "/virtual/embedded-markup.zen",
        CompileOptions {
            embedded_markup_expressions: true,
        },
    )
}

#[test]
fn lowers_component_tags_inside_expression_to_fragments() {
    let input = r##"
<main>
  {items.map((item) => (
    <Button href={"#cat-" + item.slug}>
      {item.title}
    </Button>
  ))}
</main>
"##;

    let output = compile_with_embedded_markup(input).expect("compile should succeed");
    let expr = output
        .expressions
        .first()
        .cloned()
        .unwrap_or_default();

    assert!(
        expr.contains("__zenith_fragment("),
        "expected embedded markup lowering, got: {}",
        expr
    );
    assert!(
        !expr.contains("props.href") && !expr.contains("<span class=\"contents\">"),
        "component internals must not leak into expression literal payload: {}",
        expr
    );
    assert!(
        expr.contains("item.slug") && expr.contains("item.title"),
        "expression payload should preserve dynamic bindings: {}",
        expr
    );
}

#[test]
fn lowers_nested_markup_inside_markup_interpolations() {
    let input = r#"
<main>
  {cond ? (
    <span>
      {ok ? (<a>Hi</a>) : (<b>No</b>)}
    </span>
  ) : null}
</main>
"#;

    let output = compile_with_embedded_markup(input).expect("compile should succeed");
    let expr = output
        .expressions
        .first()
        .cloned()
        .unwrap_or_default();

    assert!(
        expr.matches("__zenith_fragment(").count() >= 3,
        "expected nested fragment lowering, got: {}",
        expr
    );
    assert!(
        expr.contains("${ok ? (__zenith_fragment("),
        "nested markup branches should be lowered inside interpolation: {}",
        expr
    );
}

#[test]
fn rejects_script_tags_inside_embedded_markup() {
    let input = r#"<main>{cond ? (<div><ScRiPt>alert(1)</ScRiPt></div>) : null}</main>"#;
    let err = compile_with_embedded_markup(input).expect_err("compile should fail");
    assert!(
        err.contains("<script> tags are forbidden"),
        "expected embedded markup script security gate, got: {}",
        err
    );
}

#[test]
fn rejects_string_event_handlers_inside_embedded_markup() {
    let input = r#"<main>{cond ? (<button onclick="evil()">x</button>) : null}</main>"#;
    let err = compile_with_embedded_markup(input).expect_err("compile should fail");
    assert!(
        err.contains("string event handlers are forbidden"),
        "expected embedded markup event security gate, got: {}",
        err
    );
}
