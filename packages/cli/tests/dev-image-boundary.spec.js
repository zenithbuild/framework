import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDevBuildSession } from '../dist/dev-build-session/session.js';
import { installImagePackage } from './helpers/image-package.js';

test('adding/removing the first Image refreshes the dev component registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zenith-dev-image-boundary-'));
    const page = join(root, 'pages', 'index.zen');
    try {
        await mkdir(join(root, 'pages'));
        await writeFile(page, '<main>No images yet</main>');
        await installImagePackage(root);
        const session = createDevBuildSession({ pagesDir: join(root, 'pages'), outDir: join(root, 'dist') });
        await session.build();
        const noImageApi = await session.getImageApi();
        // Without the package the payload still comes from the shared image
        // config (it also serves unsafeHTML pages), but carries no images.
        const noImagePayload = session.getImageRuntimePayload();
        await writeFile(page, '<main><Image src="/hero.png" alt="Hero" /></main>');
        const added = await session.build({ changedFiles: [page] });
        expect(added.strategy).toBe('full');
        expect(await readFile(join(root, 'dist', 'index.html'), 'utf8')).not.toContain('<Image');
        expect(session.getImageRuntimePayload()).not.toBeNull();
        expect(await session.getImageApi()).not.toBe(noImageApi);
        await writeFile(page, '<main>Images removed</main>');
        const removed = await session.build({ changedFiles: [page] });
        expect(removed.strategy).toBe('full');
        expect(session.getImageRuntimePayload()).toEqual(noImagePayload);
        expect(await session.getImageApi()).toBe(noImageApi);
    } finally { await rm(root, { recursive: true, force: true }); }
});
