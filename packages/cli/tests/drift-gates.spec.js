
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from '../src/build.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const INTERNAL_PACKAGE_NAMES = [
    '@zenithbuild/core',
    '@zenithbuild/cli',
    '@zenithbuild/compiler',
    '@zenithbuild/runtime',
    '@zenithbuild/router',
    '@zenithbuild/bundler'
];
const INTERNAL_DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const TRAIN_MANIFESTS = [
    'zenith-core/package.json',
    'zenith-cli/package.json',
    'zenith-compiler/package.json',
    'zenith-runtime/package.json',
    'zenith-router/package.json',
    'zenith-bundler/package.json'
];

function collectFiles(dir, allowExt) {
    const out = [];
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
                continue;
            }
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (allowExt.some((ext) => entry.name.endsWith(ext))) {
                out.push(full);
            }
        }
    }
    return out;
}

function scanFiles(files, matcher) {
    const hits = [];
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        if (matcher.test(source)) {
            hits.push(file);
        }
        matcher.lastIndex = 0;
    }
    return hits;
}

describe('drift gates', () => {
    test('release train: internal dependency versions match @zenithbuild/core exactly', () => {
        const coreManifest = JSON.parse(
            readFileSync(resolve(REPO_ROOT, 'zenith-core/package.json'), 'utf8')
        );
        const coreVersion = String(coreManifest.version || '');
        expect(coreVersion).toMatch(/^0\.\d+\.\d+$/);

        const mismatches = [];
        for (const manifestRel of TRAIN_MANIFESTS) {
            const manifestPath = resolve(REPO_ROOT, manifestRel);
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));

            for (const field of INTERNAL_DEP_FIELDS) {
                const deps = pkg[field] && typeof pkg[field] === 'object' ? pkg[field] : {};
                for (const [name, version] of Object.entries(deps)) {
                    if (!name.startsWith('@zenithbuild/')) {
                        continue;
                    }
                    if (version !== coreVersion) {
                        mismatches.push(`${manifestRel} :: ${field} :: ${name}@${version} (expected ${coreVersion})`);
                    }
                }
            }
        }

        expect(mismatches).toEqual([]);
    });

    test('release train: scoped package manifests have no duplicate internal package versions', () => {
        const versionsByPackage = new Map();
        for (const manifestRel of TRAIN_MANIFESTS) {
            const manifestPath = resolve(REPO_ROOT, manifestRel);
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (!pkg || typeof pkg.name !== 'string' || !INTERNAL_PACKAGE_NAMES.includes(pkg.name)) {
                continue;
            }
            if (!versionsByPackage.has(pkg.name)) {
                versionsByPackage.set(pkg.name, new Set());
            }
            versionsByPackage.get(pkg.name).add(String(pkg.version || ''));
        }
        const duplicates = [];

        for (const name of INTERNAL_PACKAGE_NAMES) {
            const versions = [...(versionsByPackage.get(name) || new Set())];
            if (versions.length > 1) {
                duplicates.push(`${name}: ${versions.join(', ')}`);
            }
        }

        expect(duplicates).toEqual([]);
    });

    test('framework sources do not import React or jsx-runtime', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-compiler/zenith_compiler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(
            files,
            /\breact\/jsx-runtime\b|\bfrom\s+['"]react['"]|\bimport\s+React(?:\s|,|$)/
        );
        expect(hits).toEqual([]);
    });

    test('query-param SSR channel remains removed', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /__zenith_ssr=/);
        expect(hits).toEqual([]);
    });

    test('no pushState or replaceState soft-nav escapes into the router runtime', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-router/template.js'),
            resolve(REPO_ROOT, 'zenith-runtime/src')
        ];

        const files = targets.flatMap((pathStr) => {
            return pathStr.endsWith('.js') ? [pathStr] : collectFiles(pathStr, ['.js', '.ts', '.rs']);
        });

        const hits = scanFiles(files, /history\.(?:push|replace)State(?!\s*\(\s*null\s*,\s*["']["']\s*,\s*window\.location\.href\s*\))/);
        expect(hits).toEqual([]);
    });

    test('no eval or Function constructors in framework runtime outputs', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-router/template.js'),
            resolve(REPO_ROOT, 'zenith-runtime/src')
        ];

        const files = targets.flatMap((pathStr) => {
            return pathStr.endsWith('.js') ? [pathStr] : collectFiles(pathStr, ['.js', '.ts', '.rs']);
        });

        const hits = scanFiles(files, /\beval\(|\bnew\s+Function\(|\bFunction\(/);
        expect(hits).toEqual([]);
    });

    test('dist bundles exclude forbidden routing/runtime primitives', async () => {
        const root = await mkdtemp(join(tmpdir(), 'zenith-drift-gates-'));
        const pagesDir = join(root, 'pages');
        const outDir = join(root, 'dist');

        try {
            await mkdir(pagesDir, { recursive: true });
            await writeFile(
                join(pagesDir, 'index.zen'),
                '<html><head></head><body><a data-zen-link="true" href="/about">About</a></body></html>',
                'utf8'
            );
            await writeFile(
                join(pagesDir, 'about.zen'),
                '<html><head></head><body><h1>About</h1></body></html>',
                'utf8'
            );

            await build({ pagesDir, outDir, config: { softNavigation: true } });

            const files = collectFiles(outDir, ['.js']);
            const hits = scanFiles(
                files,
                /history\.(?:push|replace)State(?!\s*\(\s*null\s*,\s*["']["']\s*,\s*window\.location\.href\s*\))|\beval\(|\bnew\s+Function\(|\bFunction\(|__zenith_ssr=/
            );
            expect(hits).toEqual([]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test('app source does not include frozen cms snapshots or svelte block tags', () => {
        const appSrc = resolve(REPO_ROOT, 'zenith-site-v0/src');
        const files = collectFiles(appSrc, ['.zen', '.ts', '.js']);

        const snapshotHits = scanFiles(
            files,
            /Object\.freeze\(\s*\[|cmsDocs|cmsPosts/
        );
        expect(snapshotHits).toEqual([]);

        const svelteHits = scanFiles(
            files.filter((file) => file.endsWith('.zen')),
            /\{#(if|each)|\{:(else|elseif)|\{\/(if|each)/
        );
        expect(svelteHits).toEqual([]);
    });

    test('no use of Object.freeze across app or framework source (except runtime)', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            // zenith-runtime/src is intentionally excluded: Object.freeze is used
            // for internal state snapshots (state.js) and payload validation
            // (hydrate.js). Audited as safe in beta.2.
            // zenith-compiler is excluded: script.rs emits JS code containing
            // Object.freeze for IR descriptor tables.
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-site-v0/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs', '.zen']));
        const hits = scanFiles(files, /Object\.freeze\(/);

        // Filter out this test file itself if it runs out of zenith-cli/tests (which it does, but we scan /src)
        expect(hits).toEqual([]);
    });

    test('no use of bare zenhtml macro across the framework or app', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-site-v0/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.zen']));
        // Ban tag-template zenhtml usage but allow internal context plumbing.
        const hits = scanFiles(files, /(^|[^\w.])zenhtml\s*`/m);
        expect(hits).toEqual([]);
    });

    test('compiler→runtime naming contract: __ZENITH_INTERNAL_ZENHTML binding matches across packages', () => {
        // Verify the runtime registers the internal binding
        const hydrateSource = readFileSync(
            resolve(REPO_ROOT, 'zenith-runtime/src/hydrate.js'),
            'utf8'
        );
        expect(hydrateSource).toContain('scope.__ZENITH_INTERNAL_ZENHTML');

        // Verify the CLI rewrites the legacy identifier to the same internal name
        const buildSource = readFileSync(
            resolve(REPO_ROOT, 'zenith-cli/src/build.js'),
            'utf8'
        );
        expect(buildSource).toContain('__ZENITH_INTERNAL_ZENHTML');
        // Confirm the rewrite target matches what the runtime binds
        expect(buildSource).toContain("'__ZENITH_INTERNAL_ZENHTML'");
    });

    test('no site specifics or cms leakage in core tooling', () => {
        const targets = [
            resolve(REPO_ROOT, 'zenith-cli/src'),
            resolve(REPO_ROOT, 'zenith-runtime/src'),
            resolve(REPO_ROOT, 'zenith-router/src'),
            resolve(REPO_ROOT, 'zenith-bundler/src'),
            resolve(REPO_ROOT, 'zenith-compiler/zenith_compiler/src')
        ];
        const files = targets.flatMap((dir) => collectFiles(dir, ['.js', '.ts', '.rs']));
        const hits = scanFiles(files, /Directus|docs_pages|cmsDocs|cmsPosts/i);
        expect(hits).toEqual([]);
    });

    test('no absolute machine paths leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'zenith-site-v0/.zenith');
        if (existsSync(typesDir)) {
            const files = collectFiles(typesDir, ['.ts']);
            const absoluteHits = scanFiles(files, new RegExp('/Users/|C:\\\\', 'i'));
            expect(absoluteHits).toEqual([]);
        }
    });

    test('create-zenith templates use only canonical event binding (on:click={...}, no onclick="..." or @click)', () => {
        const createZenithRoot = resolve(REPO_ROOT, 'create-zenith');
        const files = collectFiles(createZenithRoot, ['.zen']);
        const onclickHits = scanFiles(files, /onclick\s*=\s*["']/);
        const atClickHits = scanFiles(files, /@click\b/);
        expect(onclickHits).toEqual([]);
        expect(atClickHits).toEqual([]);
    });

    test('no magic globals (data, params, ctx) leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'zenith-site-v0/.zenith');

        // Disallow skipping the test if types aren't initially checked in or present
        expect(existsSync(typesDir)).toBe(true);

        // Valid syntax
        const tmpValid = resolve(typesDir, 'zenith-test-valid.ts');
        writeFileSync(tmpValid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'export const load: Zenith.Load = async (ctx) => {',
            '    const id = ctx.route.id;',
            '    return { ok: true };',
            '};'
        ].join('\n'));

        // This should not throw
        expect(() => {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpValid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) throw new Error('TypeScript compilation failed for valid syntax');
        }).not.toThrow();
        unlinkSync(tmpValid);

        // Invalid syntax (magic globals)
        const tmpInvalid = resolve(typesDir, 'zenith-test-invalid.ts');
        writeFileSync(tmpInvalid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'const d = data;',
            'const p = params;',
            'const c = ctx;'
        ].join('\n'));

        let threw = false;
        try {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpInvalid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) {
                threw = true;
            }
        } catch (err) {
            threw = true;
        }
        unlinkSync(tmpInvalid);
        expect(threw).toBe(true);
    });

    test('release gate: create-zenith starter scaffolds and builds all routes', async () => {
        const createZenithCli = resolve(REPO_ROOT, 'create-zenith', 'dist', 'cli.js');
        if (!existsSync(createZenithCli)) {
            // Skip if create-zenith hasn't been built — not a failure, just not ready
            return;
        }

        const tempRoot = await mkdtemp(join(tmpdir(), 'zenith-release-gate-'));
        const projectName = 'release-gate-app';
        const projectDir = join(tempRoot, projectName);

        try {
            // Scaffold
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

            // Verify all 4 pages exist in scaffold
            const expectedPages = ['index.zen', 'about.zen', 'blog.zen', 'docs.zen'];
            const pagesDir = join(projectDir, 'src', 'pages');
            for (const page of expectedPages) {
                expect(existsSync(join(pagesDir, page))).toBe(true);
            }

            // Verify template only depends on @zenithbuild/core
            const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
            const zenithDeps = Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@zenithbuild/'));
            expect(zenithDeps).toEqual(['@zenithbuild/core']);

            // Install local packages and build
            const localPackages = [
                resolve(REPO_ROOT, 'zenith-core'),
                resolve(REPO_ROOT, 'zenith-cli'),
                resolve(REPO_ROOT, 'zenith-compiler'),
                resolve(REPO_ROOT, 'zenith-runtime'),
                resolve(REPO_ROOT, 'zenith-router'),
                resolve(REPO_ROOT, 'zenith-bundler')
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

            // Build
            const originalCwd = process.cwd();
            process.chdir(projectDir);
            try {
                await build({ pagesDir, outDir: join(projectDir, 'dist'), config: {} });
            } finally {
                process.chdir(originalCwd);
            }

            // Verify all 4 routes produced HTML
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
