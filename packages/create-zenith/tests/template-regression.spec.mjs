import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLI_PATH = resolve(process.cwd(), 'dist', 'cli.js');
const WORKSPACE_ROOT = resolve(process.cwd(), '..');
const CORE_VERSION = JSON.parse(
    readFileSync(resolve(WORKSPACE_ROOT, 'zenith-core', 'package.json'), 'utf8')
).version;
const LOCAL_ZENITH_PACKAGES = [
    resolve(WORKSPACE_ROOT, 'zenith-core'),
    resolve(WORKSPACE_ROOT, 'zenith-cli'),
    resolve(WORKSPACE_ROOT, 'zenith-compiler'),
    resolve(WORKSPACE_ROOT, 'zenith-runtime'),
    resolve(WORKSPACE_ROOT, 'zenith-router'),
    resolve(WORKSPACE_ROOT, 'zenith-bundler')
];
const LOCAL_TAILWIND_PACKAGES = [
    resolve(WORKSPACE_ROOT, 'node_modules', '@tailwindcss', 'cli'),
    resolve(WORKSPACE_ROOT, 'node_modules', 'tailwindcss')
];
const FORBIDDEN_SOURCE_PATTERNS = [
    /\bprop\s+\w+\s*=/,
    /\bexport\s+let\b/,
    /onclick=|@click=|onClick=/
];
const FORBIDDEN_BUILD_PATTERNS = [
    /eval\(/,
    /new Function/,
    /__zenith_ssr=/,
    /zenhtml/,
    /history\.pushState/,
    /history\.replaceState/
];

function sanitizeChildEnv(env) {
    const next = { ...env };
    for (const key of Object.keys(next)) {
        if (key.startsWith('npm_')) {
            delete next[key];
        }
    }
    return next;
}

function run(cmd, args, cwd, env = process.env, timeout = 240_000) {
    const result = spawnSync(cmd, args, {
        cwd,
        env: sanitizeChildEnv(env),
        encoding: 'utf8',
        timeout
    });
    assert.equal(result.status, 0, `${cmd} ${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function collectFiles(rootDir, matcher) {
    const files = [];
    const queue = [rootDir];
    while (queue.length > 0) {
        const current = queue.pop();
        for (const name of readdirSync(current, { withFileTypes: true })) {
            const fullPath = join(current, name.name);
            if (name.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (matcher(fullPath)) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

function assertSourceContracts(projectDir) {
    const sourceFiles = collectFiles(projectDir, (file) => file.endsWith('.zen') || file.endsWith('.ts') || file.endsWith('.js'));
    const combined = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
        assert.equal(pattern.test(combined), false, `Forbidden template pattern: ${pattern}`);
    }

    assert.equal(combined.includes('on:click={'), true, 'Expected at least one on:click handler in template source');
}

function assertPackageDependencies(projectDir) {
    const pkgPath = join(projectDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const zenithDeps = Object.keys(pkg.dependencies || {}).filter((dep) => dep.startsWith('@zenithbuild/'));

    assert.deepEqual(zenithDeps, ['@zenithbuild/core'], 'Template must only directly depend on @zenithbuild/core');
    assert.equal(
        String(pkg.dependencies['@zenithbuild/core']),
        CORE_VERSION,
        'Core dependency must match the workspace core version exactly'
    );
}

function assertBuildArtifacts(projectDir) {
    const distDir = join(projectDir, 'dist');
    const indexHtmlPath = join(distDir, 'index.html');
    const aboutHtmlPath = join(distDir, 'about', 'index.html');
    const blogHtmlPath = join(distDir, 'blog', 'index.html');
    const docsHtmlPath = join(distDir, 'docs', 'index.html');

    assert.equal(existsSync(distDir), true, 'dist directory was not created');
    assert.equal(existsSync(indexHtmlPath), true, 'dist/index.html missing');
    assert.equal(existsSync(aboutHtmlPath), true, 'dist/about/index.html missing');
    assert.equal(existsSync(blogHtmlPath), true, 'dist/blog/index.html missing');
    assert.equal(existsSync(docsHtmlPath), true, 'dist/docs/index.html missing');
}

async function assertPreviewPayload(projectDir) {
    const previewModulePath = join(projectDir, 'node_modules', '@zenithbuild', 'cli', 'dist', 'preview.js');
    assert.equal(existsSync(previewModulePath), true, `Missing preview module at ${previewModulePath}`);
    const { createPreviewServer } = await import(pathToFileURL(previewModulePath).href);
    const preview = await createPreviewServer({
        distDir: join(projectDir, 'dist'),
        port: 0
    });
    try {
        for (const route of ['/', '/about', '/blog', '/docs']) {
            const response = await fetch(`http://127.0.0.1:${preview.port}${route}`);
            const html = await response.text();

            assert.equal(response.status, 200, `Preview server did not return 200 for "${route}"`);
            const payloadMatches = html.match(/id=\"zenith-ssr-data\"/g) || [];
            assert.equal(payloadMatches.length, 1, `Expected exactly one SSR payload script in "${route}"`);

            for (const pattern of FORBIDDEN_BUILD_PATTERNS) {
                assert.equal(pattern.test(html), false, `Forbidden build output pattern (${route}): ${pattern}`);
            }
        }
    } finally {
        preview.close();
    }
}

function installForBuild(projectDir, withTailwind) {
    for (const localPackage of LOCAL_ZENITH_PACKAGES) {
        assert.equal(existsSync(localPackage), true, `Missing local package path: ${localPackage}`);
    }

    const args = [
        'install',
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        ...LOCAL_ZENITH_PACKAGES
    ];

    if (withTailwind) {
        for (const localPackage of LOCAL_TAILWIND_PACKAGES) {
            assert.equal(existsSync(localPackage), true, `Missing local package path: ${localPackage}`);
        }
        args.push(...LOCAL_TAILWIND_PACKAGES);
    }

    run('npm', args, projectDir);
}

function patchRuntimeTemplateExport(projectDir) {
    const runtimePackagePath = join(projectDir, 'node_modules', '@zenithbuild', 'runtime', 'package.json');
    assert.equal(existsSync(runtimePackagePath), true, `Missing runtime package.json at ${runtimePackagePath}`);

    const runtimePkg = JSON.parse(readFileSync(runtimePackagePath, 'utf8'));
    const exportsMap = runtimePkg.exports && typeof runtimePkg.exports === 'object' ? runtimePkg.exports : {};

    if (!Object.prototype.hasOwnProperty.call(exportsMap, './template')) {
        exportsMap['./template'] = './dist/template.js';
        runtimePkg.exports = exportsMap;
        writeFileSync(runtimePackagePath, JSON.stringify(runtimePkg, null, 2));
    }
}

function scaffoldProject(tempRoot, name, withTailwind) {
    const args = [CLI_PATH, name];
    if (withTailwind) {
        args.push('--with-tailwind');
    }

    run(process.execPath, args, tempRoot, {
        ...process.env,
        ZENITH_NO_UI: '1',
        CI: '1',
        NO_COLOR: '1',
        CREATE_ZENITH_TEMPLATE_MODE: 'local',
        CREATE_ZENITH_SKIP_INSTALL: '1'
    });

    return join(tempRoot, name);
}

test('starter template scaffolds, installs, and builds clean', async () => {
    assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

    const tempRoot = mkdtempSync(join(tmpdir(), 'create-zenith-starter-'));
    const projectDir = scaffoldProject(tempRoot, 'starter-smoke', false);

    try {
        assertPackageDependencies(projectDir);
        assertSourceContracts(projectDir);
        installForBuild(projectDir, false);
        patchRuntimeTemplateExport(projectDir);
        run('npx', ['--no-install', 'zenith', 'build'], projectDir);
        assertBuildArtifacts(projectDir);
        await assertPreviewPayload(projectDir);
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('starter-tailwindcss template scaffolds, installs, and builds clean', async () => {
    assert.equal(existsSync(CLI_PATH), true, 'dist/cli.js missing; run npm run build first');

    const tempRoot = mkdtempSync(join(tmpdir(), 'create-zenith-tailwind-'));
    const projectDir = scaffoldProject(tempRoot, 'starter-tailwind-smoke', true);

    try {
        assertPackageDependencies(projectDir);
        assertSourceContracts(projectDir);
        installForBuild(projectDir, true);
        patchRuntimeTemplateExport(projectDir);
        run('npx', ['--no-install', 'zenith', 'build'], projectDir);
        assertBuildArtifacts(projectDir);
        await assertPreviewPayload(projectDir);
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
});
