use super::*;

use crate::bundler_contracts::validate_server_payload;
use std::process::Command;

pub(crate) fn run_server_script(
    server_script: &Option<CompilerServerScript>,
    params: &BTreeMap<String, String>,
) -> Result<Option<serde_json::Value>, String> {
    let Some(server_script) = server_script else {
        return Ok(None);
    };

    let params_json =
        serde_json::to_string(params).map_err(|e| format!("failed to serialize params: {e}"))?;
    let runner = r#"
import vm from 'node:vm';
const source = process.env.ZENITH_SERVER_SOURCE || '';
const params = JSON.parse(process.env.ZENITH_SERVER_PARAMS || '{}');
const sourcePath = process.env.ZENITH_SERVER_SOURCE_PATH || '';
const requestUrl = process.env.ZENITH_SERVER_REQUEST_URL || 'http://localhost/';
const routePattern = process.env.ZENITH_SERVER_ROUTE_PATTERN || '';
const routeId = process.env.ZENITH_SERVER_ROUTE_ID || routePattern || '';
const routeFile = process.env.ZENITH_SERVER_ROUTE_FILE || sourcePath || '';

const ctx = {
  params: { ...params },
  url: new URL(requestUrl),
  request: new Request(requestUrl, { method: 'GET' }),
  route: {
    id: routeId,
    pattern: routePattern,
    file: routeFile
  }
};

const moduleSource = `${source}\nexport default {` +
  `data: typeof data === 'undefined' ? undefined : data,` +
  `load: typeof load === 'undefined' ? undefined : load,` +
  `ssr_data: typeof ssr_data === 'undefined' ? undefined : ssr_data,` +
  `props: typeof props === 'undefined' ? undefined : props,` +
  `ssr: typeof ssr === 'undefined' ? undefined : ssr,` +
  `prerender: typeof prerender === 'undefined' ? undefined : prerender` +
  `};`;
const context = vm.createContext({
  params: { ...params },
  ctx,
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  URL
});
const mod = new vm.SourceTextModule(moduleSource, {
  context,
  initializeImportMeta(meta) { meta.url = 'zenith:server-script'; }
});
await mod.link((specifier) => {
  throw new Error(`[zenith-bundler] server script imports are not allowed: ${specifier}`);
});
await mod.evaluate();
const namespaceKeys = Object.keys(mod.namespace).filter((key) => key !== 'default');
const allowed = new Set(['data', 'load', 'ssr_data', 'props', 'ssr', 'prerender', 'exportPaths']);
for (const key of namespaceKeys) {
  if (!allowed.has(key)) {
    throw new Error(`[zenith-bundler] unsupported server export '${key}'`);
  }
}
const exported = mod.namespace.default && typeof mod.namespace.default === 'object'
  ? mod.namespace.default
  : null;
if (!exported) {
  process.stdout.write('null');
  process.exit(0);
}
for (const key of Object.keys(exported)) {
  if (!allowed.has(key)) {
    throw new Error(`[zenith-bundler] unsupported server export '${key}'`);
  }
}
const hasData = Object.prototype.hasOwnProperty.call(exported, 'data') && exported.data !== undefined;
const hasLoad = Object.prototype.hasOwnProperty.call(exported, 'load') && typeof exported.load === 'function';
const hasSsrData = Object.prototype.hasOwnProperty.call(exported, 'ssr_data') && exported.ssr_data !== undefined;
const hasSsr = Object.prototype.hasOwnProperty.call(exported, 'ssr') && exported.ssr !== undefined;
const hasProps = Object.prototype.hasOwnProperty.call(exported, 'props') && exported.props !== undefined;
const hasPrerender = Object.prototype.hasOwnProperty.call(exported, 'prerender') && exported.prerender !== undefined;

try {
  if (hasPrerender && typeof exported.prerender !== 'boolean') {
    throw new Error('[zenith-bundler] prerender export must be a boolean');
  }
  if (hasData && hasLoad) {
    throw new Error('[zenith-bundler] server script cannot export both data and load');
  }
  if (hasData && (hasSsrData || hasSsr || hasProps)) {
    throw new Error('[zenith-bundler] data cannot be combined with legacy ssr_data/ssr/props exports');
  }
  if (hasLoad && (hasSsrData || hasSsr || hasProps)) {
    throw new Error('[zenith-bundler] load(ctx) cannot be combined with legacy ssr_data/ssr/props exports');
  }
  if (hasSsrData && hasSsr) {
    throw new Error('[zenith-bundler] server script cannot export both ssr_data and ssr');
  }
  if (hasLoad && exported.load.length !== 1) {
    throw new Error('[zenith-bundler] load(ctx) must accept exactly one argument');
  }

  let payload = null;
  if (hasLoad) {
    payload = await exported.load(ctx);
  } else if (hasData) {
    payload = exported.data;
  } else if (hasSsrData) {
    payload = exported.ssr_data;
  } else if (hasSsr) {
    payload = exported.ssr;
  }

  if (hasProps) {
    if (payload === null || payload === undefined) {
      payload = { props: exported.props };
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload = { ...payload, props: exported.props };
    } else {
      throw new Error('[zenith-bundler] `props` export requires object-compatible payload');
    }
  }

  assertJsonSerializable(payload, '$', new Set());
  process.stdout.write(JSON.stringify(payload === undefined ? null : payload));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({
    __zenith_error: {
      status: 500,
      code: 'LOAD_FAILED',
      message
    }
  }));
}

function assertJsonSerializable(value, path, seen) {
  if (value === null || value === undefined) {
    return;
  }
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: non-finite number`);
    }
    return;
  }
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: ${t}`);
  }
  if (t !== 'object') {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: ${t}`);
  }
  if (seen.has(value)) {
    throw new Error(`[zenith-bundler] non-serializable value at ${path}: circular reference`);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertJsonSerializable(value[i], `${path}[${i}]`, seen);
      }
      return;
    }
    if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp || value instanceof URL) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: unsupported instance`);
    }
    const proto = Object.getPrototypeOf(value);
    const ctor = proto && proto.constructor;
    const isPlainObject = proto === null || proto === Object.prototype || (typeof ctor === 'function' && ctor.name === 'Object');
    if (!isPlainObject) {
      throw new Error(`[zenith-bundler] non-serializable value at ${path}: class instance`);
    }
    for (const key of Object.keys(value)) {
      assertJsonSerializable(value[key], `${path}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}
"#;

    let result = Command::new("node")
        .arg("--experimental-vm-modules")
        .arg("--input-type=module")
        .arg("-e")
        .arg(runner)
        .env("ZENITH_SERVER_SOURCE", &server_script.source)
        .env("ZENITH_SERVER_PARAMS", params_json)
        .env(
            "ZENITH_SERVER_SOURCE_PATH",
            server_script.source_path.clone().unwrap_or_default(),
        )
        .env("ZENITH_SERVER_REQUEST_URL", "http://localhost/")
        .env("ZENITH_SERVER_ROUTE_PATTERN", "")
        .env(
            "ZENITH_SERVER_ROUTE_FILE",
            server_script.source_path.clone().unwrap_or_default(),
        )
        .env("ZENITH_SERVER_ROUTE_ID", "")
        .output()
        .map_err(|e| format!("failed to run server script runner: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!(
            "server script execution failed (status {}): {}",
            result.status, stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(None);
    }

    let value: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("invalid server script JSON: {e}"))?;
    if !value.is_object() {
        return Err("server script must resolve to an object payload".into());
    }
    validate_server_payload(&value, "ssr_data")?;
    Ok(Some(value))
}
