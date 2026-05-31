import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';
import {
    resolveScopedServerModuleOutputPath,
    scopedServerModulePathForOwnerKey
} from '../dist/scoped-server-data/lowering.js';

jest.setTimeout(60000);

const SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE =
    '[Zenith:ScopedServerData] Server-output lowering helper is unavailable. Run the CLI build step before packaging scoped server data modules.';

async function createProject(files) {
    const root = join(tmpdir(), `zenith-scoped-server-output-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return root;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readTextFiles(root) {
    const out = [];

    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            out.push({
                path: fullPath,
                source: await readFile(fullPath, 'utf8')
            });
        }
    }

    await walk(root);
    return out;
}

function baseConfig() {
    return 'module.exports = { target: "node" };\n';
}

describe('scoped server output packaging (#98)', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
            projectRoot = null;
        }
    });

    test('source server-output import does not require prebuilt scoped lowering helper', async () => {
        const helperPath = fileURLToPath(
            new URL('../dist/scoped-server-data/lowering.js', import.meta.url)
        );
        const hiddenHelperPath = `${helperPath}.source-import-test-${process.pid}-${Date.now()}`;

        expect(existsSync(helperPath)).toBe(true);
        await rename(helperPath, hiddenHelperPath);

        try {
            const sourceServerOutputUrl = new URL(
                `../src/server-output.js?source-import-no-dist=${Date.now()}`,
                import.meta.url
            );
            const result = spawnSync(process.execPath, [
                '--input-type=module',
                '-e',
                [
                    "import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';",
                    "import { join } from 'node:path';",
                    "import { tmpdir } from 'node:os';",
                    `const serverOutput = await import(${JSON.stringify(sourceServerOutputUrl.href)});`,
                    'if (typeof serverOutput.writeServerOutput !== "function") throw new Error("missing writeServerOutput export");',
                    'const root = mkdtempSync(join(tmpdir(), "zenith-source-server-output-"));',
                    'const staticDir = join(root, ".zenith-output", "static");',
                    'mkdirSync(join(staticDir, "assets"), { recursive: true });',
                    'mkdirSync(join(root, "src", "pages"), { recursive: true });',
                    'writeFileSync(join(staticDir, "index.html"), "<main></main>");',
                    'writeFileSync(join(root, "src", "pages", "index.zen"), "<main></main>");',
                    'writeFileSync(join(staticDir, "assets", "router-manifest.json"), JSON.stringify({ routes: [{ path: "/", output: "/index.html", prerender: false }] }));',
                    'try {',
                    '  await serverOutput.writeServerOutput({',
                    '    coreOutputDir: join(root, ".zenith-output"),',
                    '    staticDir,',
                    '    projectRoot: root,',
                    '    config: {},',
                    '    pageManifest: [{ path: "/", file: "index.zen", route_kind: "page", has_scoped_server_data: true, scoped_server_data: [{ ownerKind: "layout", ownerKey: "src/layouts/Missing.zen", syntax: "variables", exportName: "data", instanceStrategy: "singleton", serializedVariableNames: ["navigation"] }] }],',
                    '    pagesDir: join(root, "src", "pages"),',
                    '    srcDir: join(root, "src"),',
                    '    registry: new Map(),',
                    '    compilerOpts: {}',
                    '  });',
                    '  throw new Error("expected scoped server lowering helper call to fail");',
                    '} catch (error) {',
                    `  if (error.message !== ${JSON.stringify(SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE)}) throw error;`,
                    '}'
                ].join('\n')
            ], {
                encoding: 'utf8'
            });

            expect(result.stderr).toBe('');
            expect(result.status).toBe(0);
        } finally {
            if (existsSync(hiddenHelperPath)) {
                await rename(hiddenHelperPath, helperPath);
            }
        }
    });

    test('scoped-only Level 1 owner emits server module and manifest metadata without client leakage', async () => {
        projectRoot = await createProject({
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const raw = (() => { throw new Error("CSV_SCOPE_EXECUTED_DURING_BUILD"); })()',
                'const navigation = { title: "CSV_SERVER_NAV_SENTINEL", raw }',
                '</script>',
                '<nav>{navigation.title}</nav>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                '</script>',
                '<DefaultLayout />'
            ].join('\n'),
            'zenith.config.js': baseConfig()
        });

        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = manifest.routes.find((entry) => entry.path === '/');
        expect(route).toEqual(expect.objectContaining({
            has_scoped_server_data: true,
            scoped_server_data: [
                expect.objectContaining({
                    ownerKind: 'layout',
                    ownerKey: 'src/layouts/DefaultLayout.zen',
                    syntax: 'variables',
                    exportName: 'data',
                    instanceStrategy: 'singleton',
                    serializedVariableNames: ['navigation'],
                    module: 'scoped/src/layouts/DefaultLayout.zen.mjs'
                })
            ]
        }));

        const modulePath = join(projectRoot, '.zenith-output', 'server', route.scoped_server_data[0].module);
        expect(existsSync(modulePath)).toBe(true);
        const moduleSource = await readFile(modulePath, 'utf8');
        expect(moduleSource).toContain('export async function data');
        expect(moduleSource).toContain('CSV_SERVER_NAV_SENTINEL');
        expect(moduleSource).toMatch(/return\s+\{\s*navigation,\s*\}/s);
        expect(moduleSource).not.toMatch(/return\s+\{[^}]*raw/s);

        const routeJson = await readJson(join(projectRoot, '.zenith-output', 'server', 'routes', route.name, 'route.json'));
        expect(routeJson.scoped_server_data).toEqual(route.scoped_server_data);
        expect(existsSync(join(projectRoot, '.zenith-output', 'server', 'routes', route.name, 'route', 'entry.js'))).toBe(true);

        const staticFiles = await readTextFiles(join(projectRoot, '.zenith-output', 'static'));
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_SERVER_NAV_SENTINEL');
            expect(file.source).not.toContain('CSV_SCOPE_EXECUTED_DURING_BUILD');
        }

        const routeRenderSource = await readFile(
            join(projectRoot, '.zenith-output', 'server', 'runtime', 'route-render.js'),
            'utf8'
        );
        expect(routeRenderSource).not.toContain('scoped_server_data');
    });

    test('explicit Level 2 data owner is packaged as a server-only module', async () => {
        projectRoot = await createProject({
            'src/components/StatsCard.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({',
                '  stats: "CSV_EXPLICIT_DATA_SENTINEL"',
                '})',
                '</script>',
                '<p>{data.stats}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import StatsCard from "../components/StatsCard.zen";',
                '</script>',
                '<StatsCard />'
            ].join('\n'),
            'zenith.config.js': baseConfig()
        });

        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = manifest.routes.find((entry) => entry.path === '/');
        expect(route.scoped_server_data[0]).toEqual(expect.objectContaining({
            ownerKind: 'component',
            ownerKey: 'src/components/StatsCard.zen',
            syntax: 'explicit-data',
            exportName: 'data',
            module: 'scoped/src/components/StatsCard.zen.mjs'
        }));
        const moduleSource = await readFile(
            join(projectRoot, '.zenith-output', 'server', route.scoped_server_data[0].module),
            'utf8'
        );
        expect(moduleSource).toContain('export const data');
        expect(moduleSource).toContain('CSV_EXPLICIT_DATA_SENTINEL');

        const staticFiles = await readTextFiles(join(projectRoot, '.zenith-output', 'static'));
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_EXPLICIT_DATA_SENTINEL');
        }
    });

    test('component instance metadata is preserved while emitting one owner module', async () => {
        projectRoot = await createProject({
            'src/components/Card.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ title: props.title })',
                '</script>',
                '<p>{data.title}</p>'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script lang="ts">',
                'import Card from "../components/Card.zen";',
                '</script>',
                '<main>',
                '<Card title="First" />',
                '<Card title="Second" />',
                '</main>'
            ].join('\n'),
            'zenith.config.js': baseConfig()
        });

        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = manifest.routes.find((entry) => entry.path === '/');
        expect(route.scoped_server_data).toEqual([
            expect.objectContaining({
                ownerKind: 'component',
                ownerKey: 'src/components/Card.zen',
                instanceStrategy: 'per-instance',
                module: 'scoped/src/components/Card.zen.mjs',
                instances: [
                    {
                        key: 'component:src/components/Card.zen:o0',
                        occurrenceId: 'o0',
                        props: { title: 'First' }
                    },
                    {
                        key: 'component:src/components/Card.zen:o1',
                        occurrenceId: 'o1',
                        props: { title: 'Second' }
                    }
                ]
            })
        ]);

        const modulePath = join(projectRoot, '.zenith-output', 'server', 'scoped', 'src', 'components', 'Card.zen.mjs');
        expect(existsSync(modulePath)).toBe(true);
        const routeJson = await readJson(join(projectRoot, '.zenith-output', 'server', 'routes', route.name, 'route.json'));
        expect(routeJson.scoped_server_data).toEqual(route.scoped_server_data);
    });

    test('ownerKey-derived module paths are normalized under server/scoped', () => {
        expect(scopedServerModulePathForOwnerKey('src/layouts/DefaultLayout.zen')).toBe(
            'scoped/src/layouts/DefaultLayout.zen.mjs'
        );
        const serverDir = resolve('/tmp/zenith-server-output-path-test/server');
        expect(resolveScopedServerModuleOutputPath(serverDir, 'scoped/src/layouts/DefaultLayout.zen.mjs')).toBe(
            join(serverDir, 'scoped', 'src', 'layouts', 'DefaultLayout.zen.mjs')
        );

        for (const value of ['../escape', 'src/../escape', '/tmp/escape', 'C:\\tmp\\escape', 'src//escape']) {
            expect(() => scopedServerModulePathForOwnerKey(value)).toThrow(
                '[Zenith:ScopedServerData] Invalid scoped server data owner key.'
            );
        }
        for (const value of ['../escape.mjs', 'scoped/../escape.mjs', '/tmp/escape.mjs', 'routes/escape.mjs']) {
            expect(() => resolveScopedServerModuleOutputPath(serverDir, value)).toThrow(
                '[Zenith:ScopedServerData] Invalid scoped server data module path.'
            );
        }
    });

    test('route-only server output metadata remains unchanged without scoped owners', async () => {
        projectRoot = await createProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ ok: true });',
                '}',
                '</script>',
                '<main>{data.ok}</main>'
            ].join('\n'),
            'zenith.config.js': baseConfig()
        });

        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = manifest.routes.find((entry) => entry.path === '/');
        expect(route).toEqual(expect.objectContaining({
            path: '/',
            route_kind: 'page',
            has_load: true
        }));
        expect(route.has_scoped_server_data).toBeUndefined();
        expect(route.scoped_server_data).toBeUndefined();
    });
});
