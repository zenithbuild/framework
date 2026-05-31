import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';
import { executeScopedServerData } from '../dist/scoped-server-data/runtime.js';
import { copyHostedPageRuntime } from '../src/adapters/copy-hosted-page-runtime.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(60000);

async function createProject(target, files) {
    const root = join(tmpdir(), `zenith-scoped-hosted-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries({
        ...files,
        'zenith.config.js': `module.exports = { target: ${JSON.stringify(target)} };\n`
    })) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function hostedEntrypoint(projectRoot, target, routeName) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', `${routeName}.func`, 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', `__zenith_${routeName}.mjs`);
}

function hostedInternalUrl(target, routeName) {
    if (target === 'vercel') {
        return `https://example.com/__zenith/${routeName}`;
    }
    return `https://example.com/.netlify/functions/__zenith_${routeName}`;
}

async function executeHostedRoute(projectRoot, target, routeName, init = {}) {
    const mod = await import(pathToFileURL(hostedEntrypoint(projectRoot, target, routeName)).href);
    const request = new Request(hostedInternalUrl(target, routeName), { redirect: 'manual', ...init });
    return target === 'vercel' ? mod.default.fetch(request) : mod.default(request);
}

function extractSsrPayload(html) {
    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(String(payloadMatch[1]));
}

function hostedRuntimeRoot(projectRoot, target, routeName = 'index') {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', `${routeName}.func`);
    }
    return join(projectRoot, 'dist', 'functions', '_zenith');
}

function hostedImageEntrypoint(projectRoot, target) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', 'image.func', 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', '__zenith_image.mjs');
}

function expectHostedScopedFiles(projectRoot, target) {
    const root = hostedRuntimeRoot(projectRoot, target);
    expect(existsSync(join(root, 'scoped-server-data', 'runtime.js'))).toBe(true);
    expect(existsSync(join(root, 'scoped', 'src', 'layouts', 'DefaultLayout.zen.mjs'))).toBe(true);
    expect(existsSync(join(root, 'scoped', 'src', 'components', 'StatusCard.zen.mjs'))).toBe(true);

    expect(existsSync(hostedImageEntrypoint(projectRoot, target))).toBe(true);
    expect(existsSync(join(projectRoot, 'dist', target === 'vercel' ? 'static' : 'publish', 'scoped'))).toBe(false);
    expect(existsSync(join(projectRoot, 'dist', target === 'vercel' ? 'static' : 'publish', 'scoped-server-data'))).toBe(false);

    if (target === 'vercel') {
        const imageRoot = join(projectRoot, 'dist', 'functions', '__zenith', 'image.func');
        const resourceRoot = join(projectRoot, 'dist', 'functions', '__zenith', 'api_ping.func');
        expect(existsSync(join(imageRoot, 'scoped'))).toBe(false);
        expect(existsSync(join(imageRoot, 'scoped-server-data'))).toBe(false);
        expect(existsSync(join(resourceRoot, 'scoped'))).toBe(false);
        expect(existsSync(join(resourceRoot, 'scoped-server-data'))).toBe(false);
    }
}

describe('hosted scoped server runtime (#99B-1)', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test.each(['vercel', 'netlify'])('%s injects hosted route and singleton scoped payloads', async (target) => {
        projectRoot = await createProject(target, {
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const navigation = { title: "HOSTED_NAV_RUNTIME" }',
                '</script>',
                '<nav>{navigation.title}<slot /></nav>'
            ].join('\n'),
            'src/components/StatusCard.zen': [
                '<script server lang="ts">',
                'const stats = { count: 9, label: "HOSTED_CARD_RUNTIME" }',
                '</script>',
                '<p>{stats.label}:{stats.count}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ viewer: "Lin" }); }',
                '</script>',
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                'import StatusCard from "../components/StatusCard.zen";',
                '</script>',
                '<DefaultLayout><StatusCard /></DefaultLayout>'
            ].join('\n'),
            'src/pages/scoped-only.zen': [
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                '</script>',
                '<DefaultLayout><main>scoped only</main></DefaultLayout>'
            ].join('\n'),
            'src/pages/static-page.zen': '<main>static only</main>\n',
            'src/pages/api/ping.resource.ts': 'export function load(ctx) { return ctx.json({ ok: true }); }\n'
        });

        await cli(['build'], projectRoot);
        expectHostedScopedFiles(projectRoot, target);

        const response = await executeHostedRoute(projectRoot, target, 'index');
        expect(response.status).toBe(200);
        const payload = extractSsrPayload(await response.text());
        expect(payload.viewer).toBe('Lin');
        expect(payload.route).toEqual({ viewer: 'Lin' });
        expect(payload.scoped).toEqual({
            'layout:src/layouts/DefaultLayout.zen': {
                navigation: { title: 'HOSTED_NAV_RUNTIME' }
            },
            'component:src/components/StatusCard.zen': {
                stats: { count: 9, label: 'HOSTED_CARD_RUNTIME' }
            }
        });

        const scopedOnly = await executeHostedRoute(projectRoot, target, 'scoped_only');
        expect(scopedOnly.status).toBe(200);
        expect(extractSsrPayload(await scopedOnly.text()).scoped).toEqual({
            'layout:src/layouts/DefaultLayout.zen': {
                navigation: { title: 'HOSTED_NAV_RUNTIME' }
            }
        });

        const resource = await executeHostedRoute(projectRoot, target, 'api_ping');
        expect(resource.status).toBe(200);
        expect(await resource.json()).toEqual({ ok: true });
        expect(existsSync(hostedEntrypoint(projectRoot, target, 'static_page'))).toBe(false);

        const imageSource = await readFile(hostedImageEntrypoint(projectRoot, target), 'utf8');
        expect(imageSource).not.toContain('scoped-server-data');
        expect(imageSource).not.toContain('scoped/');
    });

    test.each(['vercel', 'netlify'])('%s does not copy scoped files when no hosted page needs them', async (target) => {
        projectRoot = await createProject(target, {
            'src/pages/plain.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ ok: true }); }',
                '</script>',
                '<main>plain</main>'
            ].join('\n')
        });

        await cli(['build'], projectRoot);
        const response = await executeHostedRoute(projectRoot, target, 'plain');
        expect(response.status).toBe(200);
        expect(extractSsrPayload(await response.text())).toEqual({ ok: true });
        expect(existsSync(join(hostedRuntimeRoot(projectRoot, target, 'plain'), 'scoped'))).toBe(false);
        expect(existsSync(join(hostedRuntimeRoot(projectRoot, target, 'plain'), 'scoped-server-data'))).toBe(false);
    });

    test.each(['vercel', 'netlify'])('%s short-circuits redirect and deny before scoped execution', async (target) => {
        projectRoot = await createProject(target, {
            'src/layouts/ExplodingLayout.zen': [
                '<script server lang="ts">',
                'const value = (() => { throw new Error("HOSTED_SCOPED_SHOULD_NOT_RUN"); })()',
                '</script>',
                '<main>{value}</main>'
            ].join('\n'),
            'src/pages/redirect.zen': [
                '<script server lang="ts">',
                'export function guard(ctx) { return ctx.redirect("/login", 307); }',
                '</script>',
                '<script lang="ts">import ExplodingLayout from "../layouts/ExplodingLayout.zen";</script>',
                '<ExplodingLayout />'
            ].join('\n'),
            'src/pages/deny.zen': [
                '<script server lang="ts">',
                'export function guard(ctx) { return ctx.deny(401, "Nope"); }',
                '</script>',
                '<script lang="ts">import ExplodingLayout from "../layouts/ExplodingLayout.zen";</script>',
                '<ExplodingLayout />'
            ].join('\n')
        });

        await cli(['build'], projectRoot);
        const redirect = await executeHostedRoute(projectRoot, target, 'redirect');
        expect(redirect.status).toBe(307);
        expect(redirect.headers.get('location')).toBe('/login');
        expect(await redirect.text()).not.toContain('HOSTED_SCOPED_SHOULD_NOT_RUN');

        const denied = await executeHostedRoute(projectRoot, target, 'deny');
        expect(denied.status).toBe(401);
        expect(await denied.text()).toBe('Nope');
    });

    test.each(['vercel', 'netlify'])('%s fails scoped owner errors without partial payloads', async (target) => {
        projectRoot = await createProject(target, {
            'src/layouts/ExplodingLayout.zen': [
                '<script server lang="ts">',
                'const value = (() => { throw new Error("HOSTED_SCOPED_THROW"); })()',
                '</script>',
                '<main>{value}</main>'
            ].join('\n'),
            'src/components/BadCard.zen': [
                '<script server lang="ts">',
                'export const data = async () => ({ bad: () => null })',
                '</script>',
                '<p>{data.bad}</p>'
            ].join('\n'),
            'src/pages/throw.zen': [
                '<script lang="ts">import ExplodingLayout from "../layouts/ExplodingLayout.zen";</script>',
                '<ExplodingLayout />'
            ].join('\n'),
            'src/pages/bad.zen': [
                '<script lang="ts">import BadCard from "../components/BadCard.zen";</script>',
                '<BadCard />'
            ].join('\n')
        });

        await cli(['build'], projectRoot);
        for (const routeName of ['throw', 'bad']) {
            const response = await executeHostedRoute(projectRoot, target, routeName);
            const body = await response.text();
            expect(response.status).toBe(500);
            expect(body).not.toContain('window.__zenith_ssr_data');
            expect(body).not.toContain('HOSTED_SCOPED_THROW');
        }
    });

    test('per-instance scoped execution remains deferred', async () => {
        await expect(executeScopedServerData({
            route: {
                route_kind: 'page',
                prerender: false,
                has_scoped_server_data: true,
                scoped_server_data: [{
                    ownerKind: 'component',
                    ownerKey: 'src/components/Card.zen',
                    syntax: 'variables',
                    exportName: 'data',
                    instanceStrategy: 'per-instance',
                    module: 'scoped/src/components/Card.zen.mjs'
                }]
            },
            ctx: {},
            loadModule: async () => ({ data: async () => ({ ok: true }) })
        })).rejects.toThrow('Per-instance scoped server data execution is deferred to #99B.');
    });

    test('hosted copy fails loudly when scoped modules are missing', async () => {
        projectRoot = await createProject('vercel', {
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const navigation = { title: "HOSTED_NAV_RUNTIME" }',
                '</script>',
                '<main>{navigation.title}<slot /></main>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">import DefaultLayout from "../layouts/DefaultLayout.zen";</script>',
                '<DefaultLayout />'
            ].join('\n')
        });
        await cli(['build'], projectRoot);
        await rm(join(projectRoot, '.zenith-output', 'server', 'scoped'), { recursive: true, force: true });
        await expect(copyHostedPageRuntime(
            join(projectRoot, '.zenith-output'),
            join(projectRoot, 'tmp-hosted-runtime'),
            { includeScopedServerData: true }
        )).rejects.toThrow('[Zenith:ScopedServerData] Compiled scoped server data modules are missing from server output.');
    });
});
