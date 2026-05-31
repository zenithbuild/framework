import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFacingRouteMessage, defaultRouteDenyMessage } from '../server-error.js';
import { SERVER_SCRIPT_RUNNER } from './server-script-runner-template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ source: string, sourcePath: string, params: Record<string, string>, requestUrl?: string, requestMethod?: string, requestHeaders?: Record<string, string | string[] | undefined>, requestBodyBuffer?: Buffer | null, routePattern?: string, routeFile?: string, routeId?: string, routeKind?: 'page' | 'resource', globalMiddlewareSource?: string, globalMiddlewareSourcePath?: string, scopedServerData?: unknown[], scopedServerModuleBaseDir?: string, scopedServerModuleSources?: unknown[] }} input
 * @returns {Promise<{ result: { kind: string, [key: string]: unknown }, trace: { guard: string, action: string, load: string }, status?: number, setCookies?: string[] }>}
 */
export async function executeServerRoute({
  source,
  sourcePath,
  params,
  requestUrl,
  requestMethod,
  requestHeaders,
  requestBodyBuffer,
  routePattern,
  routeFile,
  routeId,
  routeKind = 'page',
  guardOnly = false,
  globalMiddlewareSource = '',
  globalMiddlewareSourcePath = '',
  scopedServerData = [],
  scopedServerModuleBaseDir = '',
  scopedServerModuleSources = []
}) {
  const hasScopedServerData = Array.isArray(scopedServerData) && scopedServerData.length > 0;
  if ((!source || !String(source).trim()) && !hasScopedServerData) {
    return {
      result: { kind: 'data', data: {} },
      trace: { guard: 'none', action: 'none', load: 'none' }
    };
  }

  const payload = await spawnNodeServerRunner({
    source,
    sourcePath,
    params,
    requestUrl: requestUrl || 'http://localhost/',
    requestMethod: requestMethod || 'GET',
    requestHeaders: sanitizeRequestHeaders(requestHeaders || {}),
    requestBodyBuffer: Buffer.isBuffer(requestBodyBuffer) ? requestBodyBuffer : null,
    routePattern: routePattern || '',
    routeFile: routeFile || sourcePath || '',
    routeId: routeId || routeIdFromSourcePath(sourcePath || ''),
    routeKind,
    guardOnly,
    globalMiddlewareSource,
    globalMiddlewareSourcePath,
    scopedServerData,
    scopedServerModuleBaseDir,
    scopedServerModuleSources
  });

  if (payload === null || payload === undefined) {
    return {
      result: { kind: 'data', data: {} },
      trace: { guard: 'none', action: 'none', load: 'none' }
    };
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[zenith-preview] server script payload must be an object');
  }

  const errorEnvelope = payload.__zenith_error;
  if (errorEnvelope && typeof errorEnvelope === 'object') {
    return {
      result: {
        kind: 'deny',
        status: 500,
        message: defaultRouteDenyMessage(500)
      },
      trace: { guard: 'none', action: 'none', load: 'deny' }
    };
  }

  const result = payload.result;
  const trace = payload.trace;
  if (result && typeof result === 'object' && !Array.isArray(result) && typeof result.kind === 'string') {
    return {
      result,
      trace: trace && typeof trace === 'object'
        ? {
          guard: String(trace.guard || 'none'),
          action: String(trace.action || 'none'),
          load: String(trace.load || 'none')
        }
        : { guard: 'none', action: 'none', load: 'none' },
      status: Number.isInteger(payload.status) ? payload.status : undefined,
      setCookies: Array.isArray(payload.setCookies)
        ? payload.setCookies.filter((value) => typeof value === 'string' && value.length > 0)
        : []
    };
  }

  return {
    result: {
      kind: 'data',
      data: payload
    },
    trace: { guard: 'none', action: 'none', load: 'data' }
  };
}

/**
 * @param {{ source: string, sourcePath: string, params: Record<string, string>, requestUrl?: string, requestMethod?: string, requestHeaders?: Record<string, string | string[] | undefined>, routePattern?: string, routeFile?: string, routeId?: string }} input
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function executeServerScript(input) {
  const execution = await executeServerRoute(input);
  const result = execution?.result;
  if (!result || typeof result !== 'object') {
    return null;
  }
  if (result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return result.data;
  }

  if (result.kind === 'redirect') {
    return {
      __zenith_error: {
        status: Number.isInteger(result.status) ? result.status : 302,
        code: 'REDIRECT',
        message: `Redirect to ${String(result.location || '')}`
      }
    };
  }

  if (result.kind === 'deny') {
    const status = Number.isInteger(result.status) ? result.status : 403;
    return {
      __zenith_error: {
        status,
        code: status >= 500 ? 'LOAD_FAILED' : (status === 404 ? 'NOT_FOUND' : 'ACCESS_DENIED'),
        message: clientFacingRouteMessage(status, result.message)
      }
    };
  }

  return {};
}

/**
 * @param {{ source: string, sourcePath: string, params: Record<string, string>, requestUrl: string, requestMethod: string, requestHeaders: Record<string, string>, requestBodyBuffer?: Buffer | null, routePattern: string, routeFile: string, routeId: string, routeKind?: 'page' | 'resource', globalMiddlewareSource?: string, globalMiddlewareSourcePath?: string, scopedServerData?: unknown[], scopedServerModuleBaseDir?: string, scopedServerModuleSources?: unknown[] }} input
 * @returns {Promise<unknown>}
 */
function spawnNodeServerRunner(input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ['--experimental-vm-modules', '--input-type=module', '-e', SERVER_SCRIPT_RUNNER],
      {
        env: {
          ...process.env,
          ZENITH_SERVER_SOURCE: input.source,
          ZENITH_SERVER_SOURCE_PATH: input.sourcePath || '',
          ZENITH_SERVER_PARAMS: JSON.stringify(input.params || {}),
          ZENITH_SERVER_REQUEST_URL: input.requestUrl || 'http://localhost/',
          ZENITH_SERVER_REQUEST_METHOD: input.requestMethod || 'GET',
          ZENITH_SERVER_REQUEST_HEADERS: JSON.stringify(input.requestHeaders || {}),
          ZENITH_SERVER_ROUTE_PATTERN: input.routePattern || '',
          ZENITH_SERVER_ROUTE_FILE: input.routeFile || input.sourcePath || '',
          ZENITH_SERVER_ROUTE_ID: input.routeId || '',
          ZENITH_SERVER_ROUTE_KIND: input.routeKind || 'page',
          ZENITH_SERVER_GUARD_ONLY: input.guardOnly ? '1' : '',
          ZENITH_SERVER_CONTRACT_PATH: join(__dirname, '..', 'server-contract.js'),
          ZENITH_SERVER_ROUTE_AUTH_PATH: join(__dirname, '..', 'auth', 'route-auth.js'),
          ZENITH_SERVER_MATCHED_ROUTE_PIPELINE_PATH: join(__dirname, '..', 'server-runtime', 'matched-route-pipeline.js'),
          ZENITH_GLOBAL_MIDDLEWARE_SOURCE: input.globalMiddlewareSource || '',
          ZENITH_GLOBAL_MIDDLEWARE_SOURCE_PATH: input.globalMiddlewareSourcePath || '',
          ZENITH_SCOPED_SERVER_DATA: JSON.stringify(Array.isArray(input.scopedServerData) ? input.scopedServerData : []),
          ZENITH_SCOPED_SERVER_MODULE_BASE_DIR: input.scopedServerModuleBaseDir || '',
          ZENITH_SCOPED_SERVER_MODULE_SOURCES: JSON.stringify(Array.isArray(input.scopedServerModuleSources) ? input.scopedServerModuleSources : []),
          ZENITH_SCOPED_SERVER_RUNTIME_PATH: join(__dirname, '..', 'scoped-server-data', 'runtime.js')
        },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const runnerRequestBody = Buffer.isBuffer(input.requestBodyBuffer) ? input.requestBodyBuffer : null;
    child.stdin.on('error', () => {
      // ignore broken pipes when the runner exits before consuming stdin
    });
    child.stdin.end(runnerRequestBody && runnerRequestBody.length > 0 ? runnerRequestBody : undefined);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `[zenith-preview] server script execution failed (${code}): ${stderr.trim() || stdout.trim()}`
          )
        );
        return;
      }
      const stderrOutput = stderr.trim();
      const internalErrorIndex = stderrOutput.indexOf('[Zenith:Server]');
      if (internalErrorIndex >= 0) {
        console.error(stderrOutput.slice(internalErrorIndex).trim());
      }
      const raw = stdout.trim();
      if (!raw || raw === 'null') {
        resolvePromise(null);
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch (error) {
        rejectPromise(
          new Error(
            `[zenith-preview] invalid server payload JSON: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });
  });
}

/**
 * @param {Record<string, string | string[] | undefined>} headers
 * @returns {Record<string, string>}
 */
function sanitizeRequestHeaders(headers) {
  const out = Object.create(null);
  const denyExact = new Set(['proxy-authorization', 'set-cookie']);
  const denyPrefixes = ['x-forwarded-', 'cf-'];
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = String(rawKey || '').toLowerCase();
    if (!key) continue;
    if (denyExact.has(key)) continue;
    if (denyPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    let value = '';
    if (Array.isArray(rawValue)) {
      value = rawValue.filter((entry) => entry !== undefined).map(String).join(', ');
    } else if (rawValue !== undefined) {
      value = String(rawValue);
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {string} sourcePath
 * @returns {string}
 */
export function routeIdFromSourcePath(sourcePath) {
  const normalized = String(sourcePath || '').replaceAll('\\', '/');
  const marker = '/pages/';
  const markerIndex = normalized.lastIndexOf(marker);
  let routeId = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized.split('/').pop() || normalized;
  routeId = routeId.replace(/\.zen$/i, '');
  if (routeId.endsWith('/index')) {
    routeId = routeId.slice(0, -('/index'.length));
  }
  return routeId || 'index';
}
