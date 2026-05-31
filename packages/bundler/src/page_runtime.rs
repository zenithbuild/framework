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
function __zro(value) {{
  return value && typeof value === 'object' && !Array.isArray(value);
}}
function __zsr(value) {{
  if (__zro(value) && __zro(value.route) && __zro(value.scoped)) {{
    return value.route;
  }}
  return __zro(value) ? value : {{}};
}}
function __zsd(value, key) {{
  const scoped = __zro(value) && __zro(value.scoped) ? value.scoped : null;
  const scopedValue = scoped && typeof key === 'string' ? scoped[key] : null;
  return __zro(scopedValue) ? scopedValue : {{}};
}}
let __zenith_ssr_data = __zrd(__zss);
let data = __zenith_ssr_data;
let ssr_data = __zenith_ssr_data;
function __zrr() {{
  __zenith_ssr_data = __zrd(__zss);
  data = __zsr(__zenith_ssr_data);
  ssr_data = data;
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
