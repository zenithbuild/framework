import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(90000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures', 'scoped-server-data');

async function createFixtureProject(fixtureName) {
    const root = await mkdtemp(join(tmpdir(), `zenith-scoped-fixture-${fixtureName}-`));
    await cp(join(FIXTURES_DIR, fixtureName), root, { recursive: true });
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

function findRoute(manifest, path) {
    const route = manifest.routes.find((entry) => entry.path === path);
    expect(route).toBeTruthy();
    return route;
}

async function rewriteIndexToComponent(projectRoot, componentName) {
    await writeFile(join(projectRoot, 'src', 'pages', 'index.zen'), [
        '<script lang="ts">',
        `import ${componentName} from "../components/${componentName}.zen";`,
        '</script>',
        `<${componentName} />`
    ].join('\n'), 'utf8');
}

async function expectFixtureBuildError(fixtureName, expected, componentName = null) {
    const projectRoot = await createFixtureProject(fixtureName);
    try {
        if (componentName) {
            await rewriteIndexToComponent(projectRoot, componentName);
        }
        await expect(cli(['build'], projectRoot)).rejects.toThrow(expected);
    } finally {
        await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}

describe('scoped server data fixture matrix (#104)', () => {
    let projectRoot = null;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test('happy-path fixture records route load, scoped metadata, and runtime keys', async () => {
        projectRoot = await createFixtureProject('happy-path-full-stack');
        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = findRoute(manifest, '/');
        expect(route.has_load).toBe(true);
        expect(route.has_scoped_server_data).toBe(true);

        const entries = route.scoped_server_data;
        expect(entries).toEqual(expect.arrayContaining([
            expect.objectContaining({
                ownerKind: 'layout',
                ownerKey: 'src/layouts/DefaultLayout.zen',
                instanceStrategy: 'singleton',
                serializedVariableNames: ['navigation'],
                module: 'scoped/src/layouts/DefaultLayout.zen.mjs'
            }),
            expect.objectContaining({
                ownerKind: 'component',
                ownerKey: 'src/components/StatusBadge.zen',
                instanceStrategy: 'singleton',
                serializedVariableNames: ['stats'],
                module: 'scoped/src/components/StatusBadge.zen.mjs'
            }),
            expect.objectContaining({
                ownerKind: 'component',
                ownerKey: 'src/components/Card.zen',
                instanceStrategy: 'per-instance',
                module: 'scoped/src/components/Card.zen.mjs',
                instances: [
                    {
                        key: 'component:src/components/Card.zen:o0',
                        occurrenceId: 'o0',
                        props: { title: 'First', count: 1, featured: true }
                    },
                    {
                        key: 'component:src/components/Card.zen:o1',
                        occurrenceId: 'o1',
                        props: { title: 'Second', count: 2 }
                    }
                ]
            })
        ]));

        const resource = findRoute(manifest, '/api/ping');
        expect(resource.route_kind).toBe('resource');
        expect(resource.has_scoped_server_data).not.toBe(true);
        expect(resource.scoped_server_data).toBeUndefined();
    });

    test('server-output fixture writes scoped modules and keeps server source out of static output', async () => {
        projectRoot = await createFixtureProject('server-output-modules');
        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = findRoute(manifest, '/');
        expect(route.has_scoped_server_data).toBe(true);
        expect(route.scoped_server_data).toHaveLength(2);

        for (const entry of route.scoped_server_data) {
            expect(existsSync(join(projectRoot, '.zenith-output', 'server', entry.module))).toBe(true);
        }

        const routeJson = await readJson(join(projectRoot, '.zenith-output', 'server', 'routes', route.name, 'route.json'));
        expect(routeJson.scoped_server_data).toEqual(route.scoped_server_data);

        const staticFiles = await readTextFiles(join(projectRoot, '.zenith-output', 'static'));
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_OUTPUT_LAYOUT_SENTINEL');
            expect(file.source).not.toContain('CSV_OUTPUT_CARD_SENTINEL');
            expect(file.source).not.toContain('export const data = async');
        }
    });

    test('serialization fixture returns only template-referenced Level 1 names', async () => {
        projectRoot = await createFixtureProject('serialization-intermediate');
        await cli(['build'], projectRoot);

        const manifest = await readJson(join(projectRoot, '.zenith-output', 'server', 'manifest.json'));
        const route = findRoute(manifest, '/');
        const entry = route.scoped_server_data[0];
        expect(entry).toEqual(expect.objectContaining({
            ownerKey: 'src/components/DerivedCard.zen',
            serializedVariableNames: ['derived']
        }));

        const moduleSource = await readFile(join(projectRoot, '.zenith-output', 'server', entry.module), 'utf8');
        expect(moduleSource).toMatch(/return\s+\{\s*derived,\s*\}/s);
        expect(moduleSource).not.toMatch(/return\s+\{[^}]*raw/s);
        expect(moduleSource).not.toMatch(/return\s+\{[^}]*unused/s);

        const staticFiles = await readTextFiles(join(projectRoot, '.zenith-output', 'static'));
        for (const file of staticFiles) {
            expect(file.source).not.toContain('CSV_INTERMEDIATE_RAW_SENTINEL');
            expect(file.source).not.toContain('CSV_INTERMEDIATE_UNUSED_SENTINEL');
        }
    });

    test.each([
        ['BadLoad', 'CSV001'],
        ['BadGuard', 'CSV002'],
        ['BadAction', 'CSV003'],
        ['BadRedirect', 'route-only result API ctx.redirect()'],
        ['BadDeny', 'route-only result API ctx.deny()']
    ])('invalid owner API fixture rejects %s', async (componentName, expected) => {
        await expectFixtureBuildError('diagnostic-invalid-owner-api', expected, componentName);
    });

    test('prerender conflict fixture rejects scoped server data with CSV012', async () => {
        await expectFixtureBuildError('diagnostic-prerender-conflict', 'CSV012');
    });

    test('dynamic props fixture rejects runtime-evaluated scoped props with CSV013', async () => {
        await expectFixtureBuildError('diagnostic-dynamic-props', 'CSV013');
    });

    test.each([
        ['BadReserved', 'CSV004'],
        ['BadLet', 'CSV005'],
        ['BadLeak', 'CSV007']
    ])('reserved binding fixture rejects %s', async (componentName, expected) => {
        await expectFixtureBuildError('diagnostic-reserved-binding', expected, componentName);
    });

    test('static target fixture rejects server-rendered scoped routes', async () => {
        await expectFixtureBuildError(
            'diagnostic-static-target-block',
            'target "static" cannot emit server-rendered routes'
        );
    });
});
