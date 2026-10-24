import {
    cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync,
    readdirSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliRoot = fileURLToPath(new URL('..', import.meta.url));
const entry = join(cliRoot, 'dist', 'index.js');
const coreEntry = resolve(cliRoot, '..', 'core', 'bin', 'zenith.js');
const cliManifest = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8'));
const version = cliManifest.version;
let scratch;

function run(entryPath, args, cwd = scratch) {
    return spawnSync(process.execPath, [entryPath, ...args], {
        cwd,
        env: { ...process.env, CI: '1', ZENITH_NO_UI: '1' },
        encoding: 'utf8',
        timeout: 120_000
    });
}

beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'zenith entry with spaces ')); });
afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

test.each([entry, entry.replaceAll('\\', '/')])('executes native and slash entry paths: %s', (entryPath) => {
    const result = run(entryPath, ['--version']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`zenith ${version}`);
    const help = run(entryPath, ['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('zenith build');
});

test('executes a relocated package in a path with spaces', () => {
    const relocated = join(scratch, 'CLI package');
    mkdirSync(relocated);
    cpSync(join(cliRoot, 'dist'), join(relocated, 'dist'), { recursive: true });
    cpSync(join(cliRoot, 'package.json'), join(relocated, 'package.json'));
    mkdirSync(join(relocated, 'node_modules'));
    // Copy every declared runtime dependency, so the fixture follows the manifest
    // instead of naming packages from other branches. The toolchain and Sharp are
    // resolved lazily, so `--version` never loads them.
    const lazyDependencies = new Set(['@zenithbuild/compiler', '@zenithbuild/bundler', 'sharp']);
    const fixtureDependencies = Object.keys(cliManifest.dependencies || {})
        .filter((name) => !lazyDependencies.has(name));
    for (const name of fixtureDependencies) {
        const target = join(relocated, 'node_modules', name);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(cliRoot, 'node_modules', name), target, { recursive: true, dereference: true });
    }
    // Required peers (@zenithbuild/core, which owns the config modules) are
    // installed by the consumer; copy them without their own node_modules,
    // since core's workspace links lead back to the CLI.
    const requiredPeers = Object.keys(cliManifest.peerDependencies || {})
        .filter((name) => !cliManifest.peerDependenciesMeta?.[name]?.optional);
    for (const name of requiredPeers) {
        const source = join(cliRoot, 'node_modules', name);
        const target = join(relocated, 'node_modules', name);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target, {
            recursive: true,
            dereference: true,
            filter: (path) => !relative(source, path).split(sep).includes('node_modules')
        });
    }
    const result = run(join(relocated, 'dist', 'index.js'), ['--version']);
    if (result.status !== 0) throw new Error(`Relocated CLI failed: ${result.stdout}${result.stderr}`);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`zenith ${version}`);
});

test('importing CLI from an application index.js never runs CLI commands', () => {
    writeFileSync(join(scratch, 'package.json'), '{"type":"module"}');
    const application = join(scratch, 'index.js');
    writeFileSync(application, `import ${JSON.stringify(pathToFileURL(entry).href)};\nconsole.log('import completed');\n`);
    const result = run(application, ['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('import completed');
    expect(result.stderr).toBe('');
});

test.each([entry, coreEntry])('build writes nonempty HTML and assets outside the checkout: %s', (entryPath) => {
    const pages = join(scratch, 'src', 'pages');
    mkdirSync(pages, { recursive: true });
    writeFileSync(join(scratch, 'package.json'), '{"private":true,"type":"module"}');
    writeFileSync(join(pages, 'index.zen'), [
        '<script lang="ts">',
        'state count = 0;',
        'function increment() { count = count + 1; }',
        '</script>',
        '<main>Windows entry smoke <button on:click={increment}>{count}</button></main>'
    ].join('\n'));
    const result = run(entryPath, ['build']);
    expect(result.error).toBeUndefined();
    if (result.status !== 0) throw new Error(`CLI build failed (${result.status}): ${result.stdout}${result.stderr}`);
    const html = readFileSync(join(scratch, 'dist', 'index.html'), 'utf8');
    expect(html).toContain('Windows entry smoke');
    const assetsDir = join(scratch, 'dist', 'assets');
    expect(readdirSync(assetsDir).some((name) => /\.m?js$/.test(name) && readFileSync(join(assetsDir, name)).length > 0)).toBe(true);
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)) {
        const file = resolve(scratch, 'dist', asset.slice(1));
        expect(existsSync(file)).toBe(true);
    }
}, 120_000);

test.each([entry, coreEntry])('a failing command prints the Zenith error and exits 1: %s', (entryPath) => {
    writeFileSync(join(scratch, 'package.json'), '{"private":true,"type":"module"}');
    writeFileSync(join(scratch, 'zenith.config.js'), "throw new Error('entry failure probe');\n");
    const result = run(entryPath, ['build']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[zenith]');
    expect(result.stderr).toContain('entry failure probe');
    expect(result.stderr).not.toMatch(/^\s+at /m);
}, 120_000);
