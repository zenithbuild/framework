// JUD-83: contract fixes for the optional @zenithbuild/image split.
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { ZENITH_TARGETS } from '@zenithbuild/config';
import { build } from '../dist/build.js';
import { KNOWN_TARGETS } from '../dist/adapters/adapter-types.js';
import { resolveBuildAdapter } from '../dist/adapters/resolve-adapter.js';
import { rewriteConfigSpecifiers, rewriteConfigSpecifiersInDir } from '../dist/package-image-runtime.js';
import { createProjectImageApi, imagePackageMarkerPath, prepareProjectImages } from '../dist/project-images.js';
import { installImagePackage } from './helpers/image-package.js';

jest.setTimeout(60000);

let root;
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'zenith-jud83-'));
    await mkdir(join(root, 'pages'));
});
afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function listFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await listFiles(path));
        else out.push(path);
    }
    return out;
}

describe('image runtime payload without @zenithbuild/image', () => {
    test('unsafeHTML pages still get the zenith-image-runtime script (base contract)', async () => {
        await writeFile(join(root, 'pages', 'index.zen'),
            '<script lang="ts">const html = "<b>x</b>";</script>\n<main><div unsafeHTML={html}></div></main>');
        await writeFile(join(root, 'pages', 'plain.zen'), '<main>plain</main>');
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir });
        const raw = await readFile(join(outDir, 'index.html'), 'utf8');
        const plain = await readFile(join(outDir, 'plain', 'index.html'), 'utf8');
        expect(raw).toContain('<script id="zenith-image-runtime">window.__zenith_image_runtime = ');
        expect(plain).not.toContain('zenith-image-runtime');
    });

    test('node server output renders the payload from a standalone image-config module', async () => {
        await writeFile(join(root, 'pages', 'index.zen'), '<main>plain</main>');
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir, config: { target: 'node' } });
        const serverDir = join(outDir, 'server');
        expect(existsSync(join(serverDir, 'image-config.js'))).toBe(true);
        expect(existsSync(join(serverDir, 'base-path.js'))).toBe(true);
        for (const file of await listFiles(serverDir)) {
            if (!/\.(m|c)?js$/.test(file)) continue;
            expect(await readFile(file, 'utf8')).not.toContain('@zenithbuild/config');
        }
        const mod = await import(join(serverDir, 'image-config.js'));
        expect(mod.injectImageRuntimePayload('<html><head></head><body data-zx-unsafeHTML="1"></body></html>', {}))
            .toContain('zenith-image-runtime');
    });
});

describe('hosted server functions without @zenithbuild/image', () => {
    async function buildHosted(target) {
        await writeFile(join(root, 'pages', 'ssr.zen'),
            '<script server lang="ts">export const load = async (ctx) => ({ ok: true });</script>\n<main>ssr</main>');
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir, config: { target } });
        return outDir;
    }
    const imageRequest = () => new Request('https://example.test/_zenith/image?url=%2Flogo.png&w=64&q=75');

    test('vercel functions ship image-config.js; SSR renders and the image endpoint is a 404 stub', async () => {
        const fnDir = join(await buildHosted('vercel'), 'functions', '__zenith');
        expect(existsSync(join(fnDir, 'ssr.func', 'image-config.js'))).toBe(true);
        const ssr = await import(join(fnDir, 'ssr.func', 'index.js'));
        expect((await ssr.default.fetch(new Request('https://example.test/ssr'))).status).toBe(200);
        const image = await import(join(fnDir, 'image.func', 'index.js'));
        expect((await image.default.fetch(imageRequest())).status).toBe(404);
    });

    test('netlify functions ship image-config.js; SSR renders and the image endpoint is a 404 stub', async () => {
        const fnDir = join(await buildHosted('netlify'), 'functions');
        expect(existsSync(join(fnDir, '_zenith', 'image-config.js'))).toBe(true);
        const ssr = await import(join(fnDir, '__zenith_ssr.mjs'));
        expect((await ssr.default(new Request('https://example.test/ssr'))).status).toBe(200);
        const image = await import(join(fnDir, '__zenith_image.mjs'));
        expect((await image.default(imageRequest())).status).toBe(404);
    });
});

describe('package-image-runtime specifier rewriting', () => {
    const serverDir = '/srv/out/server';
    const filePath = '/srv/out/server/images/nested/mod.js';

    test('rewrites static, side-effect, re-export and dynamic forms', () => {
        const source = [
            "import { a } from '@zenithbuild/config/base-path';",
            "export { b } from \"@zenithbuild/config/images\";",
            "import '@zenithbuild/config/images';",
            "const m = await import('@zenithbuild/config/base-path');",
            "import sharp from 'sharp';"
        ].join('\n');
        const out = rewriteConfigSpecifiers(source, { filePath, serverDir });
        expect(out).toContain("from '../../base-path.js'");
        expect(out).toContain('from "../../image-config.js"');
        expect(out).toContain("import '../../image-config.js'");
        expect(out).toContain("import('../../base-path.js')");
        expect(out).toContain("from 'sharp'");
        expect(out).not.toContain('@zenithbuild/');
    });

    test('fails loudly on an unmapped @zenithbuild specifier', () => {
        expect(() => rewriteConfigSpecifiers("import { x } from '@zenithbuild/config/plugins';", { filePath, serverDir }))
            .toThrow('no server runtime file for import specifier "@zenithbuild/config/plugins"');
        expect(() => rewriteConfigSpecifiers("export * from '@zenithbuild/core';", { filePath, serverDir }))
            .toThrow('@zenithbuild/core');
    });

    test('fails loudly when a config reference survives the rewrite', () => {
        expect(() => rewriteConfigSpecifiers("const id = require('@zenithbuild/config/images');", { filePath, serverDir }))
            .toThrow('an unrewritten @zenithbuild/config specifier remains');
    });

    test('rewrites every emitted module, including declarations', async () => {
        const dir = join(root, 'server', 'images');
        await mkdir(join(dir, 'deep'), { recursive: true });
        await writeFile(join(dir, 'a.js'), "export * from '@zenithbuild/config/images';\n");
        await writeFile(join(dir, 'deep', 'b.d.ts'), "export { x } from '@zenithbuild/config/base-path';\n");
        await rewriteConfigSpecifiersInDir(dir, join(root, 'server'));
        expect(await readFile(join(dir, 'a.js'), 'utf8')).toBe("export * from '../image-config.js';\n");
        expect(await readFile(join(dir, 'deep', 'b.d.ts'), 'utf8')).toBe("export { x } from '../../base-path.js';\n");
    });

    test('the packaged image runtime has no config references (real package)', async () => {
        await installImagePackage(root);
        await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="https://example.com/a.png" alt="A" width={10} height={10} /></main>');
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir, config: { target: 'node', images: { remotePatterns: [{ protocol: 'https', hostname: 'example.com' }] } } });
        for (const file of await listFiles(join(outDir, 'server'))) {
            if (!/\.(m|c)?js$|\.d\.ts$/.test(file)) continue;
            expect([file, (await readFile(file, 'utf8')).includes('@zenithbuild/config')]).toEqual([file, false]);
        }
    });
});

describe('image package marker', () => {
    test('is written outside the deployable output and bound to the outDir', async () => {
        await installImagePackage(root);
        await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="https://example.com/a.png" alt="A" width={10} height={10} /></main>');
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir, config: { images: { remotePatterns: [{ protocol: 'https', hostname: 'example.com' }] } } });
        expect(existsSync(join(outDir, '_zenith', 'image', 'package.json'))).toBe(false);
        const marker = JSON.parse(await readFile(imagePackageMarkerPath(root), 'utf8'));
        expect(marker).toMatchObject({ name: '@zenithbuild/image', outDir });
        const api = await createProjectImageApi(root, outDir)();
        expect(typeof api.handleImageRequest).toBe('function');
        // A different dist directory did not come from this build: no package API.
        const other = await createProjectImageApi(root, join(root, 'elsewhere'))();
        const res = { status: 0, writeHead(code) { this.status = code; }, end() {} };
        await other.handleImageRequest({}, res);
        expect(res.status).toBe(404);
    });
});

describe('missing package error', () => {
    test('names every project-relative file that uses <Image>', async () => {
        await writeFile(join(root, 'package-lock.json'), '{}');
        await mkdir(join(root, 'pages', 'blog'));
        await writeFile(join(root, 'pages', 'index.zen'), '<main><Image src="/a.png" alt="A" /></main>');
        await writeFile(join(root, 'pages', 'blog', 'post.zen'), '<main><Image src="/b.png" alt="B" /></main>');
        await writeFile(join(root, 'pages', 'about.zen'), '<main>no image</main>');
        await expect(build({ pagesDir: join(root, 'pages'), outDir: join(root, 'dist') })).rejects.toThrow(
            'requires @zenithbuild/image@0.8.0 because <Image> is used in pages/blog/post.zen, pages/index.zen. Run npm i -D @zenithbuild/image@0.8.0'
        );
    });
});

describe('user-defined Image.zen', () => {
    const page = '<main><Image src="/a.png" alt="A" /></main>';
    const component = '<figure class="user-image">user image</figure>';

    test('wins without the package: no missing-package error', async () => {
        await mkdir(join(root, 'components'));
        await writeFile(join(root, 'components', 'Image.zen'), component);
        await writeFile(join(root, 'pages', 'index.zen'), page);
        expect((await prepareProjectImages(root)).packageRoot).toBeNull();
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir });
        const html = await readFile(join(outDir, 'index.html'), 'utf8');
        expect(html).toContain('user-image');
        expect(html).not.toContain('data-zenith-image');
    });

    test('wins with the package installed: no duplicate component conflict', async () => {
        await installImagePackage(root);
        await mkdir(join(root, 'components'));
        await writeFile(join(root, 'components', 'Image.zen'), component);
        await writeFile(join(root, 'pages', 'index.zen'), page);
        const prepared = await prepareProjectImages(root);
        expect(prepared.componentPath).toBeNull();
        const outDir = join(root, 'dist');
        await build({ pagesDir: join(root, 'pages'), outDir });
        const html = await readFile(join(outDir, 'index.html'), 'utf8');
        expect(html).toContain('user-image');
        expect(html).not.toContain('data-zenith-image');
    });
});

describe('KNOWN_TARGETS', () => {
    test('is the config package target list (single source)', () => {
        expect(KNOWN_TARGETS).toBe(ZENITH_TARGETS);
    });

    test.each([...ZENITH_TARGETS])('config target %s has a CLI adapter (drift check)', (target) => {
        const resolved = resolveBuildAdapter({ target });
        expect(resolved.target).toBe(target);
        expect(typeof resolved.adapter.adapt).toBe('function');
    });
});
