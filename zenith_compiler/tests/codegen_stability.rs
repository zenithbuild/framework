use zenith_compiler::compiler::compile;

// ============================================================
// PHASE 9: CODEGEN STABILITY LOCK
// Codegen output must be byte-stable.
// Refactors must not alter structure.
// ============================================================

// --- 9.1 Output Snapshot Testing ---

#[test]
fn snapshot_simple_element() {
    let output = compile("<div></div>");
    let expected = r#"export const __zenith_expr = []

export function setup() {
  return {}
}

export default `<div></div>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_element_with_text() {
    let output = compile("<p>Hello</p>");
    let expected = r#"export const __zenith_expr = []

export function setup() {
  return {}
}

export default `<p>Hello</p>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_expression() {
    let output = compile("<h1>{title}</h1>");
    let expected = r#"export const __zenith_expr = ["title"]

export function setup() {
  return {}
}

export default `<h1 data-zx-e="0"></h1>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_event_handler() {
    let output = compile(r#"<button on:click={go}>X</button>"#);
    let expected = r#"export const __zenith_expr = ["go"]

export function setup() {
  return {}
}

export default `<button data-zx-on-click="0">X</button>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_self_closing() {
    let output = compile("<br />");
    let expected = r#"export const __zenith_expr = []

export function setup() {
  return {}
}

export default `<br />`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_static_attribute() {
    let output = compile(r#"<div id="main"></div>"#);
    let expected = r#"export const __zenith_expr = []

export function setup() {
  return {}
}

export default `<div id="main"></div>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_deep_nesting() {
    let output = compile(r#"<div><section><p>{content}</p></section></div>"#);
    let expected = r#"export const __zenith_expr = ["content"]

export function setup() {
  return {}
}

export default `<div><section><p data-zx-e="0"></p></section></div>`"#;
    assert_eq!(output, expected);
}

#[test]
fn snapshot_mixed_everything() {
    let output =
        compile(r#"<div id="app"><h1>{title}</h1><button on:click={save}>Save</button></div>"#);
    let expected = r#"export const __zenith_expr = ["title", "save"]

export function setup() {
  return {}
}

export default `<div id="app"><h1 data-zx-e="0"></h1><button data-zx-on-click="1">Save</button></div>`"#;
    assert_eq!(output, expected);
}

// --- 9.2 Whitespace Stability ---
// Policy: PRESERVE EXACTLY. No normalization.

#[test]
fn whitespace_preserved_exactly_in_text() {
    let output = compile("<p>  hello  world  </p>");
    assert!(output.contains("  hello  world  "));
}
