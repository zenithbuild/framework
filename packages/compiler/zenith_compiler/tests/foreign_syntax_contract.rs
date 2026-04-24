use zenith_compiler::compiler::{
    compile_structured, compile_structured_with_source_options_and_report, CompileOptions,
    CompileReport,
};
use serde_json::to_string_pretty;

fn compile_report(input: &str) -> CompileReport {
    compile_structured_with_source_options_and_report(
        input,
        "/tmp/foreign-syntax.zen",
        CompileOptions::default(),
    )
}

fn assert_foreign_syntax_error(
    input: &str,
    expected_code: &str,
    expected_token: &str,
    expected_reason: &str,
    expected_hint: &str,
) {
    assert!(
        compile_structured(input).is_err(),
        "compile should fail for `{input}`"
    );

    let report = compile_report(input);
    assert!(report.output.is_none(), "structured output must be absent");
    assert_eq!(report.diagnostics.len(), 1, "expected one diagnostic");

    let diagnostic = &report.diagnostics[0];
    assert_eq!(diagnostic.code, expected_code);
    assert!(
        diagnostic.message.contains(expected_token),
        "message should include token `{expected_token}`: {}",
        diagnostic.message
    );
    assert!(
        diagnostic.message.contains(expected_reason),
        "message should include reason `{expected_reason}`: {}",
        diagnostic.message
    );
    assert_eq!(diagnostic.suggestion.as_deref(), Some(expected_hint));
    assert!(diagnostic.range.start.line >= 1);
    assert!(diagnostic.range.start.column >= 1);
}

#[test]
fn rejects_blade_style_if_directives() {
    assert_foreign_syntax_error(
        "@if (ready)\n<div>ready</div>",
        "ZEN-TPL-FOREIGN-CONTROL",
        "@if",
        "Blade/Twig-style directives",
        "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
    );
}

#[test]
fn rejects_svelte_if_blocks() {
    assert_foreign_syntax_error(
        "{#if ready}<div>ready</div>{/if}",
        "ZEN-TPL-FOREIGN-CONTROL",
        "{#if",
        "Svelte-style control blocks",
        "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
    );
}

#[test]
fn rejects_svelte_each_blocks() {
    assert_foreign_syntax_error(
        "{#each items as item}<div>{item}</div>{/each}",
        "ZEN-TPL-FOREIGN-CONTROL",
        "{#each",
        "Svelte-style each blocks",
        "Rewrite this iteration using the canonical Zenith iteration syntax supported by the compiler.",
    );
}

#[test]
fn rejects_vue_if_directives() {
    assert_foreign_syntax_error(
        r#"<div v-if={ready}>ready</div>"#,
        "ZEN-TPL-FOREIGN-CONTROL",
        "v-if",
        "Vue-style template directives",
        "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
    );
}

#[test]
fn rejects_at_click_event_directives() {
    assert_foreign_syntax_error(
        r#"<button @click={handleClick}>Run</button>"#,
        "ZEN-EVT-FOREIGN-SYNTAX",
        "@click",
        "Zenith binds events as on:<event>={handler}.",
        "Use on:click={handleClick}.",
    );
}

#[test]
fn rejects_camel_case_dom_event_props() {
    assert_foreign_syntax_error(
        r#"<button onClick={handleClick}>Run</button>"#,
        "ZEN-EVT-FOREIGN-SYNTAX",
        "onClick",
        "camelCase DOM event props",
        "Use on:click={handleClick} instead.",
    );
}

#[test]
fn rejects_lowercase_dom_event_props() {
    assert_foreign_syntax_error(
        r#"<button onclick="handleClick">Run</button>"#,
        "ZEN-EVT-FOREIGN-SYNTAX",
        "onclick",
        "DOM event prop attributes",
        "Use on:click={handleClick} instead.",
    );
}

#[test]
fn golden_control_foreign_syntax_diagnostic() {
    let report = compile_report("@if (ready)");
    let diagnostic = report
        .diagnostics
        .first()
        .expect("foreign control syntax should emit one diagnostic");
    let snapshot = to_string_pretty(diagnostic).expect("serialize diagnostic");
    let expected = r#"{
  "code": "ZEN-TPL-FOREIGN-CONTROL",
  "message": "Invalid Zenith control syntax: @if\nZenith .zen files do not use Blade/Twig-style directives.\nHint: Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.\nFound at line 1, column 1.",
  "severity": "error",
  "range": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 3
    }
  },
  "source": "compiler",
  "suggestion": "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
  "docsPath": "docs/documentation/guides/troubleshooting.md"
}"#;

    assert_eq!(snapshot, expected);
}

#[test]
fn golden_event_foreign_syntax_diagnostic() {
    let report = compile_report(r#"<button @click={handleClick}></button>"#);
    let diagnostic = report
        .diagnostics
        .first()
        .expect("foreign event syntax should emit one diagnostic");
    let snapshot = to_string_pretty(diagnostic).expect("serialize diagnostic");
    let expected = r#"{
  "code": "ZEN-EVT-FOREIGN-SYNTAX",
  "message": "Invalid Zenith event syntax: @click\nZenith binds events as on:<event>={handler}.\nHint: Use on:click={handleClick}.\nFound at line 1, column 9.",
  "severity": "error",
  "range": {
    "start": {
      "line": 1,
      "column": 9
    },
    "end": {
      "line": 1,
      "column": 14
    }
  },
  "source": "compiler",
  "suggestion": "Use on:click={handleClick}.",
  "docsPath": "docs/documentation/syntax/events.md"
}"#;

    assert_eq!(snapshot, expected);
}
