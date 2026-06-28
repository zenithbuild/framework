import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { build } from '../dist/build.js';
import { collectFiles, REPO_ROOT, scanFiles } from './helpers/drift-gates-fixtures.js';

describe('drift create-zenith', () => {
    test('create-zenith templates use only canonical event binding (on:click={...}, no onclick="..." or @click)', () => {
        const createZenithRoot = resolve(REPO_ROOT, 'packages/create-zenith');
        const files = collectFiles(createZenithRoot, ['.zen']);
        const onclickHits = scanFiles(files, /onclick\s*=\s*["']/);
        const atClickHits = scanFiles(files, /@click\b/);
        expect(onclickHits).toEqual([]);
        expect(atClickHits).toEqual([]);
    });

    test('release gate: create-zenith starter scaffolds and builds all routes', async () => {
        const createZenithCli = resolve(REPO_ROOT, 'create-zenith', 'dist', 'cli.js');
        if (!existsSync(createZenithCli)) {
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), 'zenith-release-gate-'));
        const projectName = 'release-gate-app';
        const projectDir = join(tempRoot, projectName);

        try {
            const scaffoldResult = spawnSync(
                process.execPath,
                [createZenithCli, projectName],
                {
                    cwd: tempRoot,
                    encoding: 'utf8',
                    timeout: 30_000,
                    env: {
                        ...process.env,
                        ZENITH_NO_UI: '1',
                        CI: '1',
                        NO_COLOR: '1',
                        CREATE_ZENITH_TEMPLATE_MODE: 'local',
                        CREATE_ZENITH_SKIP_INSTALL: '1'
                    }
                }
            );
            expect(scaffoldResult.status).toBe(0);
            expect(existsSync(projectDir)).toBe(true);

            const expectedPages = ['index.zen', 'about.zen', 'blog.zen', 'docs.zen'];
            const pagesDir = join(projectDir, 'src', 'pages');
            for (const page of expectedPages) {
                expect(existsSync(join(pagesDir, page))).toBe(true);
            }

            const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
            const zenithDeps = Object.keys(pkg.dependencies || {}).filter((d) => d.startsWith('@zenithbuild/'));
            expect(zenithDeps).toEqual(['@zenithbuild/core']);

            const localPackages = [
                resolve(REPO_ROOT, 'packages/core'),
                resolve(REPO_ROOT, 'packages/cli'),
                resolve(REPO_ROOT, 'packages/compiler'),
                resolve(REPO_ROOT, 'packages/runtime'),
                resolve(REPO_ROOT, 'packages/router'),
                resolve(REPO_ROOT, 'packages/bundler')
            ];
            for (const lp of localPackages) {
                expect(existsSync(lp)).toBe(true);
            }

            const installResult = spawnSync(
                'npm',
                ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error', ...localPackages],
                { cwd: projectDir, encoding: 'utf8', timeout: 120_000 }
            );
            expect(installResult.status).toBe(0);

            const originalCwd = process.cwd();
            process.chdir(projectDir);
            try {
                await build({ pagesDir, outDir: join(projectDir, 'dist'), config: {} });
            } finally {
                process.chdir(originalCwd);
            }

            const distDir = join(projectDir, 'dist');
            expect(existsSync(join(distDir, 'index.html'))).toBe(true);
            expect(existsSync(join(distDir, 'about', 'index.html'))).toBe(true);
            expect(existsSync(join(distDir, 'blog', 'index.html'))).toBe(true);
            expect(existsSync(join(distDir, 'docs', 'index.html'))).toBe(true);
        } finally {
            await rm(tempRoot, { recursive: true, force: true });
        }
    }, 120_000);
});
