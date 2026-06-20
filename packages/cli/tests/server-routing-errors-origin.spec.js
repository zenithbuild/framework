import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { jest } from '@jest/globals';
import { rm } from 'node:fs/promises';
import { makeProject, origin, extractSsrPayload, fetchText, requestText } from './helpers/server-routing-fixtures.js';

jest.setTimeout(90000);

describe('Server routing errors and origin handling', () => {
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

    test('thrown guard, load, and action errors return sanitized 500 responses in dev and preview', async () => {
        project = await makeProject({
            'throw-guard.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  void ctx;',
                '  throw new Error("GUARD_SECRET_SHOULD_NOT_LEAK");',
                '}',
                'export async function load(ctx) {',
                '  return ctx.data({ shouldNotRun: true });',
                '}',
                '</script>',
                '<html><head></head><body><main>Guard</main></body></html>'
            ].join('\n'),
            'throw-load.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  return ctx.allow();',
                '}',
                'export async function load(ctx) {',
                '  void ctx;',
                '  throw new Error("LOAD_SECRET_SHOULD_NOT_LEAK");',
                '}',
                '</script>',
                '<html><head></head><body><main>Load</main></body></html>'
            ].join('\n'),
            'throw-action.zen': [
                '<script server lang="ts">',
                'export async function guard(ctx) {',
                '  return ctx.allow();',
                '}',
                'export async function action(ctx) {',
                '  void ctx;',
                '  throw new Error("ACTION_SECRET_SHOULD_NOT_LEAK");',
                '}',
                'export async function load(ctx) {',
                '  return ctx.data({ shouldNotRun: true });',
                '}',
                '</script>',
                '<html><head></head><body><main>Action</main></body></html>'
            ].join('\n')
        });

        const expectedServerErrors = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await build({ pagesDir: project.pagesDir, outDir: project.outDir });
            dev = await createDevServer({ pagesDir: project.pagesDir, outDir: project.outDir, port: 0 });
            preview = await createPreviewServer({ distDir: project.outDir, port: 0 });

            const cases = [
                { path: '/throw-guard', secret: 'GUARD_SECRET_SHOULD_NOT_LEAK' },
                { path: '/throw-load', secret: 'LOAD_SECRET_SHOULD_NOT_LEAK' },
                {
                    path: '/throw-action',
                    secret: 'ACTION_SECRET_SHOULD_NOT_LEAK',
                    options: {
                        method: 'POST',
                        headers: { 'content-type': 'application/x-www-form-urlencoded' },
                        body: 'save=1'
                    }
                }
            ];

            for (const testCase of cases) {
                const devResponse = await fetchText(origin(dev.port), testCase.path, testCase.options || {});
                const previewResponse = await fetchText(origin(preview.port), testCase.path, testCase.options || {});

                for (const response of [devResponse, previewResponse]) {
                    expect(response.status).toBe(500);
                    expect(response.body).toBe('Internal Server Error');
                    expect(response.body).not.toContain(testCase.secret);
                }
                expect(previewResponse.body).toBe(devResponse.body);
            }
        } finally {
            expectedServerErrors.mockRestore();
        }
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
