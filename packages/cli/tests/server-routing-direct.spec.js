import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { jest } from '@jest/globals';
import { rm } from 'node:fs/promises';
import { makeProject, origin, extractSsrPayload, fetchText } from './helpers/server-routing-fixtures.js';

jest.setTimeout(90000);

describe('Server routing direct requests', () => {
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
});
