// ---------------------------------------------------------------------------
// build.spec.js — Build engine tests
// ---------------------------------------------------------------------------

import { build, contentHash, routeToOutputPath, stubCompile, stubBundle } from '../src/build.js';
import { mkdir, writeFile, rm, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function createTestProject(files) {
    const root = join(tmpdir(), `zenith-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const file of files) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, `<div>${file}</div>`);
    }

    return { root, pagesDir, outDir };
}

async function listFilesRecursive(dir) {
    const files = [];
    let items;
    try {
        items = await readdir(dir);
    } catch {
        return files;
    }
    for (const item of items) {
        const full = join(dir, item);
        const info = await stat(full);
        if (info.isDirectory()) {
            files.push(...await listFilesRecursive(full));
        } else {
            files.push(full);
        }
    }
    return files;
}

describe('routeToOutputPath', () => {
    test('root maps to index.html', () => {
        expect(routeToOutputPath('/')).toBe('index.html');
    });

    test('static route maps to dir/index.html', () => {
        expect(routeToOutputPath('/about')).toBe('about/index.html');
    });

    test('nested static route', () => {
        expect(routeToOutputPath('/docs/api')).toBe('docs/api/index.html');
    });

    test('dynamic route preserves bracket notation', () => {
        expect(routeToOutputPath('/users/:id')).toBe('users/[id]/index.html');
    });
});

describe('contentHash', () => {
    test('produces consistent hash for same input', () => {
        const a = contentHash('hello world');
        const b = contentHash('hello world');
        expect(a).toBe(b);
    });

    test('produces different hash for different input', () => {
        const a = contentHash('hello');
        const b = contentHash('world');
        expect(a).not.toBe(b);
    });

    test('hash is 8 chars hex', () => {
        const h = contentHash('test');
        expect(h).toMatch(/^[0-9a-f]{8}$/);
    });
});

describe('build', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('builds single page to dist/index.html', async () => {
        project = await createTestProject(['index.zen']);

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        expect(result.pages).toBe(1);
        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('<!DOCTYPE html>');
    });

    test('builds multiple pages to correct directories', async () => {
        project = await createTestProject([
            'index.zen',
            'about.zen',
            'docs/api/index.zen'
        ]);

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        expect(result.pages).toBe(3);

        const indexHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(indexHtml).toContain('<!DOCTYPE html>');

        const aboutHtml = await readFile(join(project.outDir, 'about/index.html'), 'utf8');
        expect(aboutHtml).toContain('<!DOCTYPE html>');

        const docsHtml = await readFile(join(project.outDir, 'docs/api/index.html'), 'utf8');
        expect(docsHtml).toContain('<!DOCTYPE html>');
    });

    test('no JS assets for static-only pages (stub)', async () => {
        project = await createTestProject(['index.zen']);

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        expect(result.assets).toHaveLength(0);
    });

    test('emits JS when page has expressions', async () => {
        project = await createTestProject(['index.zen']);

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            toolchain: {
                compile: async (file) => ({
                    file,
                    ir: { type: 'page', file },
                    hasExpressions: true
                }),
                bundle: async (ir) => ({
                    html: '<!DOCTYPE html><html><head></head><body></body></html>',
                    js: 'console.log("reactive")',
                    hasExpressions: true
                })
            }
        });

        expect(result.assets.length).toBeGreaterThan(0);
        expect(result.assets[0]).toMatch(/^assets\/[0-9a-f]+\.js$/);

        // Verify JS file exists
        const jsPath = join(project.outDir, result.assets[0]);
        const jsContent = await readFile(jsPath, 'utf8');
        expect(jsContent).toBe('console.log("reactive")');

        // Verify script tag injected in HTML
        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('<script type="module"');
    });

    test('emits CSS when provided', async () => {
        project = await createTestProject(['index.zen']);

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            toolchain: {
                compile: async (file) => ({
                    file,
                    ir: { type: 'page', file },
                    hasExpressions: false
                }),
                bundle: async (ir) => ({
                    html: '<!DOCTYPE html><html><head></head><body></body></html>',
                    css: 'body { color: red; }',
                    hasExpressions: false
                })
            }
        });

        const cssAsset = result.assets.find(a => a.endsWith('.css'));
        expect(cssAsset).toBeDefined();

        const cssContent = await readFile(join(project.outDir, cssAsset), 'utf8');
        expect(cssContent).toBe('body { color: red; }');

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('<link rel="stylesheet"');
    });

    test('rebuild produces identical hashes for identical input', async () => {
        project = await createTestProject(['index.zen']);

        const toolchain = {
            compile: async (file) => ({
                file,
                ir: { type: 'page', file },
                hasExpressions: true
            }),
            bundle: async (ir) => ({
                html: '<!DOCTYPE html><html><head></head><body></body></html>',
                js: 'const x = 1;',
                hasExpressions: true
            })
        };

        const result1 = await build({ pagesDir: project.pagesDir, outDir: project.outDir, toolchain });
        const result2 = await build({ pagesDir: project.pagesDir, outDir: project.outDir, toolchain });

        expect(result1.assets).toEqual(result2.assets);
    });

    test('compile and bundle called once per page', async () => {
        project = await createTestProject(['index.zen', 'about.zen']);

        let compileCount = 0;
        let bundleCount = 0;

        const result = await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            toolchain: {
                compile: async (file) => {
                    compileCount++;
                    return { file, ir: { type: 'page', file }, hasExpressions: false };
                },
                bundle: async (ir) => {
                    bundleCount++;
                    return {
                        html: '<!DOCTYPE html><html><head></head><body></body></html>',
                        hasExpressions: false
                    };
                }
            }
        });

        expect(compileCount).toBe(2);
        expect(bundleCount).toBe(2);
    });

    test('cleans output directory before build', async () => {
        project = await createTestProject(['index.zen']);

        // Create a stale file
        await mkdir(project.outDir, { recursive: true });
        await writeFile(join(project.outDir, 'stale.txt'), 'old');

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        const files = await listFilesRecursive(project.outDir);
        const stale = files.find(f => f.endsWith('stale.txt'));
        expect(stale).toBeUndefined();
    });
});
