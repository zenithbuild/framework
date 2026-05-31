import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { executeScopedServerData } from '../dist/scoped-server-data/runtime.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(90000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-scoped-server-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const filePath = join(root, relativePath);
        await mkdir(join(filePath, '..'), { recursive: true });
        await writeFile(filePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist'),
        devOutDir: join(root, 'dev-dist')
    };
}

async function startTargets(project) {
    const config = { target: 'node', router: true };
    await build({ pagesDir: project.pagesDir, outDir: project.outDir, projectRoot: project.root, config });
    const nodeMod = await import(pathToFileURL(join(project.outDir, 'index.js')).href);
    const node = await nodeMod.createNodeServer({ distDir: project.outDir, port: 0, host: '127.0.0.1' });
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
    return [
        { name: 'node', server: node, origin: `http://127.0.0.1:${node.port}` },
        { name: 'dev', server: dev, origin: `http://127.0.0.1:${dev.port}` },
        { name: 'preview', server: preview, origin: `http://127.0.0.1:${preview.port}` }
    ];
}

async function fetchText(origin, path, options = {}) {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual', ...options });
    return {
        status: response.status,
        headers: response.headers,
        body: await response.text()
    };
}

function payloadFromHtml(html) {
    const match = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(match).toBeTruthy();
    return JSON.parse(String(match[1]));
}

describe('scoped server runtime (#99A)', () => {
    let project = null;
    let targets = [];

    afterEach(async () => {
        for (const target of targets) {
            target.server.close();
        }
        targets = [];
        if (project) {
            await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            project = null;
        }
    });

    test('node, dev, and preview inject route and singleton scoped payloads', async () => {
        project = await createProject({
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const navigation = { title: "CSV_NAV_RUNTIME" }',
                '</script>',
                '<nav>{navigation.title}<slot /></nav>'
            ].join('\n'),
            'src/components/StatusCard.zen': [
                '<script server lang="ts">',
                'const stats = { count: 7, label: "CSV_CARD_RUNTIME" }',
                '</script>',
                '<p>{stats.label}:{stats.count}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script server lang="ts">',
                'export function load(ctx) { return ctx.data({ viewer: "Ada" }); }',
                '</script>',
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                'import StatusCard from "../components/StatusCard.zen";',
                '</script>',
                '<DefaultLayout><StatusCard /></DefaultLayout>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(200);
            const payload = payloadFromHtml(response.body);
            expect(payload.viewer).toBe('Ada');
            expect(payload.route).toEqual({ viewer: 'Ada' });
            expect(payload.scoped).toEqual({
                'layout:src/layouts/DefaultLayout.zen': {
                    navigation: { title: 'CSV_NAV_RUNTIME' }
                },
                'component:src/components/StatusCard.zen': {
                    stats: { count: 7, label: 'CSV_CARD_RUNTIME' }
                }
            });
        }

        const staticHtml = await readFile(join(project.outDir, 'static', 'index.html'), 'utf8');
        expect(staticHtml).not.toContain('CSV_NAV_RUNTIME');
        expect(staticHtml).not.toContain('CSV_CARD_RUNTIME');
    });

    test('guard redirect short-circuits before scoped owner execution', async () => {
        project = await createProject({
            'src/layouts/ExplodingLayout.zen': [
                '<script server lang="ts">',
                'const value = (() => { throw new Error("SCOPED_SHOULD_NOT_RUN"); })()',
                '</script>',
                '<main>{value}</main>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script server lang="ts">',
                'export function guard(ctx) { return ctx.redirect("/login", 307); }',
                '</script>',
                '<script lang="ts">',
                'import ExplodingLayout from "../layouts/ExplodingLayout.zen";',
                '</script>',
                '<ExplodingLayout />'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(307);
            expect(response.headers.get('location')).toBe('/login');
            expect(response.body).not.toContain('SCOPED_SHOULD_NOT_RUN');
        }
    });

    test('node, dev, and preview execute singleton and repeated component props', async () => {
        project = await createProject({
            'src/components/Badge.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ label: props.label })',
                '</script>',
                '<span>{data.label}</span>'
            ].join('\n'),
            'src/components/Card.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ title: props.title, count: props.count })',
                '</script>',
                '<p>{data.title}:{data.count}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import Badge from "../components/Badge.zen";',
                'import Card from "../components/Card.zen";',
                '</script>',
                '<main>',
                '<Badge label="singleton" />',
                '<Card title="First" count={1} />',
                '<Card title="Second" count={2} />',
                '</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(200);
            const payload = payloadFromHtml(response.body);
            expect(payload.scoped).toEqual({
                'component:src/components/Badge.zen': {
                    label: 'singleton'
                },
                'component:src/components/Card.zen:o0': {
                    title: 'First',
                    count: 1
                },
                'component:src/components/Card.zen:o1': {
                    title: 'Second',
                    count: 2
                }
            });
        }
    });

    test('scoped owner failures are fatal and do not expose partial payloads', async () => {
        project = await createProject({
            'src/layouts/ExplodingLayout.zen': [
                '<script server lang="ts">',
                'const value = (() => { throw new Error("SCOPED_RUNTIME_THROW"); })()',
                '</script>',
                '<main>{value}</main>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import ExplodingLayout from "../layouts/ExplodingLayout.zen";',
                '</script>',
                '<ExplodingLayout />'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(500);
            expect(response.body).not.toContain('window.__zenith_ssr_data');
            expect(response.body).not.toContain('SCOPED_RUNTIME_THROW');
        }
    });

    test('non-serializable scoped returns fail clearly', async () => {
        project = await createProject({
            'src/components/BadCard.zen': [
                '<script server lang="ts">',
                'export const data = async () => ({ bad: () => null })',
                '</script>',
                '<p>{data.bad}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import BadCard from "../components/BadCard.zen";',
                '</script>',
                '<BadCard />'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const response = await fetchText(target.origin, '/');
            expect(response.status).toBe(500);
            expect(response.body).not.toContain('window.__zenith_ssr_data');
        }
    });

    test('route-check, resources, static assets, image requests, and 404s do not execute scoped owners', async () => {
        project = await createProject({
            'src/layouts/ExplodingLayout.zen': [
                '<script server lang="ts">',
                'const value = (() => { throw new Error("SCOPED_EXCLUDED_PATH"); })()',
                '</script>',
                '<main>{value}</main>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import ExplodingLayout from "../layouts/ExplodingLayout.zen";',
                '</script>',
                '<ExplodingLayout />'
            ].join('\n'),
            'src/api/ping.resource.ts': 'export function load(ctx) { return ctx.json({ ok: true }); }\n',
            'zenith.config.js': 'module.exports = { target: "node", router: true };\n'
        });
        targets = await startTargets(project);

        for (const target of targets) {
            const routeCheck = await fetchText(target.origin, '/__zenith/route-check?path=/', {
                headers: { 'x-zenith-route-check': '1' }
            });
            expect(routeCheck.status).toBe(200);
            expect(routeCheck.body).not.toContain('SCOPED_EXCLUDED_PATH');

            const resource = await fetchText(target.origin, '/api/ping');
            expect(resource.status).toBe(200);
            expect(resource.body).toContain('"ok":true');

            const asset = await fetchText(target.origin, '/assets/missing.js');
            expect(asset.status).toBe(404);
            expect(asset.body).not.toContain('SCOPED_EXCLUDED_PATH');

            const image = await fetchText(target.origin, '/_zenith/image');
            expect([400, 404, 500].includes(image.status)).toBe(true);
            expect(image.body).not.toContain('SCOPED_EXCLUDED_PATH');

            const missing = await fetchText(target.origin, '/missing');
            expect(missing.status).toBe(404);
            expect(missing.body).not.toContain('SCOPED_EXCLUDED_PATH');
        }
    });

    test('per-instance scoped execution requires instance metadata', async () => {
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
        })).rejects.toThrow('Per-instance scoped server data owner "src/components/Card.zen" is missing instance metadata.');
    });
});
