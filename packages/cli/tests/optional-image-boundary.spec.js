import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { createProjectImageApi, prepareProjectImages, projectUsesImages } from '../dist/project-images.js';

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

test('missing package fails before compilation/output mutation when <Image> is used', async () => {
    const outDir = join(root, 'dist');
    await mkdir(outDir);
    await writeFile(join(outDir, 'keep.txt'), 'preserved');
    await writeFile(join(root, 'package-lock.json'), '{}');
    await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="https://example.com/a.png" alt="A" /></main>');
    await expect(build({ pagesDir: join(root, 'pages'), outDir })).rejects.toThrow('npm i -D @zenithbuild/image@0.9.0-rc.0');
    expect(await readFile(join(outDir, 'keep.txt'), 'utf8')).toBe('preserved');
    expect(existsSync(join(root, '.zenith-output'))).toBe(false);
});

const quietLogger = Object.fromEntries(
    ['build', 'childLine', 'css', 'dev', 'error', 'heading', 'hmr', 'ok', 'print', 'router', 'summary', 'verbose', 'warn']
        .map((name) => [name, () => {}])
);

test('a public raster alone does not require the package and is copied verbatim', async () => {
    await writeFile(join(root, 'bun.lock'), '');
    await mkdir(join(root, 'public'));
    await writeFile(join(root, 'public', 'favicon.PNG'), 'not a real raster; must not reach Sharp');
    const info = jest.fn();
    const outDir = join(root, 'dist');
    await build({ pagesDir: join(root, 'pages'), outDir, logger: { ...quietLogger, info } });
    expect(await readFile(join(outDir, 'favicon.PNG'), 'utf8')).toBe('not a real raster; must not reach Sharp');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('bun add -d @zenithbuild/image@0.9.0-rc.0'));
    expect(existsSync(join(outDir, '_zenith', 'image', 'package.json'))).toBe(false);
});

test('only the source directory is scanned for <Image>', async () => {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'example.zen'), '<Image src="/a.png" alt="A" />');
    expect(await projectUsesImages(root, join(root, 'pages'))).toBeNull();
    expect((await prepareProjectImages(root, join(root, 'pages'))).packageRoot).toBeNull();
});

test('preview resolves the image API once from the build marker, not from sources', async () => {
    await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="/a.png" alt="A" /></main>');
    const getImageApi = createProjectImageApi(root, join(root, 'dist'));
    const api = await getImageApi();
    expect(await getImageApi()).toBe(api);
    // No marker: the package-free API, whose runtime payload contract matches
    // the base output (unsafeHTML pages still receive it).
    expect(await api.createImageRuntimePayload()).toMatchObject({ mode: 'passthrough', basePath: '/', localImages: {} });
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
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
