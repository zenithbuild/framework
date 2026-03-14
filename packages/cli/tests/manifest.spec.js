// ---------------------------------------------------------------------------
// manifest.spec.js — Manifest engine tests
// ---------------------------------------------------------------------------

import { generateManifest, serializeManifest } from '../src/manifest.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Create a temp pages directory with the given file structure.
 *
 * @param {string[]} files - Relative file paths (e.g. 'index.zen', 'users/[id].zen')
 * @returns {Promise<string>} - Root pages dir path
 */
async function createPages(files) {
    const root = join(tmpdir(), `zenith-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });

    for (const file of files) {
        const fullPath = join(root, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, `<!-- ${file} -->`);
    }

    return root;
}

describe('generateManifest', () => {
    let pagesDir;

    afterEach(async () => {
        if (pagesDir) {
            await rm(pagesDir, { recursive: true, force: true });
            pagesDir = null;
        }
    });

    test('index.zen maps to /', async () => {
        pagesDir = await createPages(['index.zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/');
        expect(manifest[0].file).toBe('index.zen');
    });

    test('static page maps to /name', async () => {
        pagesDir = await createPages(['about.zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/about');
    });

    test('nested static pages', async () => {
        pagesDir = await createPages([
            'docs/api/index.zen',
            'docs/guide.zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(2);
        expect(manifest[0].path).toBe('/docs/api');
        expect(manifest[1].path).toBe('/docs/guide');
    });

    test('dynamic segment [param] maps to :param', async () => {
        pagesDir = await createPages(['users/[id].zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/users/:id');
    });

    test('multiple dynamic segments in nested paths', async () => {
        pagesDir = await createPages(['users/[userId]/posts/[postId].zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/users/:userId/posts/:postId');
    });

    test('catch-all segment [...slug] maps to *slug', async () => {
        pagesDir = await createPages(['docs/[...slug].zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/docs/*slug');
    });

    test('optional catch-all segment [[...slug]] maps to *slug?', async () => {
        pagesDir = await createPages(['[[...slug]].zen']);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/*slug?');
    });

    test('static routes sort before dynamic routes', async () => {
        pagesDir = await createPages([
            'users/[id].zen',
            'about.zen',
            'index.zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(3);
        // Static first: /, /about
        expect(manifest[0].path).toBe('/');
        expect(manifest[1].path).toBe('/about');
        // Dynamic last: /users/:id
        expect(manifest[2].path).toBe('/users/:id');
    });

    test('alphabetical sorting within static and dynamic groups', async () => {
        pagesDir = await createPages([
            'contact.zen',
            'about.zen',
            'blog/[slug].zen',
            'users/[id].zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest.map(e => e.path)).toEqual([
            '/about',
            '/contact',
            '/blog/:slug',
            '/users/:id'
        ]);
    });

    test('deterministic precedence ranks static > param > catch-all', async () => {
        pagesDir = await createPages([
            'docs/[...slug].zen',
            'docs/[section].zen',
            'docs/getting-started.zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest.map((entry) => entry.path)).toEqual([
            '/docs/getting-started',
            '/docs/:section',
            '/docs/*slug'
        ]);
    });

    test('optional catch-all stays in catch-all tier and static routes still win', async () => {
        pagesDir = await createPages([
            'about.zen',
            '[[...slug]].zen',
            '[id].zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest.map((entry) => entry.path)).toEqual([
            '/about',
            '/:id',
            '/*slug?'
        ]);
    });

    test('root [...slug] catch-all is emitted as /*slug and sorted after static/param routes', async () => {
        pagesDir = await createPages([
            '[...slug].zen',
            'about.zen',
            'blog/[slug].zen',
            'docs/[section]/[slug].zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest.map((entry) => entry.path)).toEqual([
            '/about',
            '/docs/:section/:slug',
            '/blog/:slug',
            '/*slug'
        ]);
    });

    test('rejects repeated param names in same route', async () => {
        pagesDir = await createPages(['a/[id]/b/[id].zen']);

        await expect(generateManifest(pagesDir)).rejects.toThrow('Repeated param name');
    });

    test('rejects non-terminal catch-all segments', async () => {
        pagesDir = await createPages(['a/[...slug]/b.zen']);

        await expect(generateManifest(pagesDir)).rejects.toThrow('Catch-all segment');
    });

    test('rejects duplicate concrete routes from different files', async () => {
        pagesDir = await createPages([
            'docs.zen',
            'docs/index.zen'
        ]);

        await expect(generateManifest(pagesDir)).rejects.toThrow('Duplicate route path');
    });

    test('rejects structurally ambiguous param siblings', async () => {
        pagesDir = await createPages([
            'users/[id].zen',
            'users/[slug].zen'
        ]);

        await expect(generateManifest(pagesDir)).rejects.toThrow('Ambiguous route patterns');
    });

    test('rejects structurally ambiguous catch-all siblings', async () => {
        pagesDir = await createPages([
            'docs/[...slug].zen',
            'docs/[...all].zen'
        ]);

        await expect(generateManifest(pagesDir)).rejects.toThrow('Ambiguous route patterns');
    });

    test('ignores non-.zen files', async () => {
        pagesDir = await createPages([
            'index.zen',
            'README.md',
            'styles.css'
        ]);
        // Manually create the non-.zen files
        await writeFile(join(pagesDir, 'README.md'), '# README');
        await writeFile(join(pagesDir, 'styles.css'), 'body {}');

        const manifest = await generateManifest(pagesDir);
        expect(manifest).toHaveLength(1);
        expect(manifest[0].path).toBe('/');
    });

    test('handles empty pages directory', async () => {
        pagesDir = await createPages([]);
        const manifest = await generateManifest(pagesDir);

        expect(manifest).toHaveLength(0);
    });

    test('handles nonexistent directory gracefully', async () => {
        const manifest = await generateManifest('/nonexistent/path/pages');
        expect(manifest).toHaveLength(0);
    });

    test('comprehensive site structure', async () => {
        pagesDir = await createPages([
            'index.zen',
            'about.zen',
            'contact.zen',
            'blog/index.zen',
            'blog/[slug].zen',
            'docs/api/index.zen',
            'docs/guide.zen',
            'users/[id].zen',
            'users/[id]/settings.zen'
        ]);
        const manifest = await generateManifest(pagesDir);

        const paths = manifest.map(e => e.path);

        // Static routes first, alpha sorted
        expect(paths.indexOf('/')).toBeLessThan(paths.indexOf('/users/:id'));
        expect(paths.indexOf('/about')).toBeLessThan(paths.indexOf('/blog/:slug'));
        expect(paths.indexOf('/blog')).toBeLessThan(paths.indexOf('/blog/:slug'));

        // All static before all dynamic
        const firstDynamic = paths.findIndex(p => p.includes(':'));
        const lastStatic = paths.length - 1 - [...paths].reverse().findIndex(p => !p.includes(':'));
        expect(lastStatic).toBeLessThan(firstDynamic);
    });

    test('manifest ordering is deterministic across repeated runs', async () => {
        pagesDir = await createPages([
            '[...slug].zen',
            'about.zen',
            'blog/[slug].zen',
            'docs/[section]/[slug].zen',
            'docs/index.zen',
            'index.zen'
        ]);

        const first = await generateManifest(pagesDir);
        const second = await generateManifest(pagesDir);
        expect(first.map((entry) => entry.path)).toEqual(second.map((entry) => entry.path));
    });
});

describe('serializeManifest', () => {
    test('produces valid module string', () => {
        const entries = [
            { path: '/', file: 'index.zen' },
            { path: '/about', file: 'about.zen' },
            { path: '/users/:id', file: 'users/[id].zen' }
        ];

        const output = serializeManifest(entries);

        expect(output).toContain("export default");
        expect(output).toContain("path: '/'");
        expect(output).toContain("path: '/about'");
        expect(output).toContain("path: '/users/:id'");
        expect(output).toContain("() => import('./pages/index.zen')");
        expect(output).toContain("(params) => import('./pages/users/[id].zen')");
    });

    test('empty manifest produces empty array', () => {
        const output = serializeManifest([]);
        expect(output).toContain('export default [\n\n];');
    });
});
