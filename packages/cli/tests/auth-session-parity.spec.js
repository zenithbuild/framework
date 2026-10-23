import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { cli } from '../dist/index.js';
import { jest } from '@jest/globals';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

jest.setTimeout(30000);

function authPages() {
    return {
        'login.zen': [
            '<script server lang="ts">',
            'export async function action(ctx) {',
            '  const form = await ctx.request.formData();',
            '  const email = String(form.get("email") || "").trim();',
            '  if (!email) return ctx.invalid({ field: "email", message: "Email required" }, 422);',
            '  await ctx.auth.signIn({ userId: "user_1", email });',
            '  return ctx.redirect("/account", 303);',
            '}',
            'export async function load(ctx) {',
            '  return ctx.data({ route: ctx.route.pattern, session: await ctx.auth.getSession(), action: ctx.action });',
            '}',
            '</script>',
            '<html><head></head><body><main>Login</main></body></html>'
        ].join('\n'),
        'account.zen': [
            '<script server lang="ts">',
            'export async function guard(ctx) {',
            '  const session = await ctx.auth.requireSession({ redirectTo: "/login", status: 302 });',
            '  ctx.env.viewer = String(session.email || "");',
            '  return ctx.allow();',
            '}',
            'export async function load(ctx) {',
            '  return ctx.data({ route: ctx.route.pattern, viewer: ctx.env.viewer, session: await ctx.auth.getSession(), action: ctx.action });',
            '}',
            '</script>',
            '<html><head></head><body><main>Account</main></body></html>'
        ].join('\n'),
        'deny.zen': [
            '<script server lang="ts">',
            'export async function guard(ctx) {',
            '  await ctx.auth.requireSession({ deny: 401, message: "Sign in required" });',
            '  return ctx.allow();',
            '}',
            'export async function load(ctx) {',
            '  return ctx.data({ route: ctx.route.pattern });',
            '}',
            '</script>',
            '<html><head></head><body><main>Deny</main></body></html>'
        ].join('\n'),
        'logout.zen': [
            '<script server lang="ts">',
            'export async function action(ctx) {',
            '  await ctx.auth.signOut();',
            '  return ctx.redirect("/login", 303);',
            '}',
            '</script>',
            '<html><head></head><body><main>Logout</main></body></html>'
        ].join('\n')
    };
}

async function createPagesProject(files) {
    const root = join(tmpdir(), `zenith-auth-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function createNodeProject(files) {
    const root = join(tmpdir(), `zenith-auth-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function origin(port) {
    return `http://127.0.0.1:${port}`;
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

function cookieHeaderFromSetCookie(setCookieHeader) {
    const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    expect(typeof raw).toBe('string');
    return String(raw).split(';', 1)[0];
}

async function fetchText(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        redirect: 'manual',
        ...options
    });
    return {
        status: response.status,
        headers: response.headers,
        body: await response.text()
    };
}

async function requestExchange(port, pathname, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

describe('route-owned cookie session parity', () => {
    const previousSecret = process.env.ZENITH_SESSION_SECRET;

    afterEach(async () => {
        if (previousSecret === undefined) {
            delete process.env.ZENITH_SESSION_SECRET;
        } else {
            process.env.ZENITH_SESSION_SECRET = previousSecret;
        }
    });

    test('dev and preview provide the same sign-in, guard/load, and sign-out flow', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-dev-preview-secret';

        let project = null;
        let dev = null;
        let preview = null;

        try {
            project = await createPagesProject(authPages());
            await build({ pagesDir: project.pagesDir, outDir: project.outDir });
            dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
            preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

            const missingDev = await fetchText(origin(dev.port), '/account');
            const missingPreview = await fetchText(origin(preview.port), '/account');
            expect(missingDev.status).toBe(302);
            expect(missingPreview.status).toBe(302);
            expect(missingDev.headers.get('location')).toBe('/login');
            expect(missingPreview.headers.get('location')).toBe('/login');

            const deniedDev = await fetchText(origin(dev.port), '/deny');
            const deniedPreview = await fetchText(origin(preview.port), '/deny');
            expect(deniedDev.status).toBe(401);
            expect(deniedPreview.status).toBe(401);
            expect(deniedDev.body).toBe('Sign in required');
            expect(deniedPreview.body).toBe('Sign in required');

            const invalidDev = await fetchText(origin(dev.port), '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email='
            });
            const invalidPreview = await fetchText(origin(preview.port), '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email='
            });
            expect(invalidDev.status).toBe(422);
            expect(invalidPreview.status).toBe(422);
            expect(extractSsrPayload(invalidDev.body)).toEqual({
                route: '/login',
                session: null,
                action: {
                    ok: false,
                    status: 422,
                    data: { field: 'email', message: 'Email required' }
                }
            });
            expect(extractSsrPayload(invalidPreview.body)).toEqual(extractSsrPayload(invalidDev.body));

            const loginDev = await fetchText(origin(dev.port), '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email=ada%40zenith.dev'
            });
            const loginPreview = await fetchText(origin(preview.port), '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email=ada%40zenith.dev'
            });
            expect(loginDev.status).toBe(303);
            expect(loginPreview.status).toBe(303);
            expect(loginDev.headers.get('location')).toBe('/account');
            expect(loginPreview.headers.get('location')).toBe('/account');

            const devSessionCookie = cookieHeaderFromSetCookie(loginDev.headers.get('set-cookie'));
            const previewSessionCookie = cookieHeaderFromSetCookie(loginPreview.headers.get('set-cookie'));
            expect(devSessionCookie).toMatch(/^zenith_session=/);
            expect(previewSessionCookie).toMatch(/^zenith_session=/);

            const accountDev = await fetchText(origin(dev.port), '/account', {
                headers: { cookie: devSessionCookie }
            });
            const accountPreview = await fetchText(origin(preview.port), '/account', {
                headers: { cookie: previewSessionCookie }
            });
            expect(accountDev.status).toBe(200);
            expect(accountPreview.status).toBe(200);
            expect(extractSsrPayload(accountDev.body)).toEqual({
                route: '/account',
                viewer: 'ada@zenith.dev',
                session: {
                    userId: 'user_1',
                    email: 'ada@zenith.dev'
                },
                action: null
            });
            expect(extractSsrPayload(accountPreview.body)).toEqual(extractSsrPayload(accountDev.body));

            const logoutDev = await fetchText(origin(dev.port), '/logout', {
                method: 'POST',
                headers: { cookie: devSessionCookie }
            });
            const logoutPreview = await fetchText(origin(preview.port), '/logout', {
                method: 'POST',
                headers: { cookie: previewSessionCookie }
            });
            expect(logoutDev.status).toBe(303);
            expect(logoutPreview.status).toBe(303);
            expect(logoutDev.headers.get('location')).toBe('/login');
            expect(logoutPreview.headers.get('location')).toBe('/login');
            expect(logoutDev.headers.get('set-cookie')).toContain('Max-Age=0');
            expect(logoutPreview.headers.get('set-cookie')).toContain('Max-Age=0');

            const clearedDevCookie = cookieHeaderFromSetCookie(logoutDev.headers.get('set-cookie'));
            const clearedPreviewCookie = cookieHeaderFromSetCookie(logoutPreview.headers.get('set-cookie'));
            const afterLogoutDev = await fetchText(origin(dev.port), '/account', {
                headers: { cookie: clearedDevCookie }
            });
            const afterLogoutPreview = await fetchText(origin(preview.port), '/account', {
                headers: { cookie: clearedPreviewCookie }
            });
            expect(afterLogoutDev.status).toBe(302);
            expect(afterLogoutPreview.status).toBe(302);
            expect(afterLogoutDev.headers.get('location')).toBe('/login');
            expect(afterLogoutPreview.headers.get('location')).toBe('/login');
        } finally {
            if (dev) {
                dev.close();
            }
            if (preview) {
                preview.close();
            }
            if (project) {
                await rm(project.root, { recursive: true, force: true });
            }
        }
    });

    test('packaged node provides the same sign-in, guard/load, and sign-out flow', async () => {
        process.env.ZENITH_SESSION_SECRET = 'zenith-node-secret';

        let projectRoot = null;
        let server = null;

        try {
            projectRoot = await createNodeProject({
                ...Object.fromEntries(
                    Object.entries(authPages()).map(([file, source]) => [`pages/${file}`, source])
                ),
                'zenith.config.js': 'module.exports = { target: "node" };\n'
            });

            await cli(['build'], projectRoot);

            const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
            server = await mod.createNodeServer({
                distDir: join(projectRoot, 'dist'),
                port: 0,
                host: '127.0.0.1'
            });

            const missing = await requestExchange(server.port, '/account');
            expect(missing.status).toBe(302);
            expect(missing.headers.location).toBe('/login');

            const denied = await requestExchange(server.port, '/deny');
            expect(denied.status).toBe(401);
            expect(denied.body).toBe('Sign in required');

            const invalid = await requestExchange(server.port, '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email='
            });
            expect(invalid.status).toBe(422);
            expect(extractSsrPayload(invalid.body)).toEqual({
                route: '/login',
                session: null,
                action: {
                    ok: false,
                    status: 422,
                    data: { field: 'email', message: 'Email required' }
                }
            });

            const login = await requestExchange(server.port, '/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'email=ada%40zenith.dev'
            });
            expect(login.status).toBe(303);
            expect(login.headers.location).toBe('/account');

            const sessionCookie = cookieHeaderFromSetCookie(login.headers['set-cookie']);
            expect(sessionCookie).toMatch(/^zenith_session=/);

            const account = await requestExchange(server.port, '/account', {
                headers: { cookie: sessionCookie }
            });
            expect(account.status).toBe(200);
            expect(extractSsrPayload(account.body)).toEqual({
                route: '/account',
                viewer: 'ada@zenith.dev',
                session: {
                    userId: 'user_1',
                    email: 'ada@zenith.dev'
                },
                action: null
            });

            const logout = await requestExchange(server.port, '/logout', {
                method: 'POST',
                headers: { cookie: sessionCookie }
            });
            expect(logout.status).toBe(303);
            expect(logout.headers.location).toBe('/login');
            expect(String(logout.headers['set-cookie'][0])).toContain('Max-Age=0');

            const clearedCookie = cookieHeaderFromSetCookie(logout.headers['set-cookie']);
            const afterLogout = await requestExchange(server.port, '/account', {
                headers: { cookie: clearedCookie }
            });
            expect(afterLogout.status).toBe(302);
            expect(afterLogout.headers.location).toBe('/login');
        } finally {
            if (server) {
                server.close();
            }
            if (projectRoot) {
                await rm(projectRoot, { recursive: true, force: true });
            }
        }
    });
});
