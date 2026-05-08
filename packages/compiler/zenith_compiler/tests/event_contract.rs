use zenith_compiler::compiler::{
    compile_structured, compile_structured_with_source_options_and_warnings, CompileOptions,
};

#[test]
fn lowers_doubleclick_alias_to_dblclick() {
    let output = compile_structured(
        r#"<script lang="ts">function handleDouble() {}</script><button on:doubleclick={handleDouble}></button>"#,
    )
    .expect("compile");

    assert_eq!(output.event_bindings.len(), 1);
    assert_eq!(output.event_bindings[0].event, "dblclick");
    assert!(output.html.contains(r#"data-zx-on-dblclick="0""#));
}

#[test]
fn lowers_hover_aliases_to_pointer_events() {
    let output = compile_structured(
        r#"<script lang="ts">function handleEnter() {} function handleLeave() {}</script><button on:hoverin={handleEnter} on:hoverout={handleLeave}></button>"#,
    )
    .expect("compile");

    assert_eq!(output.event_bindings.len(), 2);
    assert_eq!(output.event_bindings[0].event, "pointerenter");
    assert_eq!(output.event_bindings[1].event, "pointerleave");
    assert!(output.html.contains(r#"data-zx-on-pointerenter="0""#));
    assert!(output.html.contains(r#"data-zx-on-pointerleave="1""#));
}

#[test]
fn keeps_esc_as_special_runtime_binding_event() {
    let output = compile_structured(
        r#"<script lang="ts">function closeMenu() {}</script><div on:esc={closeMenu}></div>"#,
    )
    .expect("compile");

    assert_eq!(output.event_bindings.len(), 1);
    assert_eq!(output.event_bindings[0].event, "esc");
    assert!(output.html.contains(r#"data-zx-on-esc="0""#));
}

#[test]
fn rejects_string_event_handlers() {
    let error = compile_structured(r#"<button on:click="doThing"></button>"#).unwrap_err();

    assert!(error.contains("Event attributes do not accept string handlers"));
    assert!(error.contains("Use on:event={handler}"));
}

#[test]
fn rejects_direct_call_event_handlers() {
    let error = compile_structured(r#"<button on:click={doThing()}></button>"#).unwrap_err();

    assert!(error.contains("must not be direct call expressions"));
}

#[test]
fn rejects_direct_call_event_handler_variants() {
    for source in [
        r#"<button on:click={(doThing())}></button>"#,
        r#"<button on:click={handlers["save"]()}></button>"#,
        r#"<button on:click={doThing?.()}></button>"#,
        r#"<button on:click={factory().handler}></button>"#,
    ] {
        let error = compile_structured(source).unwrap_err();
        assert!(error.contains("must not be direct call expressions"));
    }
}

#[test]
fn allows_inline_arrow_function_handlers() {
    let output = compile_structured(
        r#"<script lang="ts">function submit(event: Event) {}</script><button on:click={(event) => submit(event)}></button>"#,
    )
    .expect("compile");

    assert_eq!(output.event_bindings.len(), 1);
    assert_eq!(output.event_bindings[0].event, "click");
    assert!(output.expressions[0].contains("(event) =>"));
    assert!(output.expressions[0].contains("_submit(event)"));
}

#[test]
fn emits_unknown_event_warning_with_suggestion() {
    let (_, warnings) = compile_structured_with_source_options_and_warnings(
        r#"<script lang="ts">function handleClick() {}</script><button on:clcik={handleClick}></button>"#,
        "event-contract.zen",
        CompileOptions::default(),
    )
    .expect("compile");

    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0].code, "ZEN-EVT-UNKNOWN");
    assert!(warnings[0].message.contains("Unknown DOM event 'clcik'"));
    assert!(warnings[0].message.contains("Did you mean 'click'"));
    assert!(warnings[0].line >= 1);
    assert!(warnings[0].column >= 1);
}

#[test]
fn rejects_innerhtml_binding_with_explicit_guidance() {
    let error = compile_structured(r#"<section innerHTML={userInput}></section>"#).unwrap_err();

    assert!(error.contains("innerHTML bindings are forbidden"));
    assert!(error.contains("Use unsafeHTML={value}"));
}
