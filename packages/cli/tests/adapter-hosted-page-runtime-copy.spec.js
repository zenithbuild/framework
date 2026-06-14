import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    copyHostedGlobalMiddlewareRuntime,
    copyHostedPageRuntime
} from '../dist/adapters/copy-hosted-page-runtime.js';

async function writeFixtureFile(root, relativePath, contents = `${relativePath}\n`) {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
}

async function createCoreOutput() {
    const root = join(tmpdir(), `zenith-hosted-runtime-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const serverRoot = join(root, 'server');

    for (const dir of ['runtime', 'images', 'auth', 'server-contract']) {
        await writeFixtureFile(serverRoot, `${dir}/fixture.js`);
    }

    await writeFixtureFile(serverRoot, 'images/service.js', [
        "import sharp from 'sharp';",
        'export function service() { return sharp; }',
        ''
    ].join('\n'));

    for (const file of [
        'base-path.js',
        'server-contract.js',
        'server-middleware.js',
        'server-error.js',
        'resource-response.js',
        'download-result.js'
    ]) {
        await writeFixtureFile(serverRoot, file);
    }

    return root;
}

describe('hosted page runtime copy helper', () => {
    let root = null;

    afterEach(async () => {
        if (root) {
            await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            root = null;
        }
    });

    test('copies hosted page runtime directories and files with hosted sharp fallback', async () => {
        root = await createCoreOutput();
        const targetDir = join(root, 'hosted');

        await copyHostedPageRuntime(root, targetDir);

        for (const dir of ['runtime', 'images', 'auth', 'server-contract']) {
            expect(existsSync(join(targetDir, dir, 'fixture.js'))).toBe(true);
        }
        for (const file of [
            'base-path.js',
            'server-contract.js',
            'server-middleware.js',
            'server-error.js',
            'resource-response.js',
            'download-result.js'
        ]) {
            expect(await readFile(join(targetDir, file), 'utf8')).toBe(`${file}\n`);
        }

        const serviceSource = await readFile(join(targetDir, 'images', 'service.js'), 'utf8');
        expect(serviceSource).toContain("import sharp from './sharp-runtime.js';");
        expect(serviceSource).not.toContain("import sharp from 'sharp';");

        const sharpRuntimeSource = await readFile(join(targetDir, 'images', 'sharp-runtime.js'), 'utf8');
        expect(sharpRuntimeSource).toContain("await import('sharp')");
        expect(sharpRuntimeSource).toContain('export default sharp;');
    });

    test('copies scoped server data runtime only when requested', async () => {
        root = await createCoreOutput();
        await writeFixtureFile(root, 'server/scoped-server-data/runtime.js', 'export const runtime = true;\n');
        await writeFixtureFile(root, 'server/scoped/src/components/Card.zen.mjs', 'export const data = true;\n');

        await copyHostedPageRuntime(root, join(root, 'plain-hosted'));
        expect(existsSync(join(root, 'plain-hosted', 'scoped-server-data'))).toBe(false);
        expect(existsSync(join(root, 'plain-hosted', 'scoped'))).toBe(false);

        const scopedTarget = join(root, 'scoped-hosted');
        await copyHostedPageRuntime(root, scopedTarget, { includeScopedServerData: true });
        expect(await readFile(join(scopedTarget, 'scoped-server-data', 'runtime.js'), 'utf8')).toBe('export const runtime = true;\n');
        expect(await readFile(join(scopedTarget, 'scoped', 'src', 'components', 'Card.zen.mjs'), 'utf8')).toBe('export const data = true;\n');
    });

    test('copies global middleware runtime only when manifest selects it', async () => {
        root = await createCoreOutput();
        expect(await copyHostedGlobalMiddlewareRuntime(root, join(root, 'no-manifest'))).toBeNull();

        await writeFixtureFile(root, 'server/manifest.json', JSON.stringify({ routes: [] }));
        expect(await copyHostedGlobalMiddlewareRuntime(root, join(root, 'no-middleware'))).toBeNull();

        await writeFixtureFile(root, 'server/manifest.json', JSON.stringify({
            global_middleware: { module: 'global-middleware/entry.js' }
        }));
        await writeFixtureFile(root, 'server/global-middleware/entry.js', 'export default function middleware() {}\n');
        await writeFixtureFile(root, 'server/global-middleware/modules/helper.js', 'export const helper = true;\n');

        const targetDir = join(root, 'middleware-hosted');
        await expect(copyHostedGlobalMiddlewareRuntime(root, targetDir)).resolves.toBe('global-middleware/entry.js');
        expect(await readFile(join(targetDir, 'global-middleware', 'entry.js'), 'utf8')).toBe('export default function middleware() {}\n');
        expect(await readFile(join(targetDir, 'global-middleware', 'modules', 'helper.js'), 'utf8')).toBe('export const helper = true;\n');
    });
});
