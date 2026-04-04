pub fn render_runtime_data_helpers(ssr_json: &str) -> String {
    format!(
        r#"const __zss = {};
function __zrd(staticValue) {{
  const runtimeValue = typeof globalThis === 'object' ? globalThis.__zenith_ssr_data : undefined;
  if (runtimeValue && typeof runtimeValue === 'object' && !Array.isArray(runtimeValue)) {{
    return runtimeValue;
  }}
  return staticValue;
}}
let __zenith_ssr_data = __zrd(__zss);
let data = __zenith_ssr_data;
let ssr_data = __zenith_ssr_data;
function __zrr() {{
  __zenith_ssr_data = __zrd(__zss);
  data = __zenith_ssr_data;
  ssr_data = __zenith_ssr_data;
}}
"#,
        ssr_json
    )
}

pub fn render_route_html_helpers() -> &'static str {
    r#"function __zrh() {
  const runtimeValue = typeof globalThis === 'object' ? globalThis.__zenith_route_html : undefined;
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) {
    return runtimeValue;
  }
  return null;
}
function __zah(root) {
  const routeHtml = __zrh();
  if (!routeHtml) {
    return;
  }
  if (typeof Document === 'undefined' || !(root instanceof Document)) {
    return;
  }
  if (typeof DOMParser === 'undefined') {
    return;
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(routeHtml, 'text/html');
  const currentApp = root.getElementById('app');
  const nextApp = parsed.getElementById('app');
  if (currentApp && nextApp) {
    currentApp.replaceWith(nextApp);
    return;
  }
  if (root.body && parsed.body) {
    root.body.replaceChildren(...parsed.body.children);
  }
}
"#
}
