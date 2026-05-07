use zenith_compiler::compiler::{
    compile_structured_with_source, compile_structured_with_source_options_and_report,
    CompileOptions,
};

fn diagnostic_code(input: &str) -> String {
    let report = compile_structured_with_source_options_and_report(
        input,
        "/tmp/batch1.zen",
        CompileOptions::default(),
    );
    report
        .diagnostics
        .first()
        .map(|diagnostic| diagnostic.code.clone())
        .expect("expected a diagnostic")
}

#[test]
fn invalid_script_syntax_returns_structured_diagnostic() {
    let input = r#"<script lang="ts">const x =</script><main>{props.title}</main>"#;

    assert_eq!(diagnostic_code(input), "ZEN-SCRIPT-SYNTAX");
}

#[test]
fn invalid_markup_expression_syntax_returns_structured_diagnostic() {
    assert_eq!(
        diagnostic_code(r#"<main>{foo ?}</main>"#),
        "ZEN-EXPR-SYNTAX"
    );
}

#[test]
fn malformed_markup_returns_structured_diagnostic() {
    assert_eq!(diagnostic_code(r#"<main></section>"#), "ZEN-MARKUP-PARSE");
    assert_eq!(
        diagnostic_code(r#"<main><span></span>"#),
        "ZEN-MARKUP-PARSE"
    );
}

#[test]
fn unbound_markup_identifiers_return_structured_diagnostics() {
    assert_eq!(
        diagnostic_code(r#"<main>{missingValue}</main>"#),
        "ZEN-EXPR-UNBOUND"
    );
    assert_eq!(
        diagnostic_code(r#"<main title={missingTitle}></main>"#),
        "ZEN-EXPR-UNBOUND"
    );
    assert_eq!(
        diagnostic_code(r#"<button on:click={missingHandler}></button>"#),
        "ZEN-EXPR-UNBOUND"
    );
}

#[test]
fn known_markup_roots_compile() {
    let input = r#"
<script lang="ts">
const title = "Zenith";
const items = [{ label: "A" }];
state open = false;
const count = signal(0);
const panel = ref<HTMLElement>();
function save() {}
</script>
<main ref={panel} title={title} data-open={open} data-count={count.get()} on:click={save}>
  {title}
  {props.heading}
  {data.user.name}
  {params.slug}
  {ssr.payload}
  {items.map((item) => item.label).join(",")}
</main>
"#;

    compile_structured_with_source(input, "/tmp/known-roots.zen").expect("known roots compile");
}
