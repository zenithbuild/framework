import { build } from '../src/build.js';
import { createDevServer } from '../src/dev-server.js';
import { createPreviewServer } from '../src/preview.js';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

async function createFixtureProject(fixtureName) {
    const root = await mkdtemp(join(tmpdir(), `zenith-ts-server-${fixtureName}-`));
    await cp(join(FIXTURES_DIR, fixtureName), root, { recursive: true });
    return {
        root,
        pagesDir: join(root, 'pages'),
        outDir: join(root, 'dist')
    };
}

function extractSsrPayload(html) {
    const scriptMatches = html.match(/id="zenith-ssr-data"/g);
    expect(scriptMatches).toBeTruthy();
    expect(scriptMatches.length).toBe(1);

    const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{[\s\S]*?\});/);
    expect(payloadMatch).toBeTruthy();
    return JSON.parse(payloadMatch[1]);
}

async function fetchHtml(port, pathname = '/') {
    const response = await fetch(`http://localhost:${port}${pathname}`);
    expect(response.status).toBe(200);
    return response.text();
}

describe('.zen server script TypeScript transpilation parity', () => {
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

    test('typed load() in .zen executes successfully in both dev and preview', async () => {
        project = await createFixtureProject('ts-server-script-zen');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });
        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const devPayload = extractSsrPayload(await fetchHtml(dev.port, '/'));
        const previewPayload = extractSsrPayload(await fetchHtml(preview.port, '/'));

        expect(devPayload.__zenith_error).toBeUndefined();
        expect(previewPayload.__zenith_error).toBeUndefined();
        expect(devPayload).toEqual(previewPayload);
        expect(devPayload.ok).toBe(true);
        expect(devPayload.route).toEqual(expect.objectContaining({
            id: 'index',
            pattern: '/',
            file: expect.stringMatching(/index\.zen$/)
        }));
    });

    test('invalid extracted server script still returns LOAD_FAILED envelope', async () => {
        project = await createFixtureProject('ts-server-script-zen-invalid');
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });
        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const devPayload = extractSsrPayload(await fetchHtml(dev.port, '/'));
        const previewPayload = extractSsrPayload(await fetchHtml(preview.port, '/'));

        expect(devPayload.__zenith_error).toBeDefined();
        expect(previewPayload.__zenith_error).toBeDefined();
        expect(devPayload.__zenith_error.code).toBe('LOAD_FAILED');
        expect(previewPayload.__zenith_error.code).toBe('LOAD_FAILED');
        expect(String(devPayload.__zenith_error.message || '')).toContain('.zen');
        expect(String(previewPayload.__zenith_error.message || '')).toContain('.zen');
        expect(String(devPayload.__zenith_error.message || '')).not.toContain('server-script.ts');
        expect(String(previewPayload.__zenith_error.message || '')).not.toContain('server-script.ts');
    });
});
