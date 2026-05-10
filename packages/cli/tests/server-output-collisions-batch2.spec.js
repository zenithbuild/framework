import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-server-route-collision-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

function serverPage(label) {
    return [
        '<script server lang="ts">',
        'export async function load(ctx) {',
        `  return ctx.data({ label: ${JSON.stringify(label)} });`,
        '}',
        '</script>',
        `<main>${label}</main>`
    ].join('\n');
}

describe('Batch 2 server route output names', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('server output keeps distinct packages for routes whose normalized names collide', async () => {
        projectRoot = await createProject({
            'pages/foo-bar.zen': serverPage('dash'),
            'pages/foo_bar.zen': serverPage('underscore'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], projectRoot);

        const manifest = JSON.parse(
            await readFile(join(projectRoot, '.zenith-output', 'server', 'manifest.json'), 'utf8')
        );
        const routes = manifest.routes
            .filter((route) => route.path === '/foo-bar' || route.path === '/foo_bar')
            .sort((left, right) => left.path.localeCompare(right.path));
        const names = routes.map((route) => route.name);

        expect(new Set(routes.map((route) => route.path))).toEqual(new Set(['/foo-bar', '/foo_bar']));
        expect(new Set(names).size).toBe(2);
        for (const name of names) {
            expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', name, 'route', 'entry.js'))).toBe(true);
            expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', name, 'route.json'))).toBe(true);
        }
    });
});
