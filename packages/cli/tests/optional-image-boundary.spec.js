import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { prepareProjectImages } from '../dist/project-images.js';

jest.setTimeout(45000);
let root;
let dev;
let preview;
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'zenith-no-image-'));
    await mkdir(join(root, 'pages'));
    await writeFile(join(root, 'pages', 'index.zen'), '<main>No image dependency</main>');
});
afterEach(async () => {
    if (dev) { await dev.close(); dev = null; }
    if (preview) { await preview.close(); preview = null; }
    await rm(root, { recursive: true, force: true });
});

test.each(['public raster', 'Image component'])('missing package fails before compilation/output mutation: %s', async (kind) => {
    const outDir = join(root, 'dist');
    await mkdir(outDir);
    await writeFile(join(outDir, 'keep.txt'), 'preserved');
    if (kind === 'public raster') {
        await mkdir(join(root, 'public'));
        await writeFile(join(root, 'public', 'hero.PNG'), 'invalid raster never reaches Sharp');
    } else {
        await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="https://example.com/a.png" alt="A" /></main>');
    }
    await expect(build({ pagesDir: join(root, 'pages'), outDir })).rejects.toThrow('npm i -D @zenithbuild/image@0.8.0');
    expect(await readFile(join(outDir, 'keep.txt'), 'utf8')).toBe('preserved');
    expect(existsSync(join(root, '.zenith-output'))).toBe(false);
});

test('no-image build, dev, preview and Node output need no image package or Sharp', async () => {
    const options = { pagesDir: join(root, 'pages'), outDir: join(root, 'dist'), config: { target: 'node' } };
    expect((await prepareProjectImages(root)).packageRoot).toBeNull();
    await build(options);
    const artifact = JSON.parse(await readFile(join(root, 'dist', 'package.json'), 'utf8'));
    expect(artifact.dependencies).toEqual({});
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
    dev = await createDevServer({ ...options, outDir: join(root, 'dev-dist'), port: 0, host: '127.0.0.1' });
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
        response = await fetch(`http://127.0.0.1:${dev.port}/`);
        if (response.status === 200) break;
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('No image dependency');
    // Preview uses the flat static directory produced by a static build.
    const staticOut = join(root, 'preview-dist');
    await build({ ...options, outDir: staticOut, config: {} });
    preview = await createPreviewServer({ projectRoot: root, distDir: staticOut, config: {}, port: 0, host: '127.0.0.1' });
    const page = await fetch(`http://127.0.0.1:${preview.port}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('No image dependency');
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
});
