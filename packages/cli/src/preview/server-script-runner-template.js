export const SERVER_SCRIPT_RUNNER = String.raw`
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
const routeKind = process.env.ZENITH_SERVER_ROUTE_KIND || 'page';
const guardOnly = process.env.ZENITH_SERVER_GUARD_ONLY === '1';
const globalMiddlewareSource = process.env.ZENITH_GLOBAL_MIDDLEWARE_SOURCE || '';
const globalMiddlewareSourcePath = process.env.ZENITH_GLOBAL_MIDDLEWARE_SOURCE_PATH || '';
const scopedServerData = JSON.parse(process.env.ZENITH_SCOPED_SERVER_DATA || '[]'), scopedServerModuleBaseDir = process.env.ZENITH_SCOPED_SERVER_MODULE_BASE_DIR || '', scopedServerModuleSources = JSON.parse(process.env.ZENITH_SCOPED_SERVER_MODULE_SOURCES || '[]');

if (!source.trim() && !(Array.isArray(scopedServerData) && scopedServerData.length > 0)) { process.stdout.write('null'); process.exit(0); }

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
function ctxInvalid(payload, status = 400) {
  return {
    kind: 'invalid',
    data: payload,
    status: Number.isInteger(status) ? status : 400
  };
}
function ctxData(payload) {
  return {
    kind: 'data',
    data: payload
  };
}
function ctxJson(payload, status = 200) {
  return {
    kind: 'json',
    data: payload,
    status: Number.isInteger(status) ? status : 200
  };
}
function ctxText(body, status = 200) {
  return {
    kind: 'text',
    body: typeof body === 'string' ? body : String(body ?? ''),
    status: Number.isInteger(status) ? status : 200
  };
}

async function readStdinBuffer() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const requestInit = {
  method: requestMethod,
  headers: new Headers(safeRequestHeaders)
};
const requestBodyBuffer =
  requestMethod !== 'GET' && requestMethod !== 'HEAD'
    ? await readStdinBuffer()
    : Buffer.alloc(0);
if (requestMethod !== 'GET' && requestMethod !== 'HEAD' && requestBodyBuffer.length > 0) {
  requestInit.body = requestBodyBuffer;
  requestInit.duplex = 'half';
}
const requestSnapshot = new Request(requestUrl, requestInit);
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
  action: null,
  allow: ctxAllow,
  redirect: ctxRedirect,
  deny: ctxDeny,
  invalid: ctxInvalid,
  data: ctxData,
  json: ctxJson,
  text: ctxText
};

const context = vm.createContext({
  params: routeParams,
  ctx: routeContext,
  fetch: globalThis.fetch,
  Blob: globalThis.Blob,
  File: globalThis.File,
  FormData: globalThis.FormData,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  Response: globalThis.Response,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
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
  const modulePromise = (async () => {
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

    await module.link((specifier, referencingModule) => {
      return linkModule(specifier, referencingModule.identifier);
    });
    return module;
  })();

  moduleCache.set(moduleUrl, modulePromise);
  try {
    return await modulePromise;
  } catch (error) {
    moduleCache.delete(moduleUrl);
    throw error;
  }
}

async function linkModule(specifier, parentIdentifier) {
  if (!isRelativeSpecifier(specifier)) {
    return createSyntheticModule(specifier);
  }
  const resolvedUrl = await resolveRelativeSpecifier(specifier, parentIdentifier);
  return loadFileModule(resolvedUrl);
}

function configuredFrameworkUrl(specifier) {
  if (specifier === 'zenith:server-contract') {
    const defaultPath = path.join(process.cwd(), 'node_modules', '@zenithbuild', 'cli', 'src', 'server-contract.js');
    const configuredPath = process.env.ZENITH_SERVER_CONTRACT_PATH || '';
    return {
      url: pathToFileURL(configuredPath || defaultPath).href,
      fallbackUrl: pathToFileURL(defaultPath).href,
      hasConfiguredPath: Boolean(configuredPath)
    };
  }
  if (specifier === 'zenith:route-auth') {
    const defaultPath = path.join(process.cwd(), 'node_modules', '@zenithbuild', 'cli', 'src', 'auth', 'route-auth.js');
    const configuredPath = process.env.ZENITH_SERVER_ROUTE_AUTH_PATH || '';
    return {
      url: pathToFileURL(configuredPath || defaultPath).href,
      fallbackUrl: pathToFileURL(defaultPath).href,
      hasConfiguredPath: Boolean(configuredPath)
    };
  }
  if (specifier === 'zenith:scoped-server-data-runtime') { const defaultPath = path.join(process.cwd(), 'node_modules', '@zenithbuild', 'cli', 'src', 'scoped-server-data', 'runtime.js'); const configuredPath = process.env.ZENITH_SCOPED_SERVER_RUNTIME_PATH || ''; return { url: pathToFileURL(configuredPath || defaultPath).href, fallbackUrl: pathToFileURL(defaultPath).href, hasConfiguredPath: Boolean(configuredPath) }; }
  return null;
}

async function linkEntryModule(specifier, referencingModule) {
  const frameworkUrl = configuredFrameworkUrl(specifier);
  if (frameworkUrl) {
    if (frameworkUrl.hasConfiguredPath) {
      return loadFileModule(frameworkUrl.url);
    }
    return loadFileModule(frameworkUrl.url).catch(() =>
      loadFileModule(frameworkUrl.fallbackUrl)
    );
  }
  return linkModule(specifier, referencingModule.identifier);
}

async function loadMatchedRoutePipeline() {
  const defaultPath = path.join(process.cwd(), 'node_modules', '@zenithbuild', 'cli', 'src', 'server-runtime', 'matched-route-pipeline.js');
  const configuredPath = process.env.ZENITH_SERVER_MATCHED_ROUTE_PIPELINE_PATH || '';
  const pipelineUrl = pathToFileURL(configuredPath || defaultPath).href;
  const module = await loadFileModule(pipelineUrl).catch((error) => {
    if (configuredPath) {
      throw error;
    }
    return loadFileModule(pathToFileURL(defaultPath).href);
  });
  await module.evaluate();
  if (typeof module.namespace.executeMatchedRoutePipeline !== 'function') {
    throw new Error('[zenith-preview] matched route pipeline unavailable');
  }
  return module.namespace.executeMatchedRoutePipeline;
}

async function loadGlobalMiddleware() {
  if (!globalMiddlewareSource.trim()) {
    return null;
  }
  const identifier = globalMiddlewareSourcePath
    ? pathToFileURL(globalMiddlewareSourcePath).href
    : 'zenith:global-middleware';
  const filename = globalMiddlewareSourcePath || 'global-middleware.ts';
  const code = await transpileIfNeeded(filename, globalMiddlewareSource);
  const module = new vm.SourceTextModule(code, {
    context,
    identifier,
    initializeImportMeta(meta) {
      meta.url = identifier;
    }
  });
  moduleCache.set(identifier, module);
  await module.link(linkEntryModule);
  await module.evaluate();
  const middlewareFn = module.namespace.default;
  if (typeof middlewareFn !== 'function') {
    throw new Error('[Zenith:Middleware] Global middleware module must default export a function.');
  }
  return middlewareFn;
}

async function loadScopedServerRuntime() { const module = await linkEntryModule('zenith:scoped-server-data-runtime', null); await module.evaluate(); if (typeof module.namespace.executeScopedServerData !== 'function' || typeof module.namespace.mergeScopedSsrPayload !== 'function') throw new Error('[zenith-preview] scoped server data runtime unavailable'); return module.namespace; }
async function loadScopedSourceModule(entry) { const modulePath = String(entry && entry.module || ''); const found = Array.isArray(scopedServerModuleSources) ? scopedServerModuleSources.find((item) => item && item.module === modulePath) : null; if (!found || typeof found.source !== 'string') throw new Error('[Zenith:ScopedServerData] Missing scoped server data source for "' + modulePath + '".'); const sourcePath = typeof found.sourcePath === 'string' && found.sourcePath.length > 0 ? found.sourcePath : modulePath; const identifier = sourcePath.startsWith('file:') ? sourcePath : pathToFileURL(sourcePath).href; const filename = sourcePath.toLowerCase().endsWith('.zen') ? sourcePath.replace(/\.zen$/i, '.ts') : sourcePath; const code = await transpileIfNeeded(filename, found.source); const module = new vm.SourceTextModule(code, { context, identifier, initializeImportMeta(meta) { meta.url = identifier; } }); moduleCache.set(identifier, module); await module.link(linkEntryModule); await module.evaluate(); return module.namespace; }
function invalidScopedModulePath() { throw new Error('[Zenith:ScopedServerData] Invalid scoped server data module path.'); }
function resolveScopedPackagedModulePath(entry) { const modulePath = String(entry && entry.module || ''); if (!modulePath || path.isAbsolute(modulePath) || /^[A-Za-z]:[\\/]/.test(modulePath)) invalidScopedModulePath(); const normalized = modulePath.replace(/\\/g, '/'); if (!normalized.startsWith('scoped/') || normalized.split('/').some((part) => part === '..' || part === '.')) invalidScopedModulePath(); const scopedRoot = path.resolve(scopedServerModuleBaseDir, 'scoped'); const candidate = path.resolve(scopedServerModuleBaseDir, normalized); if (candidate !== scopedRoot && !candidate.startsWith(scopedRoot + path.sep)) invalidScopedModulePath(); return candidate; }
async function loadScopedPackagedModule(entry) { if (!scopedServerModuleBaseDir) throw new Error('[Zenith:ScopedServerData] Cannot execute scoped server data without a server module root.'); const module = await loadFileModule(pathToFileURL(resolveScopedPackagedModulePath(entry)).href); await module.evaluate(); return module.namespace; }
async function executeScopedServerDataAfterRoute(resolved) { if (guardOnly || routeKind === 'resource' || !Array.isArray(scopedServerData) || scopedServerData.length === 0 || !resolved || !resolved.result || resolved.result.kind !== 'data') return resolved; const runtime = await loadScopedServerRuntime(); const scoped = await runtime.executeScopedServerData({ route: { route_kind: routeKind, prerender: false, has_scoped_server_data: true, scoped_server_data: scopedServerData }, ctx: context.ctx, loadModule: (entry) => Array.isArray(scopedServerModuleSources) && scopedServerModuleSources.length > 0 ? loadScopedSourceModule(entry) : loadScopedPackagedModule(entry) }); return { ...resolved, result: { ...resolved.result, data: runtime.mergeScopedSsrPayload(resolved.result.data, scoped) } }; }

const allowed = new Set(['data', 'load', 'guard', 'action', 'ssr_data', 'props', 'ssr', 'prerender', 'exportPaths']);
const prelude = "const params = globalThis.params;\n" +
  "const ctx = globalThis.ctx;\n" +
  "import { download, resolveRouteResult } from 'zenith:server-contract';\n" +
  "import { attachRouteAuth } from 'zenith:route-auth';\n" +
  "ctx.download = download;\n" +
  "globalThis.resolveRouteResult = resolveRouteResult;\n" +
  "globalThis.attachRouteAuth = attachRouteAuth;\n";
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
  return linkEntryModule(specifier, referencingModule);
});
await entryModule.evaluate();
context.attachRouteAuth(routeContext, {
  requestUrl: routeContext.url,
  guardOnly,
  redirect: ctxRedirect,
  deny: ctxDeny
});

const namespaceKeys = Object.keys(entryModule.namespace);
for (const key of namespaceKeys) {
  if (!allowed.has(key)) {
    throw new Error('[zenith-preview] unsupported server export "' + key + '"');
  }
}

const exported = entryModule.namespace;
try {
  const executeMatchedRoutePipeline = await loadMatchedRoutePipeline();
  const globalMiddleware = await loadGlobalMiddleware();
  let resolved = await executeMatchedRoutePipeline({
    exports: exported,
    ctx: context.ctx,
    filePath: sourcePath || 'server_script',
    guardOnly: guardOnly,
    routeKind: routeKind,
    globalMiddleware
  });
  resolved = await executeScopedServerDataAfterRoute(resolved);

  process.stdout.write(JSON.stringify(resolved || null));
} catch (error) {
  const message = error instanceof Error
    ? (typeof error.stack === 'string' && error.stack.length > 0 ? error.stack : error.message)
    : String(error);
  process.stderr.write('[Zenith:Server] preview route execution failed\\n' + message + '\\n');
  process.stdout.write(
    JSON.stringify({
      __zenith_error: {
        status: 500,
        code: 'LOAD_FAILED'
      }
    })
  );
}
`;
