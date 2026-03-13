pub fn render_runtime_data_helpers(ssr_json: &str) -> String {
    format!(
        r#"const __zenith_static_ssr_data = {};
function __zenith_read_ssr_data(staticValue) {{
  const runtimeValue = typeof globalThis === 'object' ? globalThis.__zenith_ssr_data : undefined;
  if (runtimeValue && typeof runtimeValue === 'object' && !Array.isArray(runtimeValue)) {{
    return runtimeValue;
  }}
  return staticValue;
}}
let __zenith_ssr_data = __zenith_read_ssr_data(__zenith_static_ssr_data);
let data = __zenith_ssr_data;
let ssr_data = __zenith_ssr_data;
function __zenith_refresh_runtime_data() {{
  __zenith_ssr_data = __zenith_read_ssr_data(__zenith_static_ssr_data);
  data = __zenith_ssr_data;
  ssr_data = __zenith_ssr_data;
}}
"#,
        ssr_json
    )
}

pub fn render_route_html_helpers() -> &'static str {
    r#"const __zenith_has_route_html = true;
function __zenith_read_route_html(staticValue) {
  const runtimeValue = typeof globalThis === 'object' ? globalThis.__zenith_route_html : undefined;
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) {
    return runtimeValue;
  }
  return staticValue;
}
function __zenith_apply_route_html(root) {
  const routeHtml = __zenith_read_route_html(__zenith_html);
  if (typeof routeHtml !== 'string' || routeHtml.length === 0) {
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
