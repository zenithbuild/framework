import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { generateManifest } from '../src/manifest.js';
import { composeServerScriptEnvelope, resolveAdjacentServerModules } from '../src/server-script-composition.js';
import { extractServerScript } from '../src/build/server-script.js';
import { applyServerEnvelopeToPageIr } from '../src/build/page-loop-state.js';
import {
    analyzeRouteScopedServerMetadata
} from '../dist/scoped-server-data/manifest-integration.js';

jest.setTimeout(30000);

const SCOPED_SERVER_DATA_HELPER_UNAVAILABLE =
    '[Zenith:ScopedServerData] Manifest integration helper is unavailable. Run the CLI build step before using scoped server data manifest integration.';

/**
 * @param {Record<string, string>} files
 */
async function makeProject(files) {
    const root = join(tmpdir(), `zenith-csv-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const srcDir = join(root, 'src');
    const pagesDir = join(srcDir, 'pages');
    await mkdir(pagesDir, { recursive: true });
    await mkdir(join(srcDir, 'layouts'), { recursive: true });
    await mkdir(join(srcDir, 'components'), { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(srcDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, srcDir, pagesDir };
}

function layoutWithLevel1Vars() {
    return [
        '<script server lang="ts">',
        'const raw = await getNavigation()',
        'const navigation = normalizeNav(raw)',
        '</script>',
        '<Navigation content={navigation} />'
    ].join('\n');
}

function pageUsingDefaultLayout(extraPageScript = '') {
    return [
        extraPageScript,
        '<script lang="ts">',
        'import DefaultLayout from "../layouts/DefaultLayout.zen";',
        '</script>',
        '<DefaultLayout />'
    ].filter(Boolean).join('\n');
}

async function buildPageIrMetadata(project, pageRelPath) {
    const { buildComponentRegistry } = await import('../src/resolve-components.js');
    const registry = buildComponentRegistry(project.srcDir);
    const sourceFile = join(project.srcDir, pageRelPath);
    const rawSource = readFileSync(sourceFile, 'utf8');
    const inlineServerScript = extractServerScript(rawSource, sourceFile, { typescriptDefault: false }).serverScript;
    const { guardPath, loadPath, actionPath } = resolveAdjacentServerModules(sourceFile);
    const composedServer = composeServerScriptEnvelope({
        sourceFile,
        inlineServerScript,
        adjacentGuardPath: guardPath,
        adjacentLoadPath: loadPath,
        adjacentActionPath: actionPath
    });
    const scopedMetadata = analyzeRouteScopedServerMetadata({
        pageSource: rawSource,
        pageFile: sourceFile,
        registry,
        srcDir: project.srcDir,
        compilerOpts: { typescriptDefault: false }
    });
    const pageIr = {};
    applyServerEnvelopeToPageIr({
        pageIr,
        composedServer,
        entry: { file: pageRelPath.replace(/^pages\//, '') },
        srcDir: project.srcDir,
        sourceFile,
        scopedMetadata
    });
    return pageIr;
}

describe('scoped server manifest + classification (#97)', () => {
    /** @type {{ root: string, srcDir: string, pagesDir: string } | null} */
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('source manifest import does not require prebuilt scoped manifest helper', async () => {
        const helperPath = fileURLToPath(
            new URL('../dist/scoped-server-data/manifest-integration.js', import.meta.url)
        );
        const hiddenHelperPath = `${helperPath}.source-import-test-${process.pid}-${Date.now()}`;

        expect(existsSync(helperPath)).toBe(true);
        await rename(helperPath, hiddenHelperPath);

        try {
            const sourceManifestUrl = new URL(
                `../src/manifest.js?source-import-no-dist=${Date.now()}`,
                import.meta.url
            );
            const result = spawnSync(process.execPath, [
                '--input-type=module',
                '-e',
                [
                    `const sourceManifest = await import(${JSON.stringify(sourceManifestUrl.href)});`,
                    'if (typeof sourceManifest.generateManifest !== "function") throw new Error("missing generateManifest export");',
                    'if (typeof sourceManifest.analyzeRouteScopedServerMetadata !== "function") throw new Error("missing analyzeRouteScopedServerMetadata export");',
                    'try {',
                    '  sourceManifest.analyzeRouteScopedServerMetadata({});',
                    '  throw new Error("expected scoped server helper call to fail");',
                    '} catch (error) {',
                    `  if (error.message !== ${JSON.stringify(SCOPED_SERVER_DATA_HELPER_UNAVAILABLE)}) throw error;`,
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

    test('layout Level 1 vars classify route as server with scoped metadata only', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': layoutWithLevel1Vars(),
            'components/Navigation.zen': '<nav>{content?.title}</nav>\n',
            'pages/index.zen': pageUsingDefaultLayout()
        });

        const manifest = await generateManifest(project.pagesDir);
        expect(manifest).toEqual([
            expect.objectContaining({
                path: '/',
                render_mode: 'server',
                has_load: false,
                has_scoped_server_data: true,
                scoped_server_data: [
                    expect.objectContaining({
                        ownerKind: 'layout',
                        syntax: 'variables',
                        instanceStrategy: 'singleton',
                        serializedVariableNames: ['navigation']
                    })
                ]
            })
        ]);
    });

    test('page load and layout scoped values keep has_load route-only', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': layoutWithLevel1Vars(),
            'components/Navigation.zen': '<nav>{content?.title}</nav>\n',
            'pages/index.zen': pageUsingDefaultLayout([
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ pageTitle: "Home" });',
                '}',
                '</script>'
            ].join('\n'))
        });

        const manifest = await generateManifest(project.pagesDir);
        expect(manifest[0]).toMatchObject({
            render_mode: 'server',
            has_load: true,
            has_scoped_server_data: true
        });
    });

    test('prerender=true with layout scoped values throws CSV012', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': layoutWithLevel1Vars(),
            'components/Navigation.zen': '<nav>{content?.title}</nav>\n',
            'pages/index.zen': pageUsingDefaultLayout([
                '<script server lang="ts">',
                'export const prerender = true;',
                '</script>'
            ].join('\n'))
        });

        await expect(generateManifest(project.pagesDir)).rejects.toThrow(
            'CSV012 scoped server data cannot be combined with prerender=true in v1.'
        );
    });

    test('page-only load route remains unchanged without scoped metadata', async () => {
        project = await makeProject({
            'pages/index.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ ok: true });',
                '}',
                '</script>',
                '<main>{data.ok}</main>'
            ].join('\n')
        });

        const manifest = await generateManifest(project.pagesDir);
        expect(manifest[0]).toMatchObject({
            render_mode: 'server',
            has_load: true
        });
        expect(manifest[0].has_scoped_server_data).toBeUndefined();
        expect(manifest[0].scoped_server_data).toBeUndefined();
    });

    test('manifest metadata and Page IR metadata agree for the same route', async () => {
        project = await makeProject({
            'layouts/DefaultLayout.zen': layoutWithLevel1Vars(),
            'components/Navigation.zen': '<nav>{content?.title}</nav>\n',
            'pages/index.zen': pageUsingDefaultLayout()
        });

        const manifest = await generateManifest(project.pagesDir);
        const pageIr = await buildPageIrMetadata(project, 'pages/index.zen');

        expect(pageIr.has_scoped_server_data).toBe(manifest[0].has_scoped_server_data);
        expect(pageIr.scoped_server_data).toEqual(manifest[0].scoped_server_data);
        expect(pageIr.has_load).toBe(manifest[0].has_load);
        expect(pageIr.has_guard).toBe(manifest[0].has_guard);
        expect(pageIr.has_action).toBe(manifest[0].has_action);
    });
});
