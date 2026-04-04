import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { jest } from '@jest/globals';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(90000);

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-server-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

function origin(port) {
    return `http://localhost:${port}`;
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
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

async function fetchJson(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        redirect: 'manual',
        ...options
    });
    return {
        status: response.status,
        headers: response.headers,
        body: await response.json()
    };
}

async function fetchBytes(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        redirect: 'manual',
        ...options
    });
    return {
        status: response.status,
        headers: response.headers,
        body: Buffer.from(await response.arrayBuffer())
    };
}

function cookieHeaderFromResponse(headers) {
    const raw = headers.get('set-cookie');
    if (!raw) {
        return '';
    }
    return raw.split(/,(?=[^;]+=[^;]+)/).map((value) => value.split(';')[0].trim()).join('; ');
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

describe('Phase 0 server routing contract', () => {
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
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('dev and preview honor the same direct-request route precedence and pathname normalization', async () => {
        project = await makeProject({
            'docs/getting-started.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ route: ctx.route.pattern, params: ctx.params, tab: ctx.url.searchParams.get("tab") });',
                '</script>',
                '<html><head></head><body><main>Static</main></body></html>'
            ].join('\n'),
            'docs/[section].zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ route: ctx.route.pattern, params: ctx.params, tab: ctx.url.searchParams.get("tab") });',
                '</script>',
                '<html><head></head><body><main>Param</main></body></html>'
            ].join('\n'),
            'docs/[...slug].zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ route: ctx.route.pattern, params: ctx.params, tab: ctx.url.searchParams.get("tab") });',
                '</script>',
                '<html><head></head><body><main>Catchall</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const cases = [
            ['/docs/getting-started/', { route: '/docs/getting-started', params: {}, tab: null }],
            ['/docs/guides?tab=intro', { route: '/docs/:section', params: { section: 'guides' }, tab: 'intro' }],
            ['/docs/guides/install/linux', { route: '/docs/*slug', params: { slug: 'guides/install/linux' }, tab: null }]
        ];

        for (const [pathname, expected] of cases) {
            const devPayload = extractSsrPayload((await fetchText(origin(dev.port), pathname)).body);
            const previewPayload = extractSsrPayload((await fetchText(origin(preview.port), pathname)).body);
            expect(devPayload).toEqual(expected);
            expect(previewPayload).toEqual(expected);
        }
    });

    test('matched route deny(404) is distinct from unmatched route 404 in dev and preview', async () => {
        project = await makeProject({
            'records/[id].zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => {',
                '  if (ctx.params.id === "missing") return ctx.deny(404, "Record not found");',
                '  return { id: ctx.params.id, route: ctx.route.pattern };',
                '};',
                '</script>',
                '<html><head></head><body><main>Record</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const matchedDev = await fetchText(origin(dev.port), '/records/missing');
        const matchedPreview = await fetchText(origin(preview.port), '/records/missing');
        expect(matchedDev.status).toBe(404);
        expect(matchedPreview.status).toBe(404);
        expect(matchedDev.body).toBe('Record not found');
        expect(matchedPreview.body).toBe('Record not found');

        const unmatchedDev = await fetchText(origin(dev.port), '/records');
        const unmatchedPreview = await fetchText(origin(preview.port), '/records');
        expect(unmatchedDev.status).toBe(404);
        expect(unmatchedPreview.status).toBe(404);
        expect(unmatchedDev.body).toContain('Zenith Dev 404');
        expect(unmatchedPreview.body).toBe('404 Not Found');
    });

    test('adjacent guard/load modules participate in direct server routing and mirror between dev and preview', async () => {
        project = await makeProject({
            'secure.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") {',
                '    return ctx.redirect("/login?next=" + encodeURIComponent(ctx.url.pathname + ctx.url.search) + "#resume", 307);',
                '  }',
                '  ctx.env.viewer = "allowed";',
                '  return ctx.allow();',
                '}',
                '</script>',
                '<html><head></head><body><main>Secure</main></body></html>'
            ].join('\n'),
            'secure.load.ts': [
                'export async function load(ctx) {',
                '  return ctx.data({ viewer: ctx.env.viewer, tab: ctx.url.searchParams.get("tab"), route: ctx.route.pattern, params: ctx.params });',
                '}'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const deniedDev = await fetchText(origin(dev.port), '/secure?auth=no');
        const deniedPreview = await fetchText(origin(preview.port), '/secure?auth=no');
        expect(deniedDev.status).toBe(307);
        expect(deniedPreview.status).toBe(307);
        expect(deniedDev.headers.get('location')).toBe('/login?next=%2Fsecure%3Fauth%3Dno#resume');
        expect(deniedPreview.headers.get('location')).toBe('/login?next=%2Fsecure%3Fauth%3Dno#resume');

        const allowedDev = extractSsrPayload((await fetchText(origin(dev.port), '/secure?auth=yes&tab=profile')).body);
        const allowedPreview = extractSsrPayload((await fetchText(origin(preview.port), '/secure?auth=yes&tab=profile')).body);
        expect(allowedDev).toEqual({
            viewer: 'allowed',
            tab: 'profile',
            route: '/secure',
            params: {}
        });
        expect(allowedPreview).toEqual(allowedDev);
    });

    test('post actions re-render HTML with ctx.action state consistently in dev and preview', async () => {
        project = await makeProject({
            'contact.zen': [
                '<script server lang="ts">',
                'export async function action(ctx) {',
                '  const form = await ctx.request.formData();',
                '  const name = String(form.get("name") || "").trim();',
                '  if (!name) return ctx.invalid({ field: "name", message: "Name required" }, 422);',
                '  return ctx.data({ saved: true, name });',
                '}',
                'export async function load(ctx) {',
                '  return ctx.data({ route: ctx.route.pattern, method: ctx.method, action: ctx.action });',
                '}',
                '</script>',
                '<html><head></head><body><main>Contact</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const invalidDev = await fetchText(origin(dev.port), '/contact', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'name='
        });
        const invalidPreview = await fetchText(origin(preview.port), '/contact', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'name='
        });

        expect(invalidDev.status).toBe(422);
        expect(invalidPreview.status).toBe(422);
        expect(extractSsrPayload(invalidDev.body)).toEqual({
            route: '/contact',
            method: 'POST',
            action: {
                ok: false,
                status: 422,
                data: { field: 'name', message: 'Name required' }
            }
        });
        expect(extractSsrPayload(invalidPreview.body)).toEqual(extractSsrPayload(invalidDev.body));

        const successDev = await fetchText(origin(dev.port), '/contact', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'name=Zenith'
        });
        const successPreview = await fetchText(origin(preview.port), '/contact', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'name=Zenith'
        });

        expect(successDev.status).toBe(200);
        expect(successPreview.status).toBe(200);
        expect(extractSsrPayload(successDev.body)).toEqual({
            route: '/contact',
            method: 'POST',
            action: {
                ok: true,
                status: 200,
                data: { saved: true, name: 'Zenith' }
            }
        });
        expect(extractSsrPayload(successPreview.body)).toEqual(extractSsrPayload(successDev.body));
    });

    test('resource routes return json/text/downloads, preserve auth cookies, and accept multipart in dev and preview', async () => {
        const previousSecret = process.env.ZENITH_SESSION_SECRET;
        process.env.ZENITH_SESSION_SECRET = 'zenith-resource-test-secret';
        try {
            project = await makeProject({
                'api/ping.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.json({ method: ctx.method, route: ctx.route.pattern });',
                    '}'
                ].join('\n'),
                'api/health.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.text("healthy");',
                    '}'
                ].join('\n'),
                'api/login.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  if (!username) return ctx.json({ error: "username_required" }, 422);',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.json({ ok: true, username });',
                    '}'
                ].join('\n'),
                'api/me.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  return ctx.json({ session: await ctx.auth.getSession() });',
                    '}'
                ].join('\n'),
                'api/logout.resource.ts': [
                    'export async function action(ctx) {',
                    '  await ctx.auth.signOut();',
                    '  return ctx.text("signed out");',
                    '}'
                ].join('\n'),
                'api/export.resource.ts': [
                    'export async function load(ctx) {',
                    '  return ctx.download("report,ok\\n", { filename: "report.csv", contentType: "text/csv; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/login-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const username = String(form.get("username") || "").trim();',
                    '  if (!username) return ctx.json({ error: "username_required" }, 422);',
                    '  await ctx.auth.signIn({ username });',
                    '  return ctx.download("signed-in:" + username, { filename: "session.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/protected-download.resource.ts': [
                    'export async function guard(ctx) {',
                    '  await ctx.auth.requireSession({ deny: 401, message: "Login required" });',
                    '  return ctx.allow();',
                    '}',
                    'export async function load(ctx) {',
                    '  const session = await ctx.auth.getSession();',
                    '  return ctx.download("hello:" + String(session.username || ""), { filename: "private.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n'),
                'api/upload.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const title = String(form.get("title") || "").trim();',
                    '  const attachment = form.get("attachment");',
                    '  if (!title) return ctx.json({ error: "title_required" }, 422);',
                    '  if (!(attachment instanceof File) || attachment.size === 0) return ctx.json({ error: "file_required" }, 422);',
                    '  return ctx.json({ title, fileName: attachment.name, fileSize: attachment.size });',
                    '}'
                ].join('\n'),
                'api/upload-download.resource.ts': [
                    'export async function action(ctx) {',
                    '  const form = await ctx.request.formData();',
                    '  const title = String(form.get("title") || "").trim();',
                    '  const attachment = form.get("attachment");',
                    '  if (!(attachment instanceof File) || attachment.size === 0) return ctx.text("missing file", 422);',
                    '  const encoder = new TextEncoder();',
                    '  return ctx.download(encoder.encode(title + ":" + attachment.name), { filename: "upload.txt", contentType: "text/plain; charset=utf-8" });',
                    '}'
                ].join('\n')
            });

            await build({ pagesDir: project.pagesDir, outDir: project.outDir });
            dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
            preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

            const devPing = await fetchJson(origin(dev.port), '/api/ping');
            const previewPing = await fetchJson(origin(preview.port), '/api/ping');
            expect(devPing.status).toBe(200);
            expect(devPing.body).toEqual({ method: 'GET', route: '/api/ping' });
            expect(previewPing.body).toEqual(devPing.body);

            const devHealth = await fetchText(origin(dev.port), '/api/health');
            const previewHealth = await fetchText(origin(preview.port), '/api/health');
            expect(devHealth.status).toBe(200);
            expect(previewHealth.status).toBe(200);
            expect(devHealth.body).toBe('healthy');
            expect(previewHealth.body).toBe('healthy');

            const devExport = await fetchBytes(origin(dev.port), '/api/export');
            const previewExport = await fetchBytes(origin(preview.port), '/api/export');
            expect(devExport.status).toBe(200);
            expect(previewExport.status).toBe(200);
            expect(devExport.headers.get('content-type')).toBe('text/csv; charset=utf-8');
            expect(previewExport.headers.get('content-type')).toBe('text/csv; charset=utf-8');
            expect(devExport.headers.get('content-disposition')).toContain('attachment;');
            expect(previewExport.headers.get('content-disposition')).toContain('attachment;');
            expect(devExport.body.toString('utf8')).toBe('report,ok\n');
            expect(previewExport.body.toString('utf8')).toBe('report,ok\n');

            const devHeadExport = await fetchText(origin(dev.port), '/api/export', { method: 'HEAD' });
            const previewHeadExport = await fetchText(origin(preview.port), '/api/export', { method: 'HEAD' });
            expect(devHeadExport.status).toBe(200);
            expect(previewHeadExport.status).toBe(200);
            expect(devHeadExport.body).toBe('');
            expect(previewHeadExport.body).toBe('');
            expect(devHeadExport.headers.get('content-disposition')).toContain('attachment;');
            expect(previewHeadExport.headers.get('content-disposition')).toContain('attachment;');

            const devUnauthorized = await fetchText(origin(dev.port), '/api/me');
            const previewUnauthorized = await fetchText(origin(preview.port), '/api/me');
            expect(devUnauthorized.status).toBe(401);
            expect(previewUnauthorized.status).toBe(401);
            expect(devUnauthorized.body).toBe('Login required');
            expect(previewUnauthorized.body).toBe('Login required');

            const devLogin = await fetchJson(origin(dev.port), '/api/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            const previewLogin = await fetchJson(origin(preview.port), '/api/login', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            expect(devLogin.status).toBe(200);
            expect(previewLogin.status).toBe(200);
            expect(devLogin.body).toEqual({ ok: true, username: 'zenith' });
            expect(previewLogin.body).toEqual(devLogin.body);

            const devCookie = cookieHeaderFromResponse(devLogin.headers);
            const previewCookie = cookieHeaderFromResponse(previewLogin.headers);
            expect(devCookie).toContain('zenith_session=');
            expect(previewCookie).toContain('zenith_session=');

            const devLoginDownload = await fetchBytes(origin(dev.port), '/api/login-download', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            const previewLoginDownload = await fetchBytes(origin(preview.port), '/api/login-download', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'username=zenith'
            });
            expect(devLoginDownload.status).toBe(200);
            expect(previewLoginDownload.status).toBe(200);
            expect(devLoginDownload.body.toString('utf8')).toBe('signed-in:zenith');
            expect(previewLoginDownload.body.toString('utf8')).toBe('signed-in:zenith');
            expect(cookieHeaderFromResponse(devLoginDownload.headers)).toContain('zenith_session=');
            expect(cookieHeaderFromResponse(previewLoginDownload.headers)).toContain('zenith_session=');

            const devMe = await fetchJson(origin(dev.port), '/api/me', {
                headers: { Cookie: devCookie }
            });
            const previewMe = await fetchJson(origin(preview.port), '/api/me', {
                headers: { Cookie: previewCookie }
            });
            expect(devMe.status).toBe(200);
            expect(previewMe.status).toBe(200);
            expect(devMe.body).toEqual({ session: { username: 'zenith' } });
            expect(previewMe.body).toEqual(devMe.body);

            const devProtectedDownload = await fetchBytes(origin(dev.port), '/api/protected-download', {
                headers: { Cookie: devCookie }
            });
            const previewProtectedDownload = await fetchBytes(origin(preview.port), '/api/protected-download', {
                headers: { Cookie: previewCookie }
            });
            expect(devProtectedDownload.status).toBe(200);
            expect(previewProtectedDownload.status).toBe(200);
            expect(devProtectedDownload.body.toString('utf8')).toBe('hello:zenith');
            expect(previewProtectedDownload.body.toString('utf8')).toBe('hello:zenith');

            const uploadForm = new FormData();
            uploadForm.set('title', 'Resource upload');
            uploadForm.set('attachment', new File(['upload-body'], 'note.txt', { type: 'text/plain' }));

            const devUpload = await fetchJson(origin(dev.port), '/api/upload', {
                method: 'POST',
                body: uploadForm
            });
            const previewUpload = await fetchJson(origin(preview.port), '/api/upload', {
                method: 'POST',
                body: uploadForm
            });
            expect(devUpload.status).toBe(200);
            expect(previewUpload.status).toBe(200);
            expect(devUpload.body).toEqual({
                title: 'Resource upload',
                fileName: 'note.txt',
                fileSize: 11
            });
            expect(previewUpload.body).toEqual(devUpload.body);

            const uploadDownloadForm = new FormData();
            uploadDownloadForm.set('title', 'Resource download');
            uploadDownloadForm.set('attachment', new File(['download-body'], 'note.txt', { type: 'text/plain' }));

            const devUploadDownload = await fetchBytes(origin(dev.port), '/api/upload-download', {
                method: 'POST',
                body: uploadDownloadForm
            });
            const previewUploadDownload = await fetchBytes(origin(preview.port), '/api/upload-download', {
                method: 'POST',
                body: uploadDownloadForm
            });
            expect(devUploadDownload.status).toBe(200);
            expect(previewUploadDownload.status).toBe(200);
            expect(devUploadDownload.body.toString('utf8')).toBe('Resource download:note.txt');
            expect(previewUploadDownload.body.toString('utf8')).toBe('Resource download:note.txt');

            const devLogout = await fetchText(origin(dev.port), '/api/logout', {
                method: 'POST',
                headers: { Cookie: devCookie }
            });
            const previewLogout = await fetchText(origin(preview.port), '/api/logout', {
                method: 'POST',
                headers: { Cookie: previewCookie }
            });
            expect(devLogout.status).toBe(200);
            expect(previewLogout.status).toBe(200);
            expect(devLogout.body).toBe('signed out');
            expect(previewLogout.body).toBe('signed out');
            expect(cookieHeaderFromResponse(devLogout.headers)).toContain('zenith_session=');
            expect(cookieHeaderFromResponse(previewLogout.headers)).toContain('zenith_session=');
        } finally {
            if (previousSecret === undefined) {
                delete process.env.ZENITH_SESSION_SECRET;
            } else {
                process.env.ZENITH_SESSION_SECRET = previousSecret;
            }
        }
    });

    test('multipart post actions re-render HTML with ctx.action state consistently in dev and preview', async () => {
        project = await makeProject({
            'upload.zen': [
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
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const invalidForm = new FormData();
        invalidForm.set('title', '');

        const invalidDev = await fetchText(origin(dev.port), '/upload', {
            method: 'POST',
            body: invalidForm
        });
        const invalidPreview = await fetchText(origin(preview.port), '/upload', {
            method: 'POST',
            body: invalidForm
        });

        expect(invalidDev.status).toBe(422);
        expect(invalidPreview.status).toBe(422);
        expect(extractSsrPayload(invalidDev.body)).toEqual({
            route: '/upload',
            method: 'POST',
            action: {
                ok: false,
                status: 422,
                data: { field: 'title', message: 'Title required' }
            }
        });
        expect(extractSsrPayload(invalidPreview.body)).toEqual(extractSsrPayload(invalidDev.body));

        const successForm = new FormData();
        successForm.set('title', 'Zenith upload');
        successForm.set('attachment', new File(['hello upload'], 'hello.txt', { type: 'text/plain' }));

        const successDev = await fetchText(origin(dev.port), '/upload', {
            method: 'POST',
            body: successForm
        });
        const successPreview = await fetchText(origin(preview.port), '/upload', {
            method: 'POST',
            body: successForm
        });

        expect(successDev.status).toBe(200);
        expect(successPreview.status).toBe(200);
        expect(extractSsrPayload(successDev.body)).toEqual({
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
        expect(extractSsrPayload(successPreview.body)).toEqual(extractSsrPayload(successDev.body));
    });

    test('thrown server errors are sanitized and implicit empty payloads stay aligned between dev and preview', async () => {
        project = await makeProject({
            'broken.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  void ctx;',
                '  throw new Error("Route exploded");',
                '}',
                '</script>',
                '<html><head></head><body><main>Broken</main></body></html>'
            ].join('\n'),
            'empty.zen': [
                '<script server lang="ts">',
                'const noop = 1;',
                '</script>',
                '<html><head></head><body><main>Empty</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const brokenDev = await fetchText(origin(dev.port), '/broken');
        const brokenPreview = await fetchText(origin(preview.port), '/broken');
        expect(brokenDev.status).toBe(500);
        expect(brokenPreview.status).toBe(500);
        expect(brokenDev.body).toBe('Internal Server Error');
        expect(brokenPreview.body).toBe('Internal Server Error');

        const brokenCheckDev = await fetchText(origin(dev.port), '/__zenith/route-check?path=%2Fbroken', {
            headers: { 'x-zenith-route-check': '1' }
        });
        const brokenCheckPreview = await fetchText(origin(preview.port), '/__zenith/route-check?path=%2Fbroken', {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(brokenCheckDev.status).toBe(200);
        expect(brokenCheckPreview.status).toBe(200);
        expect(JSON.parse(brokenCheckDev.body).result).toEqual({
            kind: 'deny',
            status: 500,
            message: 'Internal Server Error'
        });
        expect(JSON.parse(brokenCheckPreview.body).result).toEqual({
            kind: 'deny',
            status: 500,
            message: 'Internal Server Error'
        });

        const emptyDev = await fetchText(origin(dev.port), '/empty');
        const emptyPreview = await fetchText(origin(preview.port), '/empty');
        expect(emptyDev.status).toBe(200);
        expect(emptyPreview.status).toBe(200);
        expect(emptyDev.body).toContain('window.__zenith_ssr_data = {};');
        expect(emptyPreview.body).toContain('window.__zenith_ssr_data = {};');
    });

    test('dev and preview ignore untrusted Host when reconstructing ctx.url.origin', async () => {
        project = await makeProject({
            'origin.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ origin: ctx.url.origin, host: ctx.headers.host ?? null });',
                '}',
                '</script>',
                '<html><head></head><body><main>Origin</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const hostileHost = 'evil.example:9999';
        const devPayload = extractSsrPayload((await requestText(dev.port, '/origin', { Host: hostileHost })).body);
        const previewPayload = extractSsrPayload((await requestText(preview.port, '/origin', { Host: hostileHost })).body);

        expect(devPayload).toEqual({
            origin: `http://127.0.0.1:${dev.port}`,
            host: hostileHost
        });
        expect(previewPayload).toEqual({
            origin: `http://127.0.0.1:${preview.port}`,
            host: hostileHost
        });
    });
});
