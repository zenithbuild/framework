import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(90000);

const NODE_CONFIG = 'module.exports = { target: "node", router: true };\n';

async function makeProject(files) {
  const root = join(tmpdir(), `zenith-global-middleware-dev-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, source, 'utf8');
  }
  return { root, pagesDir: join(root, 'pages'), outDir: join(root, 'dist'), devOutDir: join(root, 'dev-dist') };
}

async function startProject(project, config = { target: 'node', router: true }) {
  await build({ pagesDir: project.pagesDir, outDir: project.outDir, config });
  const dev = await createDevServer({
    pagesDir: project.pagesDir,
    outDir: project.devOutDir,
    projectRoot: project.root,
    port: 0,
    config
  });
  const preview = await createPreviewServer({
    distDir: join(project.outDir, 'static'),
    projectRoot: project.root,
    port: 0,
    config
  });
  return {
    dev,
    preview,
    devOrigin: `http://127.0.0.1:${dev.port}`,
    previewOrigin: `http://127.0.0.1:${preview.port}`
  };
}

function payloadFromHtml(html) {
  const match = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
  expect(match).toBeTruthy();
  return JSON.parse(String(match[1]));
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

async function text(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', ...options });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function json(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', ...options });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function writeDistManifestSource(project, sourceFile) {
  const manifestPath = join(project.outDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.global_middleware = { source_file: sourceFile };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

describe('global middleware Gate 3B dev/preview runtime', () => {
  const previousSecret = process.env.ZENITH_SESSION_SECRET;
  let project = null;
  let dev = null;
  let preview = null;

  afterEach(async () => {
    if (dev) {
      dev.close();
      dev = null;
    }
    if (preview) {
      preview.close();
      preview = null;
    }
    if (previousSecret === undefined) delete process.env.ZENITH_SESSION_SECRET;
    else process.env.ZENITH_SESSION_SECRET = previousSecret;
    if (project) {
      await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      project = null;
    }
  });

  test('dev and preview run next() middleware before page/resource route stages and reload helper edits', async () => {
    project = await makeProject({
      'pages/index.zen': [
        '<script server lang="ts">',
        'export function guard(ctx) { ctx.env.order.push("guard"); return ctx.allow(); }',
        'export function load(ctx) { ctx.env.order.push("load"); return ctx.data({ helper: ctx.env.helper, order: ctx.env.order }); }',
        '</script>',
        '<main>Home</main>'
      ].join('\n'),
      'pages/api/ping.resource.ts': 'export function load(ctx) { return ctx.json({ helper: ctx.env.helper, order: ctx.env.order }); }\n',
      'middleware-helper.ts': 'export function mark(ctx) { ctx.env.helper = "one"; }\n',
      'middleware.ts': [
        'import { mark } from "./middleware-helper.ts";',
        'export default async function middleware(ctx, next) { ctx.env.order = ["middleware"]; mark(ctx); return next(); }'
      ].join('\n'),
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    const origins = [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`];

    for (const origin of origins) {
      expect(payloadFromHtml((await text(origin, '/')).body)).toEqual({ helper: 'one', order: ['middleware', 'guard', 'load'] });
      expect((await json(origin, '/api/ping')).body).toEqual({ helper: 'one', order: ['middleware'] });
    }
    await writeFile(join(project.root, 'middleware-helper.ts'), 'export function mark(ctx) { ctx.env.helper = "two"; }\n', 'utf8');
    for (const origin of origins) {
      expect(payloadFromHtml((await text(origin, '/')).body)).toEqual({ helper: 'two', order: ['middleware', 'guard', 'load'] });
    }
  });

  test('dev and preview support redirect, deny, auth control flow, and auth cookies', async () => {
    process.env.ZENITH_SESSION_SECRET = 'zenith-gate-3b-secret';
    project = await makeProject({
      'pages/redirect.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ bad: true }); }</script><main></main>\n',
      'pages/deny.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ bad: true }); }</script><main></main>\n',
      'pages/account.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'pages/login.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'pages/logout.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'pages/api/private.resource.ts': 'export function load(ctx) { return ctx.json({ ok: true }); }\n',
      'middleware.ts': [
        'export default async function middleware(ctx, next) {',
        '  if (ctx.url.pathname === "/redirect") return ctx.redirect("/login", 307);',
        '  if (ctx.url.pathname === "/deny") return ctx.deny(401, "blocked");',
        '  if (ctx.url.pathname === "/account") await ctx.auth.requireSession({ redirectTo: "/login", status: 302 });',
        '  if (ctx.url.pathname === "/api/private") await ctx.auth.requireSession({ deny: 401, message: "Sign in required" });',
        '  if (ctx.url.pathname === "/login") { await ctx.auth.signIn({ userId: "u1" }); return ctx.redirect("/dashboard"); }',
        '  if (ctx.url.pathname === "/logout") { await ctx.auth.signOut(); return ctx.redirect("/login"); }',
        '  return next();',
        '}'
      ].join('\n'),
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));

    for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
      expect(await text(origin, '/redirect')).toMatchObject({ status: 307 });
      expect((await text(origin, '/redirect')).headers.get('location')).toBe('/login');
      expect(await text(origin, '/deny')).toMatchObject({ status: 401, body: 'blocked' });
      expect((await text(origin, '/account')).headers.get('location')).toBe('/login');
      expect(await text(origin, '/api/private')).toMatchObject({ status: 401, body: 'Sign in required' });
      const login = await text(origin, '/login');
      expect(login.status).toBe(302);
      expect(setCookies(login.headers).join('\n')).toContain('zenith_session=');
      const logout = await text(origin, '/logout');
      expect(logout.status).toBe(302);
      expect(setCookies(logout.headers).join('\n')).toContain('Max-Age=0');
    }
  });

  test('dev and preview exclude route-check, static assets, and 404s from middleware execution', async () => {
    const marker = join(tmpdir(), `zenith-gate3b-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function guard(ctx) { return ctx.allow(); } export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'middleware.ts': [
        'import { appendFileSync } from "node:fs";',
        'export default async function middleware(ctx, next) {',
        `  appendFileSync(${JSON.stringify(marker)}, "x");`,
        '  return next();',
        '}'
      ].join('\n'),
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    await writeFile(join(project.outDir, 'static', 'probe.txt'), 'asset', 'utf8');
    await mkdir(project.devOutDir, { recursive: true });
    await writeFile(join(project.devOutDir, 'probe.txt'), 'asset', 'utf8');

    for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
      expect((await text(origin, '/__zenith/route-check?path=%2F', { headers: { 'x-zenith-route-check': '1' } })).status).toBe(200);
      expect(existsSync(marker)).toBe(false);
      expect(await text(origin, '/probe.txt')).toMatchObject({ status: 200, body: 'asset' });
      expect(existsSync(marker)).toBe(false);
      expect((await text(origin, '/missing')).status).toBe(404);
      expect(existsSync(marker)).toBe(false);
      expect((await text(origin, '/')).status).toBe(200);
      expect(existsSync(marker)).toBe(true);
      await rm(marker, { force: true });
    }
  });

  test('dev and preview middleware errors return 500 without leaking staged cookies', async () => {
    process.env.ZENITH_SESSION_SECRET = 'zenith-gate-3b-invalid-secret';
    project = await makeProject({
      'pages/broken.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'middleware.ts': [
        'export default async function middleware(ctx, next) {',
        '  void next;',
        '  await ctx.auth.signIn({ userId: "u1" });',
        '  return ctx.data({ unsupported: true });',
        '}'
      ].join('\n'),
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
        const response = await text(origin, '/broken');
        expect(response).toMatchObject({ status: 500, body: 'Internal Server Error' });
        expect(setCookies(response.headers)).toHaveLength(0);
      }
    } finally {
      spy.mockRestore();
    }
  });

  test('dev and preview validate changed source before VM evaluation and keep middleware.js ignored', async () => {
    const marker = join(tmpdir(), `zenith-gate3b-validation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true, marker: ctx.env.marker || "none" }); }</script><main></main>\n',
      'middleware.js': 'export default async function middleware(ctx, next) { ctx.env.marker = "js"; return next(); }\n',
      'middleware.ts': 'export default async function middleware(ctx, next) { return next(); }\n',
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
      expect(payloadFromHtml((await text(origin, '/')).body)).toEqual({ ok: true, marker: 'none' });
    }

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await writeFile(join(project.root, 'middleware.ts'), 'export default {};\n', 'utf8');
      for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
        expect(await text(origin, '/')).toMatchObject({ status: 500, body: 'Internal Server Error' });
      }
      await writeFile(join(project.root, 'middleware.ts'), [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${JSON.stringify(marker)}, "executed");`,
        'export const runtime = true;',
        'export default async function middleware(ctx, next) { return next(); }'
      ].join('\n'), 'utf8');
      for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
        expect(await text(origin, '/')).toMatchObject({ status: 500, body: 'Internal Server Error' });
        expect(existsSync(marker)).toBe(false);
      }
    } finally {
      spy.mockRestore();
      await rm(marker, { force: true });
    }
  });

  test('dev and preview ignore middleware.js when no TypeScript middleware exists', async () => {
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ marker: ctx.env.marker || "none" }); }</script><main></main>\n',
      'middleware.js': 'export default async function middleware(ctx, next) { ctx.env.marker = "js"; return next(); }\n',
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
      expect(payloadFromHtml((await text(origin, '/')).body)).toEqual({ marker: 'none' });
    }
  });

  test('dev and preview fail unsupported middleware import forms with 500', async () => {
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'middleware.ts': 'export default async function middleware(ctx, next) { return next(); }\n',
      'helper.ts': 'export const value = "ok";\n',
      'data.json': '{"value":"json"}\n',
      'style.css': 'body { color: red; }\n',
      'zenith.config.js': NODE_CONFIG
    });
    ({ dev, preview } = await startProject(project));
    const cases = [
      'import data from "./data.json"; export default async function middleware(ctx, next) { void data; return next(); }',
      'export default async function middleware(ctx, next) { await import("./helper.ts"); return next(); }',
      'import "./style.css"; export default async function middleware(ctx, next) { return next(); }'
    ];
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const source of cases) {
        await writeFile(join(project.root, 'middleware.ts'), source, 'utf8');
        for (const origin of [`http://127.0.0.1:${dev.port}`, `http://127.0.0.1:${preview.port}`]) {
          expect(await text(origin, '/')).toMatchObject({ status: 500, body: 'Internal Server Error' });
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  test('preview rejects unsafe or unreadable source_file metadata and accepts valid project-local source', async () => {
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: ctx.env.ok || false }); }</script><main></main>\n',
      'middleware.ts': 'export default async function middleware(ctx, next) { ctx.env.ok = true; return next(); }\n',
      'zenith.config.js': NODE_CONFIG
    });
    await build({ pagesDir: project.pagesDir, outDir: project.outDir, config: { target: 'node', router: true } });
    preview = await createPreviewServer({ distDir: join(project.outDir, 'static'), projectRoot: project.root, port: 0, config: { target: 'node', router: true } });
    const origin = `http://127.0.0.1:${preview.port}`;
    expect(payloadFromHtml((await text(origin, '/')).body)).toEqual({ ok: true });

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const sourceFile of ['../outside/middleware.ts', join(tmpdir(), 'outside-middleware.ts')]) {
        await writeDistManifestSource(project, sourceFile);
        const response = await text(origin, '/');
        expect(response).toMatchObject({ status: 500, body: 'Internal Server Error' });
      }
      await writeDistManifestSource(project, 'missing/middleware.ts');
      expect(await text(origin, '/')).toMatchObject({ status: 500, body: 'Internal Server Error' });
      const logs = spy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logs).toContain('[Zenith:Middleware] Invalid global middleware source_file in manifest.');
      expect(logs).toContain('[Zenith:Middleware] Cannot read global middleware source file "missing/middleware.ts".');
    } finally {
      spy.mockRestore();
    }
  });

  test('dev static-family target does not bypass Gate 1 middleware rejection', async () => {
    const marker = join(tmpdir(), `zenith-gate3b-static-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    project = await makeProject({
      'pages/index.zen': '<script server lang="ts">export function load(ctx) { return ctx.data({ ok: true }); }</script><main></main>\n',
      'middleware.ts': [
        'import { writeFileSync } from "node:fs";',
        'export default async function middleware(ctx, next) {',
        `  writeFileSync(${JSON.stringify(marker)}, "executed");`,
        '  return next();',
        '}'
      ].join('\n'),
      'zenith.config.js': 'module.exports = { target: "static" };\n'
    });
    dev = await createDevServer({
      pagesDir: project.pagesDir,
      outDir: project.devOutDir,
      projectRoot: project.root,
      port: 0,
      config: { target: 'static' }
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await text(`http://127.0.0.1:${dev.port}`, '/')).status).not.toBe(200);
      expect(existsSync(marker)).toBe(false);
    } finally {
      spy.mockRestore();
      await rm(marker, { force: true });
    }
  });
});
