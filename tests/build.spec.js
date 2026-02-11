import { build } from '../src/build.js';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-build-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function walkFiles(dir) {
    const out = [];
    async function walk(current) {
        let entries = [];
        try {
            entries = await readdir(current);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const entry of entries) {
            const full = join(current, entry);
            const children = await readdir(full).catch(() => null);
            if (children) {
                await walk(full);
                continue;
            }
            out.push(full);
        }
    }

    await walk(dir);
    out.sort((a, b) => a.localeCompare(b));
    return out;
}

describe('build orchestration', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('spawns compiler and bundler processes to emit route output', async () => {
        project = await makeProject({
            'index.zen': '<main><h1>{title}</h1></main>\n',
            'about.zen': '<main><h1>About</h1></main>\n'
        });

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        expect(result.pages).toBe(2);
        expect((await readFile(join(project.outDir, 'index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);
        expect((await readFile(join(project.outDir, 'about/index.html'), 'utf8')).includes('<!DOCTYPE html>')).toBe(true);

        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(indexHtml.includes('<script type="module"')).toBe(true);
        expect(result.assets.some((asset) => asset.endsWith('.js'))).toBe(true);
    });

    test('build output remains stable for identical input', async () => {
        project = await makeProject({
            'index.zen': '<main><p>{count}</p></main>\n',
            'users/[id].zen': '<main><h1>User {params.id}</h1></main>\n'
        });

        const first = await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const filesA = await walkFiles(project.outDir);
        const contentA = await Promise.all(filesA.map((file) => readFile(file, 'utf8')));

        const second = await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        const filesB = await walkFiles(project.outDir);
        const contentB = await Promise.all(filesB.map((file) => readFile(file, 'utf8')));

        expect(first.pages).toBe(second.pages);
        expect(first.assets).toEqual(second.assets);
        expect(filesA).toEqual(filesB);
        expect(contentA).toEqual(contentB);
    });
});
