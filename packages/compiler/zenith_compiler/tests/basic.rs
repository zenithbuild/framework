use zenith_compiler::compiler::compile as compile_zen;

fn compile(input: &str) -> String {
    compile_zen(input).expect("compile should succeed")
}

#[test]
fn compiles_basic_expression() {
    let input = r#"<script lang="ts">const count = 1</script><h1>{count}</h1>"#;

    let output = compile(input);

    println!("Output: {}", output);

    assert!(output.contains(r#"data-zx-e="0""#));
    assert!(output.contains("_count"));
}

#[test]
fn compiles_event_handler() {
    let input = r#"<script lang="ts">function increment() {}</script><button on:click={increment}>+</button>"#;

    let output = compile(input);

    println!("Output: {}", output);

    assert!(output.contains(r#"data-zx-on-click="0""#));
    assert!(output.contains("_increment"));
}
