import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-platform-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

function cookieHeaderFromResponse(response) {
    const raw = response.headers.get('set-cookie');
    if (!raw) {
        return '';
    }
    return raw.split(/,(?=[^;]+=[^;]+)/).map((value) => value.split(';')[0].trim()).join('; ');
}

async function fetchBytes(url, options = {}) {
    const response = await fetch(url, {
        redirect: 'manual',
        ...options
    });
    return {
        status: response.status,
        headers: response.headers,
        body: Buffer.from(await response.arrayBuffer())
    };
}

async function requestText(port, pathname, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: pathname,
            method: 'GET',
            headers
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
        req.end();
    });
}

describe('node adapter', () => {
    let projectRoot = null;
    let preview = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('node target emits a runnable server artifact with prerender, SSR, image, and route-check support', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/guides/[slug].zen': '<main>Docs Shell</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login?next=" + encodeURIComponent(ctx.url.pathname + ctx.url.search), 307);',
                '  ctx.env.viewer = "allowed";',
                '  return ctx.allow();',
                '}'
            ].join('\n'),
            'pages/secure/page.load.ts': [
                'export async function load(ctx) {',
                '  return ctx.data({ viewer: ctx.env.viewer, tab: ctx.url.searchParams.get("tab") });',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", basePath: "/docs", router: true };\n'
        });

        await cli(['build'], projectRoot);

        expect(existsSync(join(projectRoot, 'dist', 'index.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'manifest.json'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'config.json'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'server', 'runtime', 'node-server.js'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'static', 'index.html'))).toBe(true);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        expect(typeof mod.createNodeServer).toBe('function');
        expect(typeof mod.createRequestHandler).toBe('function');

        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });
        const origin = `http://127.0.0.1:${preview.port}`;

        const home = await fetch(`${origin}/docs/`);
        const homeHtml = await home.text();
        expect(home.status).toBe(200);
        expect(homeHtml).toContain('src="/docs/assets/');

        const prerendered = await fetch(`${origin}/docs/guides/guide`);
        expect(prerendered.status).toBe(200);
        expect(await prerendered.text()).toContain('Docs Shell');

        const denied = await fetch(`${origin}/docs/secure?auth=no`, { redirect: 'manual' });
        expect(denied.status).toBe(307);
        expect(denied.headers.get('location')).toBe('/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno');

        const allowed = await fetch(`${origin}/docs/secure?auth=yes&tab=profile`);
        const allowedBody = await allowed.text();
        expect(allowed.status).toBe(200);
        expect(allowedBody).toContain('"viewer":"allowed"');
        expect(allowedBody).toContain('"tab":"profile"');

        const routeCheckDenied = await fetch(`${origin}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure%3Fauth%3Dno`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        const routeCheckDeniedPayload = await routeCheckDenied.json();
        expect(routeCheckDenied.status).toBe(200);
        expect(routeCheckDeniedPayload.result).toEqual({
            kind: 'redirect',
            location: '/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno',
            status: 307
        });

        const routeCheckForbidden = await fetch(`${origin}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure`);
        expect(routeCheckForbidden.status).toBe(403);

        const imageResponse = await fetch(`${origin}/docs/_zenith/image`);
        expect(imageResponse.status).toBe(400);
        expect(await imageResponse.json()).toEqual({ error: 'missing_url' });

        const rootResponse = await fetch(`${origin}/`, { redirect: 'manual' });
        expect(rootResponse.status).toBe(404);
    });

    test('node target executes resource routes with json/text/downloads, auth cookies, and multipart support', async () => {
        const previousSecret = process.env.ZENITH_SESSION_SECRET;
        process.env.ZENITH_SESSION_SECRET = 'zenith-node-resource-secret';
        try {
            projectRoot = await createProject({
                'pages/api/ping.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.json({ method: ctx.method, route: ctx.route.pattern });',
                    '}'
                ].join('\n'),
                'pages/api/login.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.json({ ok: true, username });',
                    '}'
                ].join('\n'),
                'pages/api/me.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  return ctx.json({ session: await ctx.auth.getSession() });',
                    '}'
                ].join('\n'),
                'pages/api/health.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.text("healthy");',
                    '}'
                ].join('\n'),
                'pages/api/export.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.download("node,ok\\n", { filename: "node.csv", contentType: "text/csv; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'pages/api/login-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.download("signed-in:" + username, { filename: "session.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'pages/api/protected-download.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  const session = await ctx.auth.getSession();',
                    '  return ctx.download("hello:" + String(session.username || ""), { filename: "private.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'pages/api/upload.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const attachment = form.get("attachment");',
                    '  return ctx.json({',
                    '    title: String(form.get("title") || "").trim(),',
                    '    fileName: attachment instanceof File ? attachment.name : null',
                    '  });',
                    '}'
                ].join('\n'),
                'pages/api/upload-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const attachment = form.get("attachment");',
                    '  const encoder = new TextEncoder();',
                    '  return ctx.download(encoder.encode(String(form.get("title") || "").trim() + ":" + (attachment instanceof File ? attachment.name : "")), { filename: "upload.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'zenith.config.js': 'module.exports = { target: "node" };\n'
            });

            await cli(['build'], projectRoot);
            const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
            preview = await mod.createNodeServer({
                distDir: join(projectRoot, 'dist'),
                port: 0,
                host: '127.0.0.1'
            });
            const origin = `http://127.0.0.1:${preview.port}`;

            const ping = await fetch(`${origin}/api/ping`);
            expect(ping.status).toBe(200);
            expect(await ping.json()).toEqual({ method: 'GET', route: '/api/ping' });

            const health = await fetch(`${origin}/api/health`);
            expect(health.status).toBe(200);
            expect(await health.text()).toBe('healthy');

            const exportDownload = await fetchBytes(`${origin}/api/export`);
            expect(exportDownload.status).toBe(200);
            expect(exportDownload.headers.get('content-type')).toBe('text/csv; charset=utf-8');
            expect(exportDownload.headers.get('content-disposition')).toContain('attachment;');
            expect(exportDownload.body.toString('utf8')).toBe('node,ok\n');

            const exportHead = await fetch(`${origin}/api/export`, { method: 'HEAD' });
            expect(exportHead.status).toBe(200);
            expect(exportHead.headers.get('content-disposition')).toContain('attachment;');
            expect(await exportHead.text()).toBe('');

            const login = await fetch(`${origin}/api/login`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=node-user'
            });
            expect(login.status).toBe(200);
            expect(await login.json()).toEqual({ ok: true, username: 'node-user' });
            const cookie = cookieHeaderFromResponse(login);
            expect(cookie).toContain('zenith_session=');

            const loginDownload = await fetchBytes(`${origin}/api/login-download`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=node-user'
            });
            expect(loginDownload.status).toBe(200);
            expect(loginDownload.body.toString('utf8')).toBe('signed-in:node-user');
            expect(cookieHeaderFromResponse({ headers: loginDownload.headers })).toContain('zenith_session=');

            const me = await fetch(`${origin}/api/me`, {
                headers: { Cookie: cookie }
            });
            expect(me.status).toBe(200);
            expect(await me.json()).toEqual({ session: { username: 'node-user' } });

            const protectedDownload = await fetchBytes(`${origin}/api/protected-download`, {
                headers: { Cookie: cookie }
            });
            expect(protectedDownload.status).toBe(200);
            expect(protectedDownload.body.toString('utf8')).toBe('hello:node-user');

            const uploadForm = new FormData();
            uploadForm.set('title', 'Node upload');
            uploadForm.set('attachment', new File(['node-resource'], 'node.txt', { type: 'text/plain' }));

            const upload = await fetch(`${origin}/api/upload`, {
                method: 'POST',
                body: uploadForm
            });
            expect(upload.status).toBe(200);
            expect(await upload.json()).toEqual({
                title: 'Node upload',
                fileName: 'node.txt'
            });

            const uploadDownloadForm = new FormData();
            uploadDownloadForm.set('title', 'Node download');
            uploadDownloadForm.set('attachment', new File(['node-resource'], 'node.txt', { type: 'text/plain' }));

            const uploadDownload = await fetchBytes(`${origin}/api/upload-download`, {
                method: 'POST',
                body: uploadDownloadForm
            });
            expect(uploadDownload.status).toBe(200);
            expect(uploadDownload.body.toString('utf8')).toBe('Node download:node.txt');
        } finally {
            if (previousSecret === undefined) {
                delete process.env.ZENITH_SESSION_SECRET;
            } else {
                process.env.ZENITH_SESSION_SECRET = previousSecret;
            }
        }
    });

    test('node target ignores untrusted Host headers and requires an explicit public origin for detached handlers', async () => {
        projectRoot = await createProject({
            'pages/origin.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ origin: ctx.url.origin, host: ctx.headers.host ?? null });',
                '}',
                '</script>',
                '<html><head></head><body><main>Origin</main></body></html>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        await expect(mod.createRequestHandler()).rejects.toThrow('publicOrigin');

        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });

        const hostileHost = 'evil.example:9999';
        const response = await requestText(preview.port, '/origin', { Host: hostileHost });
        const payload = extractSsrPayload(response.body);

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            origin: `http://127.0.0.1:${preview.port}`,
            host: hostileHost
        });
    });

    test('node target sanitizes thrown server errors in direct requests and route-check', async () => {
        projectRoot = await createProject({
            'pages/broken.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  void ctx;',
                '  throw new Error("Route exploded");',
                '}',
                '</script>',
                '<html><head></head><body><main>Broken</main></body></html>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });

        const direct = await requestText(preview.port, '/broken');
        expect(direct.status).toBe(500);
        expect(direct.body).toBe('Internal Server Error');

        const routeCheck = await requestText(preview.port, '/__zenith/route-check?path=%2Fbroken', {
            'x-zenith-route-check': '1'
        });
        expect(routeCheck.status).toBe(200);
        expect(JSON.parse(routeCheck.body).result).toEqual({
            kind: 'deny',
            status: 500,
            message: 'Internal Server Error'
        });
    });

    test('node target preserves multipart action parity for fields and files', async () => {
        projectRoot = await createProject({
            'pages/upload.zen': [
                '<script server lang="ts">',
                'export async function action(ctx) {',
                '  const form = await ctx.request.formData();',
                '  const title = String(form.get("title") || "").trim();',
                '  const attachment = form.get("attachment");',
                '  if (!title) return ctx.invalid({ field: "title", message: "Title required" }, 422);',
                '  if (!(attachment instanceof File) || attachment.size === 0) return ctx.invalid({ field: "attachment", message: "File required" }, 422);',
                '  return ctx.data({',
                '    title,',
                '    fileName: attachment.name,',
                '    fileType: attachment.type,',
                '    fileSize: attachment.size',
                '  });',
                '}',
                'export async function load(ctx) {',
                '  return ctx.data({ route: ctx.route.pattern, method: ctx.method, action: ctx.action });',
                '}',
                '</script>',
                '<html><head></head><body><main>Upload</main></body></html>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const mod = await import(pathToFileURL(join(projectRoot, 'dist', 'index.js')).href);
        preview = await mod.createNodeServer({
            distDir: join(projectRoot, 'dist'),
            port: 0,
            host: '127.0.0.1'
        });
        const origin = `http://127.0.0.1:${preview.port}`;

        const invalidForm = new FormData();
        invalidForm.set('title', '');
        const invalid = await fetch(`${origin}/upload`, {
            method: 'POST',
            body: invalidForm
        });
        expect(invalid.status).toBe(422);
        expect(extractSsrPayload(await invalid.text())).toEqual({
            route: '/upload',
            method: 'POST',
            action: {
                ok: false,
                status: 422,
                data: { field: 'title', message: 'Title required' }
            }
        });

        const successForm = new FormData();
        successForm.set('title', 'Zenith upload');
        successForm.set('attachment', new File(['hello upload'], 'hello.txt', { type: 'text/plain' }));

        const success = await fetch(`${origin}/upload`, {
            method: 'POST',
            body: successForm
        });
        expect(success.status).toBe(200);
        expect(extractSsrPayload(await success.text())).toEqual({
            route: '/upload',
            method: 'POST',
            action: {
                ok: true,
                status: 200,
                data: {
                    title: 'Zenith upload',
                    fileName: 'hello.txt',
                    fileType: 'text/plain',
                    fileSize: 12
                }
            }
        });
    });
});
