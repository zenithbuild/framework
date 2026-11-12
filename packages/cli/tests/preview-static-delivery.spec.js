import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';
import { cli } from '../dist/index.js';
import { createPreviewServer } from '../dist/preview.js';
import { negotiateContentEncoding } from '../dist/static-delivery.js';
import { createTestProject, httpGet, localOrigin } from './helpers/dev-server-fixtures.js';
import {
    assertNoContentEncodingConfig,
    assertNoPrecompressedSidecars,
    decodeEncoded,
    expectExactPlain,
    expectJsonPlain,
    expectNegotiatedStatic,
    expectPlainContains,
    expectSkippedStatic,
    expectStaticCacheSplit,
    rawHttp
} from './helpers/static-delivery-http.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(180000);

const PAD = 'N'.repeat(2048);

describe('Accept-Encoding negotiation', () => {
    test.each([
        [undefined, 'identity'],
        ['', 'identity'],
        ['identity', 'identity'],
        ['gzip', 'gzip'],
        ['br, gzip', 'br'],
        ['gzip, br', 'br'],
        ['br;q=0, gzip', 'gzip'],
        ['gzip;q=0', 'identity'],
        ['gzip;q=0.000', 'identity'],
        ['br;q=0, gzip;q=0, identity;q=0', 'identity'],
        ['*', 'br'],
        ['*;q=0', 'identity'],
        ['*;q=0, gzip;q=0.8', 'gzip'],
        ['*;q=0, *;q=1', 'identity'],
        ['BR;q=0.1, gzip;q=1.0', 'br'],
        ['deflate', 'identity'],
        [' gzip ; q=0 , br ', 'br'],
        [['br;q=0', 'gzip'], 'gzip']
    ])('selects %j as %s', (header, expected) => {
        expect(negotiateContentEncoding(header)).toBe(expected);
    });
});

describe('preview static delivery', () => {
    let project = null;
    let preview = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('negotiates the default asset path and skips dynamic, small, and binary bodies', async () => {
        project = await createTestProject(['index.zen']);
        await writeFile(join(project.pagesDir, 'index.zen'), `<main>${PAD}</main>\n`, 'utf8');
        await mkdir(join(project.pagesDir, 'api'), { recursive: true });
        await writeFile(
            join(project.pagesDir, 'api', 'blob.resource.ts'),
            `export async function load(ctx) { return ctx.text(${JSON.stringify(PAD)}); }\n`,
            'utf8'
        );
        await mkdir(join(project.root, 'public'), { recursive: true });
        const appJs = `/* ${PAD} */\n`;
        const appCss = `/* ${PAD} */\n`;
        await writeFile(join(project.root, 'public', 'app.js'), appJs, 'utf8');
        await writeFile(join(project.root, 'public', 'app.css'), appCss, 'utf8');
        await writeFile(join(project.root, 'public', 'tiny.txt'), 'tiny', 'utf8');
        await writeFile(join(project.root, 'public', 'pixel.png'), 'p'.repeat(2048), 'utf8');
        await writeFile(join(project.root, 'public', 'archive.gz'), 'g'.repeat(2048), 'utf8');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        await assertNoPrecompressedSidecars(project.outDir);

        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });
        const origin = localOrigin(preview.port);
        const jsBytes = await readFile(join(project.outDir, 'app.js'));
        const cssBytes = await readFile(join(project.outDir, 'app.css'));
        expect(jsBytes.length).toBeGreaterThanOrEqual(1024);

        const identity = await httpGet(`${origin}/app.js`, { 'accept-encoding': 'identity' });
        expect(identity.status).toBe(200);
        expect(identity.body).toBe(jsBytes.toString('utf8'));
        expect(identity.headers['content-encoding']).toBeUndefined();
        expect(identity.headers.vary).toBe('Accept-Encoding');
        expect(identity.headers['content-type']).toBe('application/javascript; charset=utf-8');
        expect(Number(identity.headers['content-length'])).toBe(jsBytes.length);

        await expectNegotiatedStatic(`${origin}/app.js`, jsBytes, 'javascript');
        await expectNegotiatedStatic(`${origin}/app.css`, cssBytes, 'text/css');
        await expectSkippedStatic(`${origin}/tiny.txt`, await readFile(join(project.outDir, 'tiny.txt')), { charset: true });
        await expectSkippedStatic(`${origin}/pixel.png`, await readFile(join(project.outDir, 'pixel.png')));
        await expectSkippedStatic(`${origin}/archive.gz`, await readFile(join(project.outDir, 'archive.gz')));
        await expectExactPlain(`${origin}/api/blob`, PAD);
        await expectJsonPlain(`${origin}/__zenith/route-check?path=${encodeURIComponent(`/?${PAD}`)}`, {
            headers: { 'x-zenith-route-check': '1' },
            includes: PAD
        });
        const image = await rawHttp(`${origin}/_zenith/image`, {
            headers: { 'accept-encoding': 'br, gzip' }
        });
        expect(image.headers['content-encoding']).toBeUndefined();

        const home = await rawHttp(`${origin}/`, { headers: { 'accept-encoding': 'br, gzip' } });
        expect(home.headers['content-encoding']).toBeUndefined();
        expect(String(home.headers['cache-control'] || '')).not.toContain('immutable');
        expect(home.body.length).toBeGreaterThanOrEqual(1024);
        expect(home.body.includes(Buffer.from(PAD))).toBe(true);
        await expectStaticCacheSplit({
            origin,
            manifestPath: join(project.root, '.zenith-output', 'manifest.json'),
            staticRoot: project.outDir,
            publicPath: '/app.js',
            routeCheckPath: `/__zenith/route-check?path=${encodeURIComponent('/')}`,
            imagePath: '/_zenith/image'
        });

        const updated = Buffer.from(`/* ${'Q'.repeat(2048)} */\n`);
        await writeFile(join(project.outDir, 'app.js'), updated);
        const refreshed = await rawHttp(`${origin}/app.js`, { headers: { 'accept-encoding': 'gzip' } });
        expect(refreshed.headers['content-encoding']).toBe('gzip');
        expect(decodeEncoded(refreshed.body, 'gzip').equals(updated)).toBe(true);
        await assertNoPrecompressedSidecars(project.outDir);
    });

    test('negotiates static-export html and asset files', async () => {
        project = await createTestProject(['index.zen']);
        await writeFile(join(project.pagesDir, 'index.zen'), `<main>${PAD}</main>\n`, 'utf8');
        await mkdir(join(project.root, 'public'), { recursive: true });
        await writeFile(join(project.root, 'public', 'app.js'), `/* ${PAD} */\n`, 'utf8');
        await writeFile(
            join(project.root, 'zenith.config.js'),
            'module.exports = { target: "static-export" };\n',
            'utf8'
        );
        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { target: 'static-export' }
        });
        await assertNoPrecompressedSidecars(project.outDir);

        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });
        const origin = localOrigin(preview.port);
        const htmlBytes = await readFile(join(project.outDir, 'index.html'));
        expect(htmlBytes.length).toBeGreaterThanOrEqual(1024);
        expect(htmlBytes.includes(Buffer.from(PAD))).toBe(true);
        await expectNegotiatedStatic(`${origin}/`, htmlBytes, 'html');
        await expectNegotiatedStatic(`${origin}/index.html`, htmlBytes, 'html');
        await expectNegotiatedStatic(
            `${origin}/app.js`,
            await readFile(join(project.outDir, 'app.js')),
            'javascript'
        );
        await expectStaticCacheSplit({
            origin,
            manifestPath: join(project.root, '.zenith-output', 'manifest.json'),
            staticRoot: project.outDir,
            publicPath: '/app.js',
            htmlPath: '/',
            htmlRevalidates: true
        });
    });

    test.each(['vercel', 'netlify'])('%s output does not set Content-Encoding', async (target) => {
        project = await createTestProject(['index.zen']);
        await writeFile(join(project.pagesDir, 'index.zen'), '<main>Home</main>\n', 'utf8');
        await writeFile(
            join(project.root, 'zenith.config.js'),
            `module.exports = { target: "${target}" };\n`,
            'utf8'
        );
        await cli(['build'], project.root);
        await assertNoContentEncodingConfig(project.outDir);
    });

    test('honors basePath for hashed assets and leaves html, public files, and router manifest revalidated', async () => {
        project = await createTestProject(['index.zen']);
        await writeFile(join(project.pagesDir, 'index.zen'), `<main>${PAD}</main>\n`, 'utf8');
        await mkdir(join(project.root, 'public'), { recursive: true });
        await writeFile(join(project.root, 'public', 'app.js'), `/* ${PAD} */\n`, 'utf8');
        await writeFile(
            join(project.root, 'zenith.config.js'),
            'module.exports = { target: "static", basePath: "/docs" };\n',
            'utf8'
        );
        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { target: 'static', basePath: '/docs' }
        });
        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0,
            projectRoot: project.root,
            config: { target: 'static', basePath: '/docs' }
        });
        const origin = localOrigin(preview.port);
        await expectStaticCacheSplit({
            origin,
            manifestPath: join(project.root, '.zenith-output', 'manifest.json'),
            staticRoot: project.outDir,
            basePath: '/docs',
            publicPath: '/docs/app.js',
            htmlPath: '/docs/',
            htmlRevalidates: false
        });
        const direct = await rawHttp(`${origin}/assets/router-manifest.json`);
        expect(direct.status).toBe(404);
    });
});
