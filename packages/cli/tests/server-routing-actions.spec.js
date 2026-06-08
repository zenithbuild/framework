import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { jest } from '@jest/globals';
import { rm } from 'node:fs/promises';
import { makeProject, origin, extractSsrPayload, fetchText } from './helpers/server-routing-fixtures.js';

jest.setTimeout(90000);

describe('Server routing actions', () => {
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
});
