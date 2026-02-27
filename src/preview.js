// ---------------------------------------------------------------------------
// preview.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Preview server with manifest-driven route resolution.
//
// - Serves /dist assets directly.
// - Resolves static and dynamic page routes via router-manifest.json.
// - Executes non-prerender <script server> blocks per request and injects
//   serialized SSR payload via an inline script (`window.__zenith_ssr_data`).
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareRouteSpecificity,
  matchRoute as matchManifestRoute,
  resolveRequestRoute
} from './server/resolve-request-route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const SERVER_SCRIPT_RUNNER = String.raw`
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const source = process.env.ZENITH_SERVER_SOURCE || '';
const sourcePath = process.env.ZENITH_SERVER_SOURCE_PATH || '';
const params = JSON.parse(process.env.ZENITH_SERVER_PARAMS || '{}');
const requestUrl = process.env.ZENITH_SERVER_REQUEST_URL || 'http://localhost/';
const requestMethod = String(process.env.ZENITH_SERVER_REQUEST_METHOD || 'GET').toUpperCase();
const requestHeaders = JSON.parse(process.env.ZENITH_SERVER_REQUEST_HEADERS || '{}');
const routePattern = process.env.ZENITH_SERVER_ROUTE_PATTERN || '';
const routeFile = process.env.ZENITH_SERVER_ROUTE_FILE || sourcePath || '';
const routeId = process.env.ZENITH_SERVER_ROUTE_ID || routePattern || '';

if (!source.trim()) {
  process.stdout.write('null');
  process.exit(0);
}

let cachedTypeScript = undefined;
async function loadTypeScript() {
  if (cachedTypeScript !== undefined) {
    return cachedTypeScript;
  }
  try {
    const mod = await import('typescript');
    cachedTypeScript = mod.default || mod;
  } catch {
    cachedTypeScript = null;
  }
  return cachedTypeScript;
}

async function transpileIfNeeded(filename, code) {
  const lower = String(filename || '').toLowerCase();
  const isTs =
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts');
  if (!isTs) {
    return code;
  }
  const ts = await loadTypeScript();
  if (!ts || typeof ts.transpileModule !== 'function') {
    throw new Error('[zenith-preview] TypeScript is required to execute server modules that import .ts files');
  }
  const output = ts.transpileModule(code, {
    fileName: filename || 'server-script.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext
    },
    reportDiagnostics: false
  });
  return output.outputText;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeSpecifier(specifier, parentIdentifier) {
  let basePath = sourcePath;
  if (parentIdentifier && parentIdentifier.startsWith('file:')) {
    basePath = fileURLToPath(parentIdentifier);
  }

  const baseDir = basePath ? path.dirname(basePath) : process.cwd();
  const candidateBase = specifier.startsWith('file:')
    ? fileURLToPath(specifier)
    : path.resolve(baseDir, specifier);

  const candidates = [];
  if (path.extname(candidateBase)) {
    candidates.push(candidateBase);
  } else {
    candidates.push(candidateBase);
    candidates.push(candidateBase + '.ts');
    candidates.push(candidateBase + '.tsx');
    candidates.push(candidateBase + '.mts');
    candidates.push(candidateBase + '.cts');
    candidates.push(candidateBase + '.js');
    candidates.push(candidateBase + '.mjs');
    candidates.push(candidateBase + '.cjs');
    candidates.push(path.join(candidateBase, 'index.ts'));
    candidates.push(path.join(candidateBase, 'index.tsx'));
    candidates.push(path.join(candidateBase, 'index.mts'));
    candidates.push(path.join(candidateBase, 'index.cts'));
    candidates.push(path.join(candidateBase, 'index.js'));
    candidates.push(path.join(candidateBase, 'index.mjs'));
    candidates.push(path.join(candidateBase, 'index.cjs'));
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  throw new Error(
    '[zenith-preview] Cannot resolve server import "' + specifier + '" from "' + (basePath || '<inline>') + '"'
  );
}

function isRelativeSpecifier(specifier) {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:')
  );
}

const safeRequestHeaders =
  requestHeaders && typeof requestHeaders === 'object'
    ? { ...requestHeaders }
    : {};
function parseCookies(rawCookieHeader) {
  const out = Object.create(null);
  const raw = String(rawCookieHeader || '');
  if (!raw) return out;
  const pairs = raw.split(';');
  for (let i = 0; i < pairs.length; i++) {
    const part = pairs[i];
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    const value = part.slice(eq + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
const cookieHeader = typeof safeRequestHeaders.cookie === 'string'
  ? safeRequestHeaders.cookie
  : '';
const requestCookies = parseCookies(cookieHeader);

function ctxAllow() {
  return { kind: 'allow' };
}
function ctxRedirect(location, status = 302) {
  return {
    kind: 'redirect',
    location: String(location || ''),
    status: Number.isInteger(status) ? status : 302
  };
}
function ctxDeny(status = 403, message = undefined) {
  return {
    kind: 'deny',
    status: Number.isInteger(status) ? status : 403,
    message: typeof message === 'string' ? message : undefined
  };
}
function ctxData(payload) {
  return {
    kind: 'data',
    data: payload
  };
}

const requestSnapshot = new Request(requestUrl, {
  method: requestMethod,
  headers: new Headers(safeRequestHeaders)
});
const routeParams = { ...params };
const routeMeta = {
  id: routeId,
  pattern: routePattern,
  file: routeFile ? path.relative(process.cwd(), routeFile) : ''
};
const routeContext = {
  params: routeParams,
  url: new URL(requestUrl),
  headers: { ...safeRequestHeaders },
  cookies: requestCookies,
  request: requestSnapshot,
  method: requestMethod,
  route: routeMeta,
  env: {},
  auth: {
    async getSession(_ctx) {
      return null;
    },
    async requireSession(_ctx) {
      throw ctxRedirect('/login', 302);
    }
  },
  allow: ctxAllow,
  redirect: ctxRedirect,
  deny: ctxDeny,
  data: ctxData
};

const context = vm.createContext({
  params: routeParams,
  ctx: routeContext,
  fetch: globalThis.fetch,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
  URL,
  URLSearchParams,
  Buffer,
  console,
  process,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
});

const moduleCache = new Map();
const syntheticModuleCache = new Map();

async function createSyntheticModule(specifier) {
  if (syntheticModuleCache.has(specifier)) {
    return syntheticModuleCache.get(specifier);
  }

  const ns = await import(specifier);
  const exportNames = Object.keys(ns);
  const module = new vm.SyntheticModule(
    exportNames,
    function() {
      for (const key of exportNames) {
        this.setExport(key, ns[key]);
      }
    },
    { context }
  );
  await module.link(() => {
    throw new Error(
      '[zenith-preview] synthetic modules cannot contain nested imports: ' + specifier
    );
  });
  syntheticModuleCache.set(specifier, module);
  return module;
}

async function loadFileModule(moduleUrl) {
  if (moduleCache.has(moduleUrl)) {
    return moduleCache.get(moduleUrl);
  }

  const filename = fileURLToPath(moduleUrl);
  let code = await fs.readFile(filename, 'utf8');
  code = await transpileIfNeeded(filename, code);
  const module = new vm.SourceTextModule(code, {
    context,
    identifier: moduleUrl,
    initializeImportMeta(meta) {
      meta.url = moduleUrl;
    }
  });

  moduleCache.set(moduleUrl, module);
  await module.link((specifier, referencingModule) => {
    return linkModule(specifier, referencingModule.identifier);
  });
  return module;
}

async function linkModule(specifier, parentIdentifier) {
  if (!isRelativeSpecifier(specifier)) {
    return createSyntheticModule(specifier);
  }
  const resolvedUrl = await resolveRelativeSpecifier(specifier, parentIdentifier);
  return loadFileModule(resolvedUrl);
}

const allowed = new Set(['data', 'load', 'guard', 'ssr_data', 'props', 'ssr', 'prerender']);
const prelude = "const params = globalThis.params;\n" +
  "const ctx = globalThis.ctx;\n" +
  "import { resolveRouteResult } from 'zenith:server-contract';\n" +
  "globalThis.resolveRouteResult = resolveRouteResult;\n";
const entryIdentifier = sourcePath
  ? pathToFileURL(sourcePath).href
  : 'zenith:server-script';
const entryTranspileFilename = sourcePath && sourcePath.toLowerCase().endsWith('.zen')
  ? sourcePath.replace(/\.zen$/i, '.ts')
  : (sourcePath || 'server-script.ts');

const entryCode = await transpileIfNeeded(entryTranspileFilename, prelude + source);
const entryModule = new vm.SourceTextModule(entryCode, {
  context,
  identifier: entryIdentifier,
  initializeImportMeta(meta) {
    meta.url = entryIdentifier;
  }
});

moduleCache.set(entryIdentifier, entryModule);
await entryModule.link((specifier, referencingModule) => {
  if (specifier === 'zenith:server-contract') {
    const defaultPath = path.join(process.cwd(), 'node_modules', '@zenithbuild', 'cli', 'src', 'server-contract.js');
    const contractUrl = pathToFileURL(process.env.ZENITH_SERVER_CONTRACT_PATH || defaultPath).href;
    return loadFileModule(contractUrl).catch(() => 
      loadFileModule(pathToFileURL(defaultPath).href)
    );
  }
  return linkModule(specifier, referencingModule.identifier);
});
await entryModule.evaluate();

const namespaceKeys = Object.keys(entryModule.namespace);
for (const key of namespaceKeys) {
  if (!allowed.has(key)) {
    throw new Error('[zenith-preview] unsupported server export "' + key + '"');
  }
}

const exported = entryModule.namespace;
try {
  const resolved = await context.resolveRouteResult({
    exports: exported,
    ctx: context.ctx,
    filePath: sourcePath || 'server_script'
  });

  process.stdout.write(JSON.stringify(resolved || null));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    JSON.stringify({
      __zenith_error: {
        status: 500,
        code: 'LOAD_FAILED',
        message
      }
    })
  );
}
`;

/**
 * Create and start a preview server.
 *
 * @param {{ distDir: string, port?: number }} options
 * @returns {Promise<{ server: import('http').Server, port: number, close: () => void }>}
 */
export async function createPreviewServer(options) {
  const { distDir, port = 4000 } = options;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    try {
      if (url.pathname === '/__zenith/route-check') {
        const targetPath = String(url.searchParams.get('path') || '/');
        const targetUrl = new URL(targetPath, `http://localhost:${port}`);
        const routes = await loadRouteManifest(distDir);
        const resolvedCheck = resolveRequestRoute(targetUrl, routes);
        if (!resolvedCheck.matched || !resolvedCheck.route) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'route_not_found' }));
          return;
        }

        const checkResult = await executeServerRoute({
          source: resolvedCheck.route.server_script || '',
          sourcePath: resolvedCheck.route.server_script_path || '',
          params: resolvedCheck.params,
          requestUrl: targetUrl.toString(),
          requestMethod: req.method || 'GET',
          requestHeaders: req.headers,
          routePattern: resolvedCheck.route.path,
          routeFile: resolvedCheck.route.server_script_path || '',
          routeId: resolvedCheck.route.route_id || routeIdFromSourcePath(resolvedCheck.route.server_script_path || '')
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checkResult));
        return;
      }

      if (extname(url.pathname) && extname(url.pathname) !== '.html') {
        const staticPath = resolveWithinDist(distDir, url.pathname);
        if (!staticPath || !(await fileExists(staticPath))) {
          throw new Error('not found');
        }
        const content = await readFile(staticPath);
        const mime = MIME_TYPES[extname(staticPath)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(content);
        return;
      }

      const routes = await loadRouteManifest(distDir);
      const resolved = resolveRequestRoute(url, routes);
      let htmlPath = null;

      if (resolved.matched && resolved.route) {
        console.log(`[zenith] Request: ${url.pathname} | Route: ${resolved.route.path} | Params: ${JSON.stringify(resolved.params)}`);
        const output = resolved.route.output.startsWith('/')
          ? resolved.route.output.slice(1)
          : resolved.route.output;
        htmlPath = resolveWithinDist(distDir, output);
      } else {
        htmlPath = toStaticFilePath(distDir, url.pathname);
      }

      if (!htmlPath || !(await fileExists(htmlPath))) {
        throw new Error('not found');
      }

      let ssrPayload = null;
      if (resolved.matched && resolved.route?.server_script && resolved.route.prerender !== true) {
        let routeExecution = null;
        try {
          routeExecution = await executeServerRoute({
            source: resolved.route.server_script,
            sourcePath: resolved.route.server_script_path || '',
            params: resolved.params,
            requestUrl: url.toString(),
            requestMethod: req.method || 'GET',
            requestHeaders: req.headers,
            routePattern: resolved.route.path,
            routeFile: resolved.route.server_script_path || '',
            routeId: resolved.route.route_id || routeIdFromSourcePath(resolved.route.server_script_path || '')
          });
        } catch (error) {
          routeExecution = {
            result: {
              kind: 'deny',
              status: 500,
              message: error instanceof Error ? error.message : String(error)
            },
            trace: {
              guard: 'none',
              load: 'deny'
            }
          };
        }

        const trace = routeExecution?.trace || { guard: 'none', load: 'none' };
        const routeId = resolved.route.route_id || routeIdFromSourcePath(resolved.route.server_script_path || '');
        console.log(`[Zenith] guard(${routeId}) -> ${trace.guard}`);
        console.log(`[Zenith] load(${routeId}) -> ${trace.load}`);

        const result = routeExecution?.result;
        if (result && result.kind === 'redirect') {
          const status = Number.isInteger(result.status) ? result.status : 302;
          res.writeHead(status, {
            Location: result.location,
            'Cache-Control': 'no-store'
          });
          res.end('');
          return;
        }
        if (result && result.kind === 'deny') {
          const status = Number.isInteger(result.status) ? result.status : 403;
          res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(result.message || (status === 401 ? 'Unauthorized' : 'Forbidden'));
          return;
        }
        if (result && result.kind === 'data' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
          ssrPayload = result.data;
        }
      }

      let html = await readFile(htmlPath, 'utf8');
      if (ssrPayload) {
        html = injectSsrPayload(html, ssrPayload);
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  });

  return new Promise((resolveServer) => {
    server.listen(port, () => {
      const actualPort = server.address().port;
      resolveServer({
        server,
        port: actualPort,
        close: () => {
          server.close();
        }
      });
    });
  });
}

/**
 * @typedef {{
 *   path: string;
 *   output: string;
 *   server_script?: string | null;
 *   server_script_path?: string | null;
 *   prerender?: boolean;
 *   route_id?: string;
 *   pattern?: string;
 *   params_shape?: Record<string, string>;
 *   has_guard?: boolean;
 *   has_load?: boolean;
 *   guard_module_ref?: string | null;
 *   load_module_ref?: string | null;
 * }} PreviewRoute
 */

/**
 * @param {string} distDir
 * @returns {Promise<PreviewRoute[]>}
 */
export async function loadRouteManifest(distDir) {
  const manifestPath = join(distDir, 'assets', 'router-manifest.json');
  try {
    const source = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(source);
    const routes = Array.isArray(parsed?.routes) ? parsed.routes : [];
    return routes
      .filter((entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.path === 'string' &&
        typeof entry.output === 'string'
      )
      .sort((a, b) => compareRouteSpecificity(a.path, b.path));
  } catch {
    return [];
  }
}

export const matchRoute = matchManifestRoute;

/**
 * @param {{ source: string, sourcePath: string, params: Record<string, string>, requestUrl?: string, requestMethod?: string, requestHeaders?: Record<string, string | string[] | undefined>, routePattern?: string, routeFile?: string, routeId?: string }} input
 * @returns {Promise<{ result: { kind: string, [key: string]: unknown }, trace: { guard: string, load: string } }>}
 */
export async function executeServerRoute(input) {
  if (!input.source || !String(input.source).trim()) {
    return {
      result: { kind: 'data', data: {} },
      trace: { guard: 'none', load: 'none' }
    };
  }

  const payload = await spawnNodeServerRunner({
    source: input.source,
    sourcePath: input.sourcePath,
    params: input.params,
    requestUrl: input.requestUrl || 'http://localhost/',
    requestMethod: input.requestMethod || 'GET',
    requestHeaders: sanitizeRequestHeaders(input.requestHeaders || {}),
    routePattern: input.routePattern || '',
    routeFile: input.routeFile || input.sourcePath || '',
    routeId: input.routeId || routeIdFromSourcePath(input.sourcePath || '')
  });

  if (payload === null || payload === undefined) {
    return {
      result: { kind: 'data', data: {} },
      trace: { guard: 'none', load: 'none' }
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
        message: String(errorEnvelope.message || 'Server route execution failed')
      },
      trace: { guard: 'none', load: 'deny' }
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
          load: String(trace.load || 'none')
        }
        : { guard: 'none', load: 'none' }
    };
  }

  return {
    result: {
      kind: 'data',
      data: payload
    },
    trace: { guard: 'none', load: 'data' }
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
    return {
      __zenith_error: {
        status: Number.isInteger(result.status) ? result.status : 403,
        code: 'ACCESS_DENIED',
        message: String(result.message || 'Access denied')
      }
    };
  }

  return {};
}

/**
 * @param {{ source: string, sourcePath: string, params: Record<string, string>, requestUrl: string, requestMethod: string, requestHeaders: Record<string, string>, routePattern: string, routeFile: string, routeId: string }} input
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
          ZENITH_SERVER_CONTRACT_PATH: join(__dirname, 'server-contract.js')
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

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
            `[zenith-preview] invalid server payload JSON: ${error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
}

/**
 * @param {string} html
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function injectSsrPayload(html, payload) {
  const serialized = serializeInlineScriptJson(payload);
  const scriptTag = `<script id="zenith-ssr-data">window.__zenith_ssr_data = ${serialized};</script>`;
  const existingTagRe = /<script\b[^>]*\bid=(["'])zenith-ssr-data\1[^>]*>[\s\S]*?<\/script>/i;
  if (existingTagRe.test(html)) {
    return html.replace(existingTagRe, scriptTag);
  }

  const headClose = html.match(/<\/head>/i);
  if (headClose) {
    return html.replace(/<\/head>/i, `${scriptTag}</head>`);
  }

  const bodyOpen = html.match(/<body\b[^>]*>/i);
  if (bodyOpen) {
    return html.replace(bodyOpen[0], `${bodyOpen[0]}${scriptTag}`);
  }

  return `${scriptTag}${html}`;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function serializeInlineScriptJson(payload) {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function toStaticFilePath(distDir, pathname) {
  let resolved = pathname;
  if (resolved === '/') {
    resolved = '/index.html';
  } else if (!extname(resolved)) {
    resolved += '/index.html';
  }
  return resolveWithinDist(distDir, resolved);
}

export function resolveWithinDist(distDir, requestPath) {
  let decoded = requestPath;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const normalized = normalize(decoded).replace(/\\/g, '/');
  const relative = normalized.replace(/^\/+/, '');
  const root = resolve(distDir);
  const candidate = resolve(root, relative);
  if (candidate === root || candidate.startsWith(`${root}${sep}`)) {
    return candidate;
  }
  return null;
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
function routeIdFromSourcePath(sourcePath) {
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

async function fileExists(fullPath) {
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}
