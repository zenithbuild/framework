import { build } from '../dist/build.js';
import { jest } from '@jest/globals';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

jest.setTimeout(45000);

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-typed-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function findBuiltPageAsset(outDir) {
    const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    const scriptMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/i);
    expect(scriptMatch).toBeTruthy();
    return join(outDir, String(scriptMatch?.[1] || '').replace(/^\//, ''));
}

describe('typed template expression emission', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('strips TypeScript annotations from emitted client expressions', async () => {
        project = await makeProject({
            'index.zen': [
                '<script lang="ts">',
                'const chips = ["alpha", "beta"];',
                '</script>',
                '<main>',
                '  {chips.map((chip: string, index: number) => `${index}:${chip}`).join(", ")}',
                '</main>',
            ].join('\n'),
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            showBundlerInfo: false,
            logger: null,
        });

        const assetPath = await findBuiltPageAsset(project.outDir);
        const asset = await readFile(assetPath, 'utf8');
        const syntax = spawnSync(process.execPath, ['--check', assetPath], {
            encoding: 'utf8',
        });

        expect(syntax.status).toBe(0);
        expect(syntax.stderr || '').not.toContain('Unexpected token');
        expect(asset).not.toContain('(chip: string');
        expect(asset).not.toContain('index: number');
    });
});
