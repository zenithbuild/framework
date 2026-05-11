import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

function createMemoryLogger() {
    const entries = [];
    const record = (tag) => (message) => {
        entries.push({ tag, message: String(message || '') });
        return true;
    };

    return {
        entries,
        logger: {
            mode: { logLevel: 'normal' },
            build: record('build'),
            css: record('css'),
            dev: record('dev'),
            error: record('error'),
            hmr: record('hmr'),
            ok: record('ok'),
            router: record('router'),
            verbose: record('verbose'),
            warn: record('warn')
        }
    };
}

async function createProject() {
    const root = join(tmpdir(), `zenith-dev-config-change-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'src', 'pages');
    const outDir = join(root, 'dist');

    await mkdir(pagesDir, { recursive: true });
    await writeFile(join(pagesDir, 'index.zen'), '<main>Home</main>\n', 'utf8');
    await writeFile(join(root, 'zenith.config.js'), 'module.exports = { router: false };\n', 'utf8');

    return { root, pagesDir, outDir };
}

async function waitFor(predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for condition');
}

describe('Batch 5A dev config changes', () => {
    let project = null;
    let dev = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('root zenith.config changes warn and do not rebuild stale config', async () => {
        project = await createProject();
        const { entries, logger } = createMemoryLogger();

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { router: false },
            logger
        });

        const before = JSON.parse(await readFile(join(project.outDir, 'manifest.json'), 'utf8'));
        await writeFile(join(project.root, 'zenith.config.js'), 'module.exports = { router: true };\n', 'utf8');

        await waitFor(() => entries.find((entry) =>
            entry.tag === 'warn' &&
            entry.message === 'Config changed. Restart `zenith dev` to apply config updates.'
        ));
        await new Promise((resolve) => setTimeout(resolve, 120));

        const stateResponse = await fetch(`http://127.0.0.1:${dev.port}/__zenith_dev/state`);
        const state = await stateResponse.json();
        const after = JSON.parse(await readFile(join(project.outDir, 'manifest.json'), 'utf8'));

        expect(state.buildId).toBe(0);
        expect(after.content_hash).toBe(before.content_hash);
        expect(entries.some((entry) => entry.tag === 'build' && entry.message.startsWith('Rebuild'))).toBe(false);
    });
});
