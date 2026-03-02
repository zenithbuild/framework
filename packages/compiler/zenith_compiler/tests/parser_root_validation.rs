use zenith_compiler::compiler::compile_structured;

#[test]
fn single_root_with_whitespace_and_comments_parses() {
    let input = r#"

<!-- leading comment -->
<script lang="ts">
const count = signal(0)
</script>

<!-- comment before semantic root -->
<main><h1>Hello</h1></main>
<!-- trailing comment -->

"#;

    let output = compile_structured(input).expect("single-root input should compile");
    assert!(output.html.contains("<main>"));
    assert!(output.html.contains("<h1>Hello</h1>"));
}

#[test]
fn multiple_real_roots_fail() {
    let input = "<main>One</main><main>Two</main>";
    let err = compile_structured(input).expect_err("multiple roots should fail");
    assert!(
        err.contains("Multiple root nodes detected or trailing content"),
        "unexpected error: {err}"
    );
}
