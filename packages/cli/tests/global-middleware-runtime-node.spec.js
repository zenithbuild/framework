import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(45000);

async function createProject(files = {}) {
    const root = join(tmpdir(), `zenith-global-middleware-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function listFiles(root) {
    const out = [];
    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile()) {
                out.push(fullPath);
            }
        }
    }
    await walk(root);
    return out.sort();
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

function getSetCookieValues(headers) {
    if (typeof headers?.getSetCookie === 'function') {
        return headers.getSetCookie();
    }
    const raw = headers?.get?.('set-cookie');
    return typeof raw === 'string' && raw.length > 0 ? [raw] : [];
}

function expectSourceOnlyMetadata(manifest, sourceFile) {
    expect(manifest.global_middleware).toEqual({ source_file: sourceFile });
}

function expectServerMiddlewareMetadata(manifest, sourceFile) {
    expect(manifest.global_middleware).toEqual({
        source_file: sourceFile,
        module: 'global-middleware/entry.js'
    });
    for (const forbidden of ['root', 'entry', 'stub', 'middleware_root', 'compiled_path', 'emitted_module_path']) {
        expect(manifest.global_middleware).not.toHaveProperty(forbidden);
    }
}

async function importNodeServer(projectRoot) {
    const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
    return mod.createNodeServer({
        distDir: join(projectRoot, 'dist'),
        port: 0,
        host: '127.0.0.1'
    });
}

describe('global middleware Gate 3A Node runtime', () => {
    const previousSecret = process.env.ZENITH_SESSION_SECRET;
    let projectRoot = null;
    let server = null;

    afterEach(async () => {
        if (server) {
            server.close();
            server = null;
        }
        if (previousSecret === undefined) {
            delete process.env.ZENITH_SESSION_SECRET;
        } else {
            process.env.ZENITH_SESSION_SECRET = previousSecret;
        }
        delete globalThis.__zenithGate3AMiddlewareRuns;
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('node build emits source-only public metadata, server module metadata, and one packaged middleware entry', async () => {
        projectRoot = await createProject({
            'src/pages/index.zen': [
                '<script server lang="ts">',
                'export function guard(ctx) {',
                '  ctx.env.order.push("guard");',
                '  return ctx.allow();',
                '}',
                'export function load(ctx) {',
                '  ctx.env.order.push("load");',
                '  return ctx.data({ marker: ctx.env.marker, helper: ctx.env.helper, order: ctx.env.order });',
                '}',
                '</script>',
                '<main>Home</main>'
            ].join('\n'),
            'src/api/ping.resource.ts': [
                'export async function load(ctx) {',
                '  return ctx.json({ marker: ctx.env.marker, helper: ctx.env.helper, order: ctx.env.order, route: ctx.route.pattern });',
                '}'
            ].join('\n'),
            'src/middleware-helper.ts': [
                'export function mark(ctx) {',
                '  ctx.env.marker = "global";',
                '  ctx.env.helper = "relative";',
                '}'
            ].join('\n'),
            'src/middleware.ts': [
                'import { mark } from "./middleware-helper.ts";',
                'export default async function middleware(ctx, next) {',
                '  ctx.env.order = ["middleware"];',
                '  mark(ctx);',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const coreManifest = await readJson(join(projectRoot, '.zenith-output', 'manifest.json'));
        const coreServerManifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const distManifest = await readJson(join(projectRoot, 'dist', 'manifest.json'));
        const distServerManifest = await readJson(join(projectRoot, 'dist', 'server', 'manifest.json'));

        expectSourceOnlyMetadata(coreManifest, 'src/middleware.ts');
        expectSourceOnlyMetadata(distManifest, 'src/middleware.ts');
        expectServerMiddlewareMetadata(coreServerManifest, 'src/middleware.ts');
        expectServerMiddlewareMetadata(distServerManifest, 'src/middleware.ts');
        expect(JSON.stringify(coreServerManifest.global_middleware)).not.toContain(projectRoot);
        expect(JSON.stringify(distServerManifest.global_middleware)).not.toContain(projectRoot);

        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'global-middleware', 'entry.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'global-middleware', 'entry.js'))).toBe(true);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'global-middleware', 'modules', 'src', 'middleware-helper.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'global-middleware', 'modules', 'src', 'middleware-helper.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'middleware.js'))).toBe(false);
        expect(coreServerManifest.routes).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ server_script_path: expect.stringContaining('middleware.ts') })
        ]));

        const entries = (await listFiles(join(projectRoot, 'dist', 'server')))
            .filter((filePath) => filePath.endsWith('global-middleware/entry.js'));
        expect(entries).toHaveLength(1);

        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const page = await fetch(`${origin}/`);
        expect(page.status).toBe(200);
        expect(extractSsrPayload(await page.text())).toEqual({
            marker: 'global',
            helper: 'relative',
            order: ['middleware', 'guard', 'load']
        });

        const resource = await fetch(`${origin}/api/ping`);
        expect(resource.status).toBe(200);
        expect(await resource.json()).toEqual({
            marker: 'global',
            helper: 'relative',
            order: ['middleware'],
            route: '/api/ping'
        });
    });

    test('route-check, static assets, and 404s do not run global middleware', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export function guard(ctx) {',
                '  return ctx.allow();',
                '}',
                'export function load(ctx) {',
                '  return ctx.data({ ok: true });',
                '}',
                '</script>',
                '<main>Home</main>'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  globalThis.__zenithGate3AMiddlewareRuns = (globalThis.__zenithGate3AMiddlewareRuns || 0) + 1;',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });

        await cli(['build'], projectRoot);
        await writeFile(join(projectRoot, 'dist', 'static', 'probe.txt'), 'asset', 'utf8');
        delete globalThis.__zenithGate3AMiddlewareRuns;

        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const routeCheck = await fetch(`${origin}/__zenith/route-check?path=%2F`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(routeCheck.status).toBe(200);
        expect(globalThis.__zenithGate3AMiddlewareRuns || 0).toBe(0);

        const asset = await fetch(`${origin}/probe.txt`);
        expect(asset.status).toBe(200);
        expect(await asset.text()).toBe('asset');
        expect(globalThis.__zenithGate3AMiddlewareRuns || 0).toBe(0);

        const missing = await fetch(`${origin}/missing`);
        expect(missing.status).toBe(404);
        expect(globalThis.__zenithGate3AMiddlewareRuns || 0).toBe(0);

        const page = await fetch(`${origin}/`);
        expect(page.status).toBe(200);
        expect(globalThis.__zenithGate3AMiddlewareRuns).toBe(1);
    });

    test('node middleware redirect and deny short-circuit matched routes', async () => {
        projectRoot = await createProject({
            'pages/redirect.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { void ctx; throw new Error("redirect route should not run"); }',
                '</script>',
                '<main>Redirect</main>'
            ].join('\n'),
            'pages/deny.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { void ctx; throw new Error("deny route should not run"); }',
                '</script>',
                '<main>Deny</main>'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  if (ctx.url.pathname === "/redirect") return ctx.redirect("/login", 307);',
                '  if (ctx.url.pathname === "/deny") return ctx.deny(401, "blocked");',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const redirected = await fetch(`${origin}/redirect`, { redirect: 'manual' });
        expect(redirected.status).toBe(307);
        expect(redirected.headers.get('location')).toBe('/login');

        const denied = await fetch(`${origin}/deny`);
        expect(denied.status).toBe(401);
        expect(await denied.text()).toBe('blocked');
    });

    test('node middleware supports requireSession redirect and numeric deny control flow', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-global-middleware-auth-secret';
        projectRoot = await createProject({
            'pages/account.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>Account</main>'
            ].join('\n'),
            'pages/api/private.resource.ts': [
                'export function load(ctx) { return ctx.json({ ok: true }); }'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  if (ctx.url.pathname === "/account") await ctx.auth.requireSession({ redirectTo: "/login", status: 302 });',
                '  if (ctx.url.pathname === "/api/private") await ctx.auth.requireSession({ deny: 401, message: "Sign in required" });',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const redirectResponse = await fetch(`${origin}/account`, { redirect: 'manual' });
        expect(redirectResponse.status).toBe(302);
        expect(redirectResponse.headers.get('location')).toBe('/login');

        const denyResponse = await fetch(`${origin}/api/private`);
        expect(denyResponse.status).toBe(401);
        expect(await denyResponse.text()).toBe('Sign in required');
    });

    test('node middleware signIn and signOut cookies flow through redirect envelopes', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-global-middleware-cookie-secret';
        projectRoot = await createProject({
            'pages/login.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>Login</main>'
            ].join('\n'),
            'pages/logout.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>Logout</main>'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  if (ctx.url.pathname === "/login") {',
                '    await ctx.auth.signIn({ userId: "u1" });',
                '    return ctx.redirect("/dashboard");',
                '  }',
                '  if (ctx.url.pathname === "/logout") {',
                '    await ctx.auth.signOut();',
                '    return ctx.redirect("/login");',
                '  }',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const login = await fetch(`${origin}/login`, { redirect: 'manual' });
        expect(login.status).toBe(302);
        expect(login.headers.get('location')).toBe('/dashboard');
        expect(getSetCookieValues(login.headers)[0]).toContain('zenith_session=');

        const logout = await fetch(`${origin}/logout`, { redirect: 'manual' });
        expect(logout.status).toBe(302);
        expect(logout.headers.get('location')).toBe('/login');
        expect(getSetCookieValues(logout.headers)[0]).toContain('Max-Age=0');
    });

    test('unsupported middleware return yields node 500 without staged cookies', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-global-middleware-invalid-secret';
        projectRoot = await createProject({
            'pages/broken.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>Broken</main>'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  void next;',
                '  await ctx.auth.signIn({ userId: "u1" });',
                '  return ctx.data({ unsupported: true });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        server = await importNodeServer(projectRoot);
        const origin = `http://127.0.0.1:${server.port}`;

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await fetch(`${origin}/broken`);
            expect(response.status).toBe(500);
            expect(await response.text()).toBe('Internal Server Error');
            expect(getSetCookieValues(response.headers)).toHaveLength(0);
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('middleware packaging rejects non-literal dynamic imports and explicit non-code imports', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  const helper = "./helper.ts";',
                '  await import(helper);',
                '  return next();',
                '}'
            ].join('\n'),
            'helper.ts': 'export const ok = true;\n',
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            '[Zenith:Middleware] Dynamic middleware imports must use a string literal specifier.'
        );
        await rm(projectRoot, { recursive: true, force: true });

        projectRoot = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'middleware.ts': [
                'import "./style.css";',
                'export default async function middleware(ctx, next) {',
                '  return next();',
                '}'
            ].join('\n'),
            'style.css': 'body { color: red; }\n',
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            `[Zenith:Middleware] Unsupported middleware import "./style.css" from "${join(projectRoot, 'middleware.ts')}". ` +
            'Global middleware may only import JavaScript, TypeScript, or JSON modules.'
        );
    });

    test('invalid compiled middleware default export uses existing node 500 error path', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>Home</main>'
            ].join('\n'),
            'middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        await writeFile(join(projectRoot, 'dist', 'server', 'global-middleware', 'entry.js'), 'export default {};\n', 'utf8');
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            server = await importNodeServer(projectRoot);
            const response = await fetch(`http://127.0.0.1:${server.port}/`);
            expect(response.status).toBe(500);
            expect(await response.text()).toBe('Internal Server Error');
            expect(errorSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain(
                '[Zenith:Middleware] Compiled global middleware module must default export a function.'
            );
        } finally {
            errorSpy.mockRestore();
        }
    });

    test('middleware.js remains ignored by node output and runtime', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ran: globalThis.__zenithGate3AMiddlewareRuns || 0 }); }',
                '</script>',
                '<main>Home</main>'
            ].join('\n'),
            'middleware.js': [
                'export default async function middleware(ctx, next) {',
                '  globalThis.__zenithGate3AMiddlewareRuns = (globalThis.__zenithGate3AMiddlewareRuns || 0) + 1;',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);
        const coreManifest = await readJson(join(projectRoot, '.zenith-output', 'manifest.json'));
        const serverManifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        expect(coreManifest).not.toHaveProperty('global_middleware');
        expect(serverManifest).not.toHaveProperty('global_middleware');
        expect(existsSync(join(projectRoot, 'dist', 'server', 'global-middleware', 'entry.js'))).toBe(false);

        delete globalThis.__zenithGate3AMiddlewareRuns;
        server = await importNodeServer(projectRoot);
        const response = await fetch(`http://127.0.0.1:${server.port}/`);
        expect(response.status).toBe(200);
        expect(extractSsrPayload(await response.text())).toEqual({ ran: 0 });
        expect(globalThis.__zenithGate3AMiddlewareRuns || 0).toBe(0);
    });
});
