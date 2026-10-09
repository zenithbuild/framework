import { expect, jest, test } from '@jest/globals';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildImageArtifacts } from '../src/images/service.js';
import { buildLocalVariantAssetPath } from '../src/images/shared.js';

test('fresh image variants skip encoding and source/config changes invalidate them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zenith-image-cache-'));
    const source = join(root, 'public', 'sample.png');
    const outDir = join(root, 'dist');
    await mkdir(join(root, 'public'));
    await sharp({ create: { width: 4, height: 3, channels: 3, background: 'red' } }).png().toFile(source);
    const config = { deviceSizes: [4], imageSizes: [4], formats: ['webp'], quality: 80 };
    const target = join(outDir, buildLocalVariantAssetPath('/sample.png', 4, 80, 'png').slice(1));
    const encoder = jest.spyOn(sharp.prototype, 'toBuffer');
    try {
        await buildImageArtifacts({ projectRoot: root, outDir, config });
        expect(encoder.mock.calls.length).toBeGreaterThan(0);
        expect(await sharp(await readFile(target)).metadata()).toMatchObject({ width: 4, height: 3, format: 'png' });
        const coldBytes = await readFile(target);
        const coldStat = await stat(target);
        encoder.mockClear();
        await buildImageArtifacts({ projectRoot: root, outDir, config });
        expect(encoder).not.toHaveBeenCalled();
        expect(await readFile(target)).toEqual(coldBytes);
        expect((await stat(target)).mtimeMs).toBe(coldStat.mtimeMs);

        await rm(outDir, { recursive: true, force: true });
        encoder.mockClear();
        await buildImageArtifacts({ projectRoot: root, outDir, config });
        expect(encoder).not.toHaveBeenCalled();
        expect(await readFile(target)).toEqual(coldBytes);

        await sharp({ create: { width: 4, height: 3, channels: 3, background: 'blue' } }).png().toFile(source);
        const changedTime = new Date(Date.now() + 2_000);
        await utimes(source, changedTime, changedTime);
        encoder.mockClear();
        await buildImageArtifacts({ projectRoot: root, outDir, config });
        expect(encoder.mock.calls.length).toBeGreaterThan(0);
        const pixels = await sharp(await readFile(target)).raw().toBuffer();
        expect([...pixels.slice(0, 3)]).toEqual([0, 0, 255]);

        encoder.mockClear();
        await buildImageArtifacts({ projectRoot: root, outDir, config: { ...config, quality: 60 } });
        expect(encoder.mock.calls.length).toBeGreaterThan(0);
        const changedTarget = join(outDir, buildLocalVariantAssetPath('/sample.png', 4, 60, 'webp').slice(1));
        expect(await sharp(await readFile(changedTarget)).metadata()).toMatchObject({ width: 4, height: 3, format: 'webp' });
    } finally {
        encoder.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
});