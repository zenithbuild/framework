import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { build } from '../dist/build.js';

jest.setTimeout(60000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-scoped-types-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        srcDir: join(root, 'src'),
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist')
    };
}

function runTsc(filePath) {
    return spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', filePath], {
        encoding: 'utf8',
        shell: process.platform === 'win32'
    });
}

describe('scoped server data type declarations (#102)', () => {
    let project = null;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('emits owner and runtime scoped server data maps without changing route types', async () => {
        project = await createProject({
            'src/layouts/DefaultLayout.zen': [
                '<script server lang="ts">',
                'const raw = await getNavigation()',
                'const navigation = { title: "Docs", count: 2, flags: [true, false], nested: { label: "Nested" } }',
                'const internal = "do-not-serialize"',
                '</script>',
                '<main>{navigation.title}<slot /></main>'
            ].join('\n'),
            'src/components/Badge.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ label: "Solo", active: true })',
                '</script>',
                '<span>{data.label}</span>'
            ].join('\n'),
            'src/components/Card.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => ({ title: "Card", count: 1 })',
                '</script>',
                '<article>{data.title}</article>'
            ].join('\n'),
            'src/components/Unsupported.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props) => getUnsupportedData(props)',
                '</script>',
                '<aside>{data.title}</aside>'
            ].join('\n'),
            'src/components/PromiseCard.zen': [
                '<script server lang="ts">',
                'export const data = async (ctx, props): Promise<{ title: string }> => ({ title: "Promised" })',
                '</script>',
                '<article>{data.title}</article>'
            ].join('\n'),
            'src/components/PromiseLikeStat.zen': [
                '<script server lang="ts">',
                'export const data = (ctx, props): PromiseLike<{ count: number }> => ({',
                '  then(resolve) { resolve({ count: 7 }); }',
                '})',
                '</script>',
                '<article>{data.count}</article>'
            ].join('\n'),
            'src/components/ImportedPromise.zen': [
                '<script server lang="ts">',
                'import type { ImportedData } from "./external";',
                'export const data = async (ctx, props): Promise<ImportedData> => getImportedData(props)',
                '</script>',
                '<aside>{data.title}</aside>'
            ].join('\n'),
            'src/components/BodyFallback.zen': [
                '<script server lang="ts">',
                'import type { ImportedData } from "./external";',
                'export const data = async (ctx, props): Promise<ImportedData> => ({ fallback: "body" })',
                '</script>',
                '<aside>{data.fallback}</aside>'
            ].join('\n'),
            'src/components/external.ts': [
                'export type ImportedData = { title: string };',
                'export function getImportedData(props) {',
                '  return { title: String(props?.title || "imported") };',
                '}'
            ].join('\n'),
            'src/pages/index.zen': [
                '<script server lang="ts">',
                'export async function load(ctx) {',
                '  return ctx.data({ pageTitle: "Home", route: { path: "/" } });',
                '}',
                '</script>',
                '<script lang="ts">',
                'import DefaultLayout from "../layouts/DefaultLayout.zen";',
                'import Badge from "../components/Badge.zen";',
                'import Card from "../components/Card.zen";',
                'import Unsupported from "../components/Unsupported.zen";',
                'import PromiseCard from "../components/PromiseCard.zen";',
                'import PromiseLikeStat from "../components/PromiseLikeStat.zen";',
                'import ImportedPromise from "../components/ImportedPromise.zen";',
                'import BodyFallback from "../components/BodyFallback.zen";',
                '</script>',
                '<DefaultLayout>',
                '  <Badge label="Solo" />',
                '  <Card title="First" />',
                '  <Card title="Second" />',
                '  <Unsupported />',
                '  <PromiseCard />',
                '  <PromiseLikeStat />',
                '  <ImportedPromise />',
                '  <BodyFallback />',
                '  <main>{data.pageTitle}</main>',
                '</DefaultLayout>'
            ].join('\n'),
            'tsconfig.json': JSON.stringify({
                compilerOptions: { strict: true },
                include: ['src/**/*']
            }, null, 2)
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        const scopedPath = join(project.root, '.zenith', 'zenith-scoped-server-data.d.ts');
        const envPath = join(project.root, '.zenith', 'zenith-env.d.ts');
        const routesPath = join(project.root, '.zenith', 'zenith-routes.d.ts');
        expect(existsSync(scopedPath)).toBe(true);

        const scopedDts = await readFile(scopedPath, 'utf8');
        const envDts = await readFile(envPath, 'utf8');
        const routeDts = await readFile(routesPath, 'utf8');
        const tsconfig = JSON.parse(await readFile(join(project.root, 'tsconfig.json'), 'utf8'));

        expect(scopedDts).toContain('interface ScopedServerDataOwnerMap');
        expect(scopedDts).toContain('interface ScopedServerDataRuntimeMap');
        expect(scopedDts).toContain('type ScopedServerDataFor<K extends keyof ScopedServerDataOwnerMap>');
        expect(scopedDts).toContain('type ScopedServerRuntimeDataFor<K extends keyof ScopedServerDataRuntimeMap>');
        expect(scopedDts).toContain('"src/layouts/DefaultLayout.zen": { navigation: { title: string; count: number; flags: boolean[]; nested: { label: string; }; }; };');
        expect(scopedDts).not.toContain('internal:');
        expect(scopedDts).not.toContain('raw:');
        expect(scopedDts).toContain('"src/components/Badge.zen": { label: string; active: boolean; };');
        expect(scopedDts).toContain('"src/components/Card.zen": { title: string; count: number; };');
        expect(scopedDts).toContain('"src/components/Unsupported.zen": Record<string, unknown>;');
        expect(scopedDts).toContain('"src/components/PromiseCard.zen": { title: string; };');
        expect(scopedDts).toContain('"src/components/PromiseLikeStat.zen": { count: number; };');
        expect(scopedDts).toContain('"src/components/ImportedPromise.zen": Record<string, unknown>;');
        expect(scopedDts).toContain('"src/components/BodyFallback.zen": { fallback: string; };');
        expect(scopedDts).toContain('"layout:src/layouts/DefaultLayout.zen": ScopedServerDataOwnerMap["src/layouts/DefaultLayout.zen"];');
        expect(scopedDts).toContain('"component:src/components/Badge.zen": ScopedServerDataOwnerMap["src/components/Badge.zen"];');
        expect(scopedDts).toContain('"component:src/components/Card.zen:o0": ScopedServerDataOwnerMap["src/components/Card.zen"];');
        expect(scopedDts).toContain('"component:src/components/Card.zen:o1": ScopedServerDataOwnerMap["src/components/Card.zen"];');
        expect(scopedDts).not.toContain('pageTitle:');
        expect(envDts).toContain('type PageData');
        expect(envDts).toContain('type Load<T extends PageData = PageData>');
        expect(envDts).not.toContain('ScopedServerDataOwnerMap');
        expect(routeDts).toContain('interface RouteParamsMap');
        expect(routeDts).toContain('"/": {}');
        expect(routeDts).not.toContain('ScopedServerDataOwnerMap');
        expect(tsconfig.include).toContain('.zenith/**/*.d.ts');

        const validFixture = join(project.root, '.zenith', 'scoped-positive.ts');
        await writeFile(validFixture, [
            '/// <reference path="./zenith-scoped-server-data.d.ts" />',
            'const layoutData = {} as Zenith.ScopedServerDataFor<"src/layouts/DefaultLayout.zen">;',
            'const layoutTitle: string = layoutData.navigation.title;',
            'const layoutCount: number = layoutData.navigation.count;',
            'const layoutFlag: boolean = layoutData.navigation.flags[0];',
            'const badge = {} as Zenith.ScopedServerRuntimeDataFor<"component:src/components/Badge.zen">;',
            'const badgeLabel: string = badge.label;',
            'const firstCard = {} as Zenith.ScopedServerRuntimeDataFor<"component:src/components/Card.zen:o0">;',
            'const cardTitle: string = firstCard.title;',
            'const promiseCard = {} as Zenith.ScopedServerDataFor<"src/components/PromiseCard.zen">;',
            'const promiseTitle: string = promiseCard.title;',
            'const promiseLike = {} as Zenith.ScopedServerDataFor<"src/components/PromiseLikeStat.zen">;',
            'const promiseCount: number = promiseLike.count;',
            'const bodyFallback = {} as Zenith.ScopedServerDataFor<"src/components/BodyFallback.zen">;',
            'const fallbackText: string = bodyFallback.fallback;',
            'const fallback: Record<string, unknown> = {} as Zenith.ScopedServerDataFor<"src/components/Unsupported.zen">;',
            'void [layoutTitle, layoutCount, layoutFlag, badgeLabel, cardTitle, promiseTitle, promiseCount, fallbackText, fallback];'
        ].join('\n'));

        const validResult = runTsc(validFixture);
        expect(validResult.status).toBe(0);

        const invalidFixture = join(project.root, '.zenith', 'scoped-negative.ts');
        await writeFile(invalidFixture, [
            '/// <reference path="./zenith-scoped-server-data.d.ts" />',
            'const layoutData = {} as Zenith.ScopedServerDataFor<"src/layouts/DefaultLayout.zen">;',
            'const badTitle: number = layoutData.navigation.title;',
            'void badTitle;'
        ].join('\n'));

        const invalidResult = runTsc(invalidFixture);
        expect(invalidResult.status).not.toBe(0);
    });
});
