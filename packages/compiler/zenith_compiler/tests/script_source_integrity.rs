use zenith_compiler::compiler::{compile_structured_with_source, CompilerOutput};

fn compile_script(input: &str) -> CompilerOutput {
    compile_structured_with_source(input, "/tmp/script-source-integrity.zen")
        .expect("component should compile")
}

fn hoisted_code(output: &CompilerOutput) -> String {
    output.hoisted.code.join("\n")
}

#[test]
fn script_lowering_preserves_literals_comments_templates_and_regex_text() {
    let output = compile_script(
        r#"
<script lang="ts">
state isOpen = false;
const literal = "isOpen literal";
const template = `template raw isOpen ${isOpen ? "open" : "closed"}`;
const matcher = /isOpen+/g;
function describe() {
  // isOpen stays in this comment
  return `${template} ${literal} ${matcher.source}`;
}
</script>
<main>{isOpen ? "open" : "closed"}</main>
"#,
    );

    let hoisted = hoisted_code(&output);

    assert!(
        hoisted.contains("\"isOpen literal\""),
        "string literal text must remain untouched: {hoisted}"
    );
    assert!(
        hoisted.contains("// isOpen stays in this comment"),
        "comment text must remain untouched: {hoisted}"
    );
    assert!(
        hoisted.contains("`template raw isOpen ${"),
        "template raw text must remain untouched: {hoisted}"
    );
    assert!(
        hoisted.contains("_isOpen.get() ? \"open\" : \"closed\""),
        "template expression holes must still lower structurally: {hoisted}"
    );
    assert!(
        hoisted.contains("/isOpen+/g"),
        "regex literal contents must remain untouched: {hoisted}"
    );
}

#[test]
fn script_lowering_is_deterministic_across_repeated_compiles() {
    let input = r#"
<script lang="ts">
state isOpen = false;
const label = `status:${isOpen ? "open" : "closed"}`;
</script>
<main>{label}</main>
"#;

    let first = compile_script(input);
    let second = compile_script(input);

    assert_eq!(first.hoisted.code, second.hoisted.code);
    assert_eq!(first.hoisted.declarations, second.hoisted.declarations);
    assert_eq!(first.hoisted.state, second.hoisted.state);
}
