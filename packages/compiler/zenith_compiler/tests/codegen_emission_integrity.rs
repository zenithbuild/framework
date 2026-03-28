use std::fs;
use std::path::PathBuf;
use std::process::Command;

use zenith_compiler::compiler::compile as compile_module;

fn compile(input: &str) -> String {
    compile_module(input).expect("compile should succeed")
}

fn write_temp_module(name: &str, source: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "zenith-codegen-emission-{name}-{}-{}.mjs",
        std::process::id(),
        source.len()
    ));
    fs::write(&path, source).expect("write temp module");
    path
}

fn assert_node_parses(name: &str, source: &str) {
    let path = write_temp_module(name, source);
    let output = Command::new("node")
        .arg("--check")
        .arg(&path)
        .output()
        .expect("node must be available for syntax validation");
    let _ = fs::remove_file(&path);

    assert!(
        output.status.success(),
        "generated module must remain parseable.\nstdout:\n{}\nstderr:\n{}\nsource:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
        source
    );
}

#[test]
fn html_payload_escapes_backticks_and_interpolation_openers() {
    let output = compile(r#"<p data-note="${value}">raw `tick`</p>"#);

    assert!(
        output.contains(r#"export default `<p data-note="\${value}">raw \`tick\`</p>`"#),
        "html payload must escape template-sensitive content, got: {}",
        output
    );
    assert_node_parses("html-template-escape", &output);
}

#[test]
fn expression_payload_escapes_quotes_backslashes_and_multiline_content() {
    let output = compile(
        r#"<main>{(() => {
  const path = "C:\\tmp\\file";
  return `${path} "ok"`;
})()}</main>"#,
    );

    assert!(
        output.contains(r#"C:\\\\tmp\\\\file"#),
        "expression payload must preserve literal backslashes, got: {}",
        output
    );
    assert!(
        output.contains(r#"\n  const path = \"C:\\\\tmp\\\\file\";"#),
        "multiline expression payload must serialize newlines and quotes safely, got: {}",
        output
    );
    assert!(
        output.contains(r#"return `${path} \"ok\"`;"#),
        "expression payload must preserve backticks and escaped quotes, got: {}",
        output
    );
    assert_node_parses("expression-string-escape", &output);
}

#[test]
fn expression_payload_escapes_line_and_paragraph_separators() {
    let input = format!("<main>{{\"left{}\u{2029}right\"}}</main>", '\u{2028}');
    let output = compile(&input);

    assert!(
        output.contains(r#"\u2028"#) && output.contains(r#"\u2029"#),
        "line/paragraph separators must be escaped in emitted payloads, got: {}",
        output
    );
    assert_node_parses("unicode-separator-escape", &output);
}

#[test]
fn expression_payload_escapes_control_characters_without_truncation() {
    let input = "<main>{\"left\u{0008}\u{000C}\u{0000}\tright\"}</main>";
    let output = compile(input);

    assert!(
        output.contains(r#"\b\f\u0000\tright"#),
        "control characters must remain serialized in emitted payloads, got: {}",
        output
    );
    assert_node_parses("control-character-escape", &output);
}

#[test]
fn escape_sensitive_codegen_is_deterministic_across_repeated_compiles() {
    let input = r#"<p>{(() => {
  const message = "C:\\tmp";
  return `raw ${message}`;
})()}</p>"#;

    let first = compile(input);
    let second = compile(input);

    assert_eq!(first, second);
}
