import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-platform-static-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

describe('platform static adapters', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('vercel-static emits a Build Output API layout with route rewrites', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>home</main>\n',
            'pages/users/[id].zen': '<main>{params.id}</main>\n',
            'zenith.config.js': 'module.exports = { target: "vercel-static" };\n'
        });

        await cli(['build'], projectRoot);

        const config = JSON.parse(await readFile(join(projectRoot, 'dist', 'config.json'), 'utf8'));
        expect(config).toMatchObject({
            version: 3,
            routes: expect.arrayContaining([
                { handle: 'filesystem' },
                { src: '^/?$', dest: '/index.html' },
                { src: '^/users/([^/]+)/?$', dest: '/users/__param_id/index.html' }
            ])
        });
        expect(existsSync(join(projectRoot, 'dist', 'static', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'static', 'users', '__param_id', 'index.html'))).toBe(true);
    });

    test('netlify-static emits a publish directory with rewrite rules', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>home</main>\n',
            'pages/docs/[...slug].zen': '<main>{params.slug}</main>\n',
            'zenith.config.js': 'module.exports = { target: "netlify-static" };\n'
        });

        await cli(['build'], projectRoot);

        const redirects = await readFile(join(projectRoot, 'dist', '_redirects'), 'utf8');
        expect(redirects).toContain('/ /index.html 200');
        expect(redirects).toContain('/docs/* /docs/__splat_slug/index.html 200');
        expect(existsSync(join(projectRoot, 'dist', 'docs', '__splat_slug', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'index.html'))).toBe(true);
    });

    test('static deployment adapters still reject server render_mode routes', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export const data = { ok: true };',
                '</script>',
                '<main>{data.ok}</main>'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "vercel-static" };\n'
        });

        await expect(cli(['build'], projectRoot)).rejects.toThrow(
            'target "vercel-static" cannot emit server-rendered routes'
        );
    });

    test('vercel-static applies basePath to public route sources while keeping static assets packaged once', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>home</main>\n',
            'pages/guides/[slug].zen': '<main>{params.slug}</main>\n',
            'zenith.config.js': 'module.exports = { target: "vercel-static", basePath: "/docs" };\n'
        });

        await cli(['build'], projectRoot);

        const config = JSON.parse(await readFile(join(projectRoot, 'dist', 'config.json'), 'utf8'));
        expect(config.routes).toEqual(expect.arrayContaining([
            { src: '^/docs/assets/(.+)$', dest: '/assets/$1' },
            { handle: 'filesystem' },
            { src: '^/docs/?$', dest: '/index.html' },
            { src: '^/docs/guides/([^/]+)/?$', dest: '/guides/__param_slug/index.html' }
        ]));
        expect(existsSync(join(projectRoot, 'dist', 'static', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'static', 'guides', '__param_slug', 'index.html'))).toBe(true);
    });

    test('netlify-static applies basePath to public rewrites while keeping asset files flat', async () => {
        projectRoot = await createProject({
            'pages/index.zen': '<main>home</main>\n',
            'pages/guides/[...slug].zen': '<main>{params.slug}</main>\n',
            'zenith.config.js': 'module.exports = { target: "netlify-static", basePath: "/docs" };\n'
        });

        await cli(['build'], projectRoot);

        const redirects = await readFile(join(projectRoot, 'dist', '_redirects'), 'utf8');
        expect(redirects).toContain('/docs/assets/* /assets/:splat 200');
        expect(redirects).toContain('/docs /index.html 200');
        expect(redirects).toContain('/docs/guides/* /guides/__splat_slug/index.html 200');
        expect(existsSync(join(projectRoot, 'dist', 'guides', '__splat_slug', 'index.html'))).toBe(true);
        expect(existsSync(join(projectRoot, 'dist', 'index.html'))).toBe(true);
    });
});
