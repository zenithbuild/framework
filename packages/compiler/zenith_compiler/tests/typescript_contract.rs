use zenith_compiler::compiler::compile_structured_with_source;

fn expect_contract_error(input: &str, path: &str) -> String {
    compile_structured_with_source(input, path)
        .expect_err("expected compile contract error")
}

fn assert_contract_message_shape(msg: &str, script_ref: &str) {
    assert!(
        msg.contains("Zenith requires TypeScript scripts. Add lang=\"ts\"."),
        "expected canonical contract phrase, got: {msg}"
    );
    assert!(msg.contains(&format!("File: {script_ref}")), "expected file + script ref, got: {msg}");
    assert!(msg.contains("Reason:"), "expected reason line, got: {msg}");
    assert!(
        msg.contains("Example: <script lang=\"ts\">"),
        "expected one-line fix snippet, got: {msg}"
    );
}

#[test]
fn script_lang_ts_is_allowed() {
    let input = "<script lang=\"ts\">const x: number = 1</script><main>{x}</main>";
    let output = compile_structured_with_source(input, "/tmp/ts-pass.zen")
        .expect("lang=ts should compile");
    assert!(output.html.contains("<main"));
}

#[test]
fn script_setup_ts_is_allowed() {
    let input = "<script setup=\"ts\">const x: number = 1</script><main>{x}</main>";
    let output = compile_structured_with_source(input, "/tmp/ts-setup-pass.zen")
        .expect("setup=ts should compile");
    assert!(output.html.contains("<main"));
}

#[test]
fn script_lang_ts_allows_single_quotes_whitespace_and_extra_attrs() {
    let input = "<script\n  lang='ts'\n  data-x=\"1\"\n>const x: number = 1</script><main>{x}</main>";
    let output = compile_structured_with_source(input, "/tmp/ts-attrs-pass.zen")
        .expect("lang='ts' with extra attrs should compile");
    assert!(output.html.contains("<main"));
}

#[test]
fn script_lang_ts_allows_uppercase_value() {
    let input = "<script lang=\"TS\">const x: number = 1</script><main>{x}</main>";
    let output = compile_structured_with_source(input, "/tmp/ts-uppercase-pass.zen")
        .expect("lang=TS should compile via deterministic case normalization");
    assert!(output.html.contains("<main"));
}

#[test]
fn missing_lang_or_setup_fails_contract() {
    let msg = expect_contract_error("<script>const x = 1</script><main>{x}</main>", "/tmp/ts-missing.zen");
    assert_contract_message_shape(&msg, "/tmp/ts-missing.zen#script0");
    assert!(msg.contains("missing lang=\"ts\" annotation"), "expected missing-lang reason, got: {msg}");
}

#[test]
fn invalid_lang_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=\"js\">const x = 1</script><main>{x}</main>",
        "/tmp/ts-js.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-js.zen#script0");
    assert!(msg.contains("lang=\"js\""), "expected invalid lang reason, got: {msg}");
}

#[test]
fn invalid_lang_tsx_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=\"tsx\">const x = 1</script><main>{x}</main>",
        "/tmp/ts-tsx.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-tsx.zen#script0");
    assert!(msg.contains("lang=\"tsx\""), "expected invalid lang reason, got: {msg}");
}

#[test]
fn malformed_lang_attribute_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=>const x = 1</script><main>{x}</main>",
        "/tmp/ts-lang-malformed.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-lang-malformed.zen#script0");
    assert!(msg.contains("malformed `lang` attribute"), "expected malformed-lang reason, got: {msg}");
}

#[test]
fn malformed_setup_attribute_fails_contract() {
    let msg = expect_contract_error(
        "<script setup>const x = 1</script><main>{x}</main>",
        "/tmp/ts-setup-malformed.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-setup-malformed.zen#script0");
    assert!(msg.contains("malformed `setup` attribute"), "expected malformed-setup reason, got: {msg}");
}

#[test]
fn empty_setup_value_fails_contract() {
    let msg = expect_contract_error(
        "<script setup=\"\">const x = 1</script><main>{x}</main>",
        "/tmp/ts-setup-empty.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-setup-empty.zen#script0");
    assert!(msg.contains("setup=\"\""), "expected empty-setup reason, got: {msg}");
}

#[test]
fn duplicate_lang_attribute_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=\"ts\" lang=\"ts\">const x = 1</script><main>{x}</main>",
        "/tmp/ts-dup-lang.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-dup-lang.zen#script0");
    assert!(msg.contains("duplicate `lang` attribute"), "expected duplicate-lang reason, got: {msg}");
}

#[test]
fn lang_and_setup_together_are_rejected_as_ambiguous() {
    let msg = expect_contract_error(
        "<script lang=\"ts\" setup=\"ts\">const x = 1</script><main>{x}</main>",
        "/tmp/ts-ambiguous.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-ambiguous.zen#script0");
    assert!(msg.contains("ambiguous script attributes"), "expected ambiguous-attrs reason, got: {msg}");
}

#[test]
fn nested_script_inside_markup_fails_contract() {
    let msg = expect_contract_error(
        "<section><script lang=\"ts\">const x = 1</script><p>{x}</p></section>",
        "/tmp/ts-nested.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-nested.zen#script0");
    assert!(msg.contains("nested <script> tags inside markup"), "expected nested-script reason, got: {msg}");
}

#[test]
fn unclosed_script_tag_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=\"ts\">const x = 1",
        "/tmp/ts-unclosed.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-unclosed.zen#script0");
    assert!(msg.contains("missing closing </script>"), "expected unclosed reason, got: {msg}");
}

#[test]
fn malformed_script_open_tag_missing_gt_fails_contract() {
    let msg = expect_contract_error(
        "<script lang=\"ts\" const x = 1",
        "/tmp/ts-open-tag-malformed.zen",
    );
    assert_contract_message_shape(&msg, "/tmp/ts-open-tag-malformed.zen#script0");
    assert!(msg.contains("missing closing `>`"), "expected malformed-tag reason, got: {msg}");
}

#[test]
fn deterministic_script_indexing_points_to_second_script() {
    let input = "<script lang=\"ts\">const a = 1</script><script>const b = 2</script><main>{a}</main>";
    let msg = expect_contract_error(input, "/tmp/ts-two-scripts.zen");
    assert_contract_message_shape(&msg, "/tmp/ts-two-scripts.zen#script1");
}

#[test]
fn diagnostics_are_stable_across_newline_variants() {
    let lf = "<script>const a = 1</script><main>{a}</main>";
    let crlf = "<script>\r\nconst a = 1\r\n</script><main>{a}</main>";

    let msg_lf_a = expect_contract_error(lf, "/tmp/ts-lf.zen");
    let msg_lf_b = expect_contract_error(lf, "/tmp/ts-lf.zen");
    let msg_crlf_a = expect_contract_error(crlf, "/tmp/ts-crlf.zen");
    let msg_crlf_b = expect_contract_error(crlf, "/tmp/ts-crlf.zen");

    assert_eq!(msg_lf_a, msg_lf_b);
    assert_eq!(msg_crlf_a, msg_crlf_b);
    assert!(msg_lf_a.contains("#script0"));
    assert!(msg_crlf_a.contains("#script0"));
}
