import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.MODULEPRELOAD_PLAYWRIGHT,
    '/tmp/zenith-playwright/node_modules/playwright'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next installed Playwright package.
    }
  }
  return require('playwright');
}

const { chromium, webkit } = loadPlaywright();

const bundlerBin = process.env.CARGO_BIN_EXE_zenith_bundler
  || process.env.ZENITH_BUNDLER_BIN
  || path.resolve(process.cwd(), 'target/debug/zenith-bundler');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function graphHash(hoistId) {
  return sha256(`id:${hoistId}\n`);
}

function page({ route, hoistId, html, router, prerender, vendor }) {
  const hoisted = { imports: [], declarations: [], functions: [], signals: [], state: [], code: [] };
  const imports = [];
  const importRecords = [];
  if (vendor) {
    hoisted.imports.push("import { ready } from 'preload-dep';");
    hoisted.code.push('void ready;');
    imports.push({ local: 'ready', spec: 'preload-dep', hoist_id: 'preload_dep', file_hash: 'preload_dep_hash' });
    importRecords.push({ specifier: 'preload-dep', raw_source: "import { ready } from 'preload-dep';" });
  }
  const ir = {
    ir_version: 1,
    graph_hash: graphHash(hoistId),
    graph_edges: [],
    graph_nodes: [{ id: `src/pages/${hoistId}.zen`, hoist_id: hoistId }],
    html,
    expressions: [],
    hoisted,
    components_scripts: {},
    component_instances: [],
    imports,
    import_records: importRecords,
    modules: [],
    signals: [],
    expression_bindings: [],
    marker_bindings: [],
    event_bindings: [],
    style_blocks: [],
    prerender
  };
  if (prerender) {
    ir.server_script = { source: 'export const data = { heading: "home" };', prerender: true };
  }
  return { route, file: `src/pages/${hoistId}.zen`, router, ir };
}

const documentHtml = (title) =>
  `<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>${title}</main></body></html>`;

function writeVendor(root) {
  writeFileSync(path.join(root, 'package.json'), '{"name":"modulepreload-browser","type":"module"}\n');
  const pkg = path.join(root, 'node_modules', 'preload-dep');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(path.join(pkg, 'package.json'), '{"name":"preload-dep","type":"module","main":"index.js"}\n');
  writeFileSync(path.join(pkg, 'index.js'), 'export { marker as ready } from "./shared.js";\nexport async function optionalFeature(){ return import("./lazy.js"); }\n');
  writeFileSync(path.join(pkg, 'shared.js'), 'export const marker = "shared-marker";\n');
  writeFileSync(path.join(pkg, 'lazy.js'), 'export default "lazy-marker";\n');
}

function build(root, payload, outDir) {
  const result = spawnSync(bundlerBin, ['--out-dir', outDir, '--base-path', '/app'], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`bundler failed\n${result.stderr}`);
  }
}

function readManifest(outDir) {
  return JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
}

function startServer(root, mode) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/app')) {
      response.writeHead(404);
      response.end('missing base');
      return;
    }
    let rel = decodeURIComponent(url.pathname.slice('/app'.length)).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    let file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403);
      response.end('escape');
      return;
    }
    const candidates = [file];
    if (mode === 'hosted') {
      candidates.push(`${file}.html`, path.join(file, 'index.html'));
    } else if (!path.extname(file)) {
      candidates.push(path.join(file, 'index.html'));
    }
    const match = candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!match) {
      response.writeHead(404);
      response.end('missing');
      return;
    }
    const body = readFileSync(match);
    const type = match.endsWith('.js')
      ? 'text/javascript'
      : match.endsWith('.css')
        ? 'text/css'
        : 'text/html';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function hintsAndEntry(html) {
  const hints = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const text = tag[0];
    if (!/\brel\s*=\s*["']modulepreload["']/i.test(text)) continue;
    const href = text.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) hints.push(href[1]);
  }
  const scripts = [];
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    const text = tag[0];
    if (!/\btype\s*=\s*["']module["']/i.test(text)) continue;
    const src = text.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) scripts.push(src[1]);
  }
  if (scripts.length !== 1) {
    throw new Error(`expected one module entry, found ${scripts.length}`);
  }
  return { hints, entry: scripts[0] };
}

async function checkPage(browserType, origin, pathname, label) {
  const browser = await browserType.launch();
  const page = await browser.newPage();
  const counts = new Map();
  const warnings = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/preload/i.test(text) && /not used|unused|credentials mode/i.test(text)) {
      warnings.push(text);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/app/assets/') || !url.pathname.endsWith('.js')) return;
    const key = url.pathname;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const response = await page.goto(`${origin}${pathname}`, { waitUntil: 'networkidle' });
  if (!response || !response.ok()) {
    throw new Error(`${label} navigation failed: ${response && response.status()}`);
  }
  await page.waitForTimeout(3500);
  const html = await response.text();
  const { hints, entry } = hintsAndEntry(html);
  const expected = new Set([...hints, entry]);
  const problems = [];
  for (const href of expected) {
    const count = counts.get(href) || 0;
    if (count !== 1) problems.push(`${href} downloaded ${count} times`);
  }
  for (const [href, count] of counts) {
    if (!expected.has(href)) problems.push(`unexpected download ${href} x${count}`);
    if (count !== 1) problems.push(`duplicate download ${href} x${count}`);
  }
  await browser.close();
  if (warnings.length || problems.length) {
    throw new Error(`${label}\nwarnings=${warnings.join(' | ')}\n${problems.join('\n')}\nhtml hints=${hints.join(',')}`);
  }
  return { hints: hints.length, entry };
}

const root = mkdtempSync(path.join(tmpdir(), 'zenith-modulepreload-browser-'));
try {
  if (!existsSync(bundlerBin)) {
    throw new Error(`bundler binary missing at ${bundlerBin}`);
  }
  writeVendor(root);
  const routerOut = path.join(root, 'router');
  const plainOut = path.join(root, 'plain');
  build(root, [
    page({ route: '/', hoistId: 'mod_home', html: documentHtml('Home'), router: true, prerender: true, vendor: false }),
    page({ route: '/about', hoistId: 'mod_about', html: documentHtml('About'), router: true, prerender: false, vendor: false }),
    page({ route: '/docs/guide/install', hoistId: 'mod_deep', html: documentHtml('Deep'), router: true, prerender: false, vendor: true })
  ], routerOut);
  build(root, [
    page({ route: '/', hoistId: 'mod_home', html: documentHtml('Home'), router: false, prerender: true, vendor: false }),
    page({ route: '/docs/guide/install', hoistId: 'mod_deep', html: documentHtml('Deep'), router: false, prerender: false, vendor: true })
  ], plainOut);

  const routerManifest = readManifest(routerOut);
  const plainManifest = readManifest(plainOut);
  const results = [];
  for (const mode of ['static', 'hosted']) {
    const routerServer = await startServer(routerOut, mode);
    const plainServer = await startServer(plainOut, mode);
    try {
      for (const engine of [
        ['chromium', chromium],
        ['webkit', webkit]
      ]) {
        const [name, browserType] = engine;
        results.push(await checkPage(browserType, routerServer.origin, '/app/', `${name} ${mode} router static-home`));
        results.push(await checkPage(browserType, routerServer.origin, '/app/about', `${name} ${mode} router hosted-about`));
        results.push(await checkPage(browserType, routerServer.origin, '/app/docs/guide/install', `${name} ${mode} router deep`));
        results.push(await checkPage(browserType, plainServer.origin, '/app/', `${name} ${mode} non-router static-home`));
        results.push(await checkPage(browserType, plainServer.origin, '/app/docs/guide/install/', `${name} ${mode} non-router deep`));
      }
    } finally {
      routerServer.server.close();
      plainServer.server.close();
    }
  }
  const homeHtml = readFileSync(path.join(routerOut, 'index.html'), 'utf8');
  if (homeHtml.includes(routerManifest.chunks['/about']) || homeHtml.includes(routerManifest.chunks['/docs/guide/install'])) {
    throw new Error('router home HTML preloads another route');
  }
  const plainHome = readFileSync(path.join(plainOut, 'index.html'), 'utf8');
  if (plainHome.includes(plainManifest.core)) {
    throw new Error('non-router home preloaded unused core');
  }
  console.log(JSON.stringify({ ok: true, checks: results.length, router: routerManifest.router, plainEntry: plainManifest.chunks['/'] }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
