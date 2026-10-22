import {
    cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync,
    readdirSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliRoot = fileURLToPath(new URL('..', import.meta.url));
const entry = join(cliRoot, 'dist', 'index.js');
const version = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8')).version;
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
    symlinkSync(join(cliRoot, 'node_modules'), join(relocated, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir');
    const result = run(join(relocated, 'dist', 'index.js'), ['--version']);
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

test('direct build writes nonempty HTML and referenced assets outside the checkout', () => {
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
    const result = run(entry, ['build']);
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
