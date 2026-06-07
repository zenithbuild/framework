import { createPreviewServer } from '../dist/preview.js';
import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestProject, httpGet, localOrigin } from './helpers/dev-server-fixtures.js';

jest.setTimeout(45000);

describe('Preview static routing', () => {
    let project;
    let preview;

    afterEach(async () => {
        if (preview) { preview.close(); preview = null; }
        if (project) { await rm(project.root, { recursive: true, force: true }); project = null; }
    });

    test('serves static files from dist', async () => {
        project = await createTestProject(['index.zen']);

        // Build first
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`${localOrigin(preview.port)}/`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
        // Preview should NOT inject HMR
        expect(res.body).not.toContain('__zenith_hmr');
    });

    test('returns 404 for missing files', async () => {
        project = await createTestProject(['index.zen']);
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`${localOrigin(preview.port)}/nothing`);
        expect(res.status).toBe(404);
    });

    test('rewrites dynamic hard-load paths using build router manifest', async () => {
        project = await createTestProject([
            'index.zen',
            'users/[id].zen'
        ]);

        await writeFile(
            join(project.pagesDir, 'index.zen'),
            '<main><a href="/users/42">User</a></main>',
            'utf8'
        );
        await writeFile(
            join(project.pagesDir, 'users/[id].zen'),
            '<main><h1 id="user">{params.id}</h1></main>',
            'utf8'
        );

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true }
        });

        const manifest = JSON.parse(
            await readFile(join(project.outDir, 'assets', 'router-manifest.json'), 'utf8')
        );
        const routePaths = Array.isArray(manifest.routes)
            ? manifest.routes.map((entry) => entry.path).sort()
            : [];
        expect(routePaths).toEqual(['/', '/users/:id']);

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const dynamic = await httpGet(`${localOrigin(preview.port)}/users/42`);
        const unknown = await httpGet(`${localOrigin(preview.port)}/unknown/42`);
        const traversal = await httpGet(`${localOrigin(preview.port)}/%2e%2e/%2e%2e/etc/passwd`);

        expect(dynamic.status).toBe(200);
        expect(dynamic.body).toContain('<!DOCTYPE html>');
        expect(dynamic.body).toContain('data-zx-router');
        expect(unknown.status).toBe(404);
        expect(traversal.status).toBe(404);
    });
});
