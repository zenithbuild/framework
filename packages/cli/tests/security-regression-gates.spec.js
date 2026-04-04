import { createServer } from 'node:http';
import http from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(45000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function makeProject(files, options = {}) {
    const pagesDir = options.pagesDir || 'pages';
    const root = join(tmpdir(), `zenith-security-gates-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents);
    }

    return {
        root,
        pagesDir: join(root, pagesDir),
        outDir: join(root, 'dist')
    };
}

function origin(port) {
    return `http://127.0.0.1:${port}`;
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

async function requestText(port, pathname, headers = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
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
                resolvePromise({
                    status: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });
        req.on('error', rejectPromise);
        req.end();
    });
}

async function createPng1x1() {
    return sharp({
        create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    }).png().toBuffer();
}

describe('Track A security regression gates', () => {
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

    test('host/origin trust and generic 500 behavior stay sanitized in dev and preview', async () => {
        project = await makeProject({
            'pages/origin.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ origin: ctx.url.origin, host: ctx.headers.host ?? null });',
                '}',
                '</script>',
                '<html><head></head><body><main>Origin</main></body></html>'
            ].join('\n'),
            'pages/broken.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  void ctx;',
                '  throw new Error("Route exploded");',
                '}',
                '</script>',
                '<html><head></head><body><main>Broken</main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

        const hostileHost = 'evil.example:9999';
        const devPayload = extractSsrPayload((await requestText(dev.port, '/origin', { Host: hostileHost })).body);
        const previewPayload = extractSsrPayload((await requestText(preview.port, '/origin', { Host: hostileHost })).body);

        expect(devPayload).toEqual({
            origin: origin(dev.port),
            host: hostileHost
        });
        expect(previewPayload).toEqual({
            origin: origin(preview.port),
            host: hostileHost
        });

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
    });

    test('dev route-check stays basePath-aware for guarded routes', async () => {
        project = await makeProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  return ctx.allow();',
                '}'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true, basePath: '/docs' }
        });
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { router: true, basePath: '/docs' }
        });

        const deniedDev = await fetch(`${origin(dev.port)}/docs/secure?auth=no`, { redirect: 'manual' });
        expect(deniedDev.status).toBe(307);
        expect(deniedDev.headers.get('location')).toBe('/docs/login');

        const devCheck = await fetch(`${origin(dev.port)}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure%3Fauth%3Dno`, {
            headers: { 'x-zenith-route-check': '1' }
        });

        expect((await devCheck.json()).result).toEqual({
            kind: 'redirect',
            location: '/docs/login',
            status: 307
        });
    });

    test('preview route-check stays basePath-aware for guarded routes', async () => {
        project = await makeProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  return ctx.allow();',
                '}'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true, basePath: '/docs' }
        });
        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0,
            config: { router: true, basePath: '/docs' }
        });

        const previewCheck = await fetch(`${origin(preview.port)}/docs/__zenith/route-check?path=%2Fdocs%2Fsecure%3Fauth%3Dno`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect((await previewCheck.json()).result).toEqual({
            kind: 'redirect',
            location: '/docs/login',
            status: 307
        });
    });

    test('unsupported route-check targets fail honestly instead of pretending support', async () => {
        project = await makeProject({
            'pages/index.zen': '<main>Home</main>\n',
            'pages/secure/index.zen': '<main>Secure</main>\n',
            'pages/secure/page.guard.ts': [
                'export async function guard(ctx) {',
                '  if (ctx.url.searchParams.get("auth") !== "yes") return ctx.redirect("/login", 307);',
                '  return ctx.allow();',
                '}'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { target: 'vercel', router: true }
        });
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { target: 'vercel', router: true }
        });

        const response = await fetch(`${origin(dev.port)}/__zenith/route-check?path=%2Fsecure`, {
            headers: { 'x-zenith-route-check': '1' }
        });
        expect(response.status).toBe(501);
        expect(await response.json()).toEqual({ error: 'route_check_unsupported' });
    });

    test('image materialization stays static-only and route-artifact-driven', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': '<main><Image src="/hero.png" alt="Hero" sizes="100vw" /></main>\n',
            'public/hero.png': png
        }, { pagesDir: 'src/pages' });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                basePath: '/docs',
                images: {
                    formats: ['webp'],
                    deviceSizes: [1],
                    imageSizes: [1]
                }
            }
        });

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('<img');
        expect(html).toContain('data-zenith-image=');
        expect(html).toContain('/docs/_zenith/image/local/');

        const buildSource = await readFile(resolve(__dirname, '../src/build.js'), 'utf8');
        const materializeSource = await readFile(resolve(__dirname, '../src/images/materialize.ts'), 'utf8');
        const previewSource = await readFile(resolve(__dirname, '../src/preview/request-handler.js'), 'utf8');
        const routeRenderSource = await readFile(resolve(__dirname, '../src/server-runtime/route-render.js'), 'utf8');
        const bundlerSource = await readFile(resolve(__dirname, '../../bundler/src/main.rs'), 'utf8');

        expect(materializeSource).toContain('router-manifest.json');
        expect(materializeSource).toContain('route.image_materialization');
        expect(buildSource.includes('materializeImageMarkupInHtmlFiles')).toBe(false);
        expect(bundlerSource).toContain('materialize_image_markup_in_build_html');
        expect(previewSource).toContain('resolved.route.image_materialization');
        expect(routeRenderSource).toContain('route.image_materialization');
        expect(materializeSource.includes('page_asset')).toBe(false);
        expect(materializeSource.includes('pageAssetPath')).toBe(false);
        expect(routeRenderSource.includes('pageAssetPath')).toBe(false);
        expect(materializeSource.includes('new Function')).toBe(false);
        expect(materializeSource.includes('eval(')).toBe(false);
    });

    test('dynamic Image props still fail honestly and docs keep the security boundary explicit', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': [
                '<script lang="ts">',
                'const hero = "/hero.png";',
                '</script>',
                '<main><Image src={hero} alt="Hero" /></main>'
            ].join('\n'),
            'public/hero.png': png
        }, { pagesDir: 'src/pages' });

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                images: {
                    formats: ['webp'],
                    deviceSizes: [1],
                    imageSizes: [1]
                }
            }
        })).rejects.toThrow(/Image materialization only supports static literal props|unsupported dynamic Image prop expression|static literal props only/i);

        const cliContract = await readFile(resolve(__dirname, '../CLI_CONTRACT.md'), 'utf8');
        const deploymentGuide = await readFile(
            resolve(__dirname, '../../../docs/documentation/guides/deployment-targets.md'),
            'utf8'
        );
        const routeProtectionDoc = await readFile(
            resolve(__dirname, '../../../docs/documentation/routing/route-protection.md'),
            'utf8'
        );

        expect(cliContract).toContain('Neither bundler nor CLI runtime paths may execute emitted page assets');
        expect(deploymentGuide).toContain('bundler-owned final build/static HTML image materialization');
        expect(deploymentGuide).toContain('Hosted `vercel` and `netlify` targets currently skip advisory route-check');
        expect(routeProtectionDoc).toContain('/__zenith/route-check` does not grant security');
        expect(routeProtectionDoc).toContain('Internal Server Error');
    });
});
