import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, arch, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || 'image-install-benchmark.json');
const npmCli = process.env.ZENITH_BENCH_NPM_CLI;
const pnpmCli = process.env.ZENITH_BENCH_PNPM_CLI;
assert.ok(npmCli && pnpmCli, 'Set ZENITH_BENCH_NPM_CLI (npm 12) and ZENITH_BENCH_PNPM_CLI (pnpm 10)');
assert.equal(platform(), 'linux', 'This benchmark fixture currently stages the Linux x64 native packages');
const scratch = mkdtempSync(join(tmpdir(), 'zenith-image-install-bench-'));
const result = {
    machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    method: 'Three serial fresh consumer directories per manager and image mode; local tarballs with exact overrides; normal optional dependencies; install scripts enabled; normal warm global manager caches; pnpm isolated fresh store per run. Measured apparent bytes and unique files through physical symlink targets. No release or publish.',
    source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    tarballs: [],
    runs: []
};

function run(binary, args, cwd) {
    const r = spawnSync(binary, args, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    assert.equal(r.status, 0, `${binary} ${args.join(' ')}: ${r.stderr || r.stdout || r.error}`);
    return r.stdout;
}

function measure(directory) {
    let bytes = 0, files = 0;
    const visited = new Set();
    const sharp = new Set();
    function walk(path) {
        const physical = realpathSync(path);
        if (visited.has(physical)) return;
        visited.add(physical);
        const info = lstatSync(physical);
        if (info.isDirectory()) {
            if (existsSync(join(physical, 'package.json'))) {
                const p = JSON.parse(readFileSync(join(physical, 'package.json'), 'utf8'));
                if (p.name === 'sharp' || p.name?.startsWith('@img/sharp-')) sharp.add(`${p.name}@${p.version}`);
            }
            for (const name of readdirSync(physical)) walk(join(physical, name));
        } else { bytes += info.size; files++; }
    }
    walk(directory);
    return { bytes, files, sharp: [...sharp].sort() };
}

try {
    const dependencies = {};
    for (const name of ['image', 'core', 'cli', 'compiler', 'bundler', 'runtime', 'router', 'compiler-linux-x64', 'bundler-linux-x64']) {
        const packageRoot = join(root, 'packages', name);
        const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
        const payload = JSON.parse(run(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', scratch], packageRoot));
        const pack = Array.isArray(payload) ? payload[0] : payload[pkg.name];
        assert.ok(pack?.filename, `Unexpected pack response for ${pkg.name}`);
        result.tarballs.push({ name: pkg.name, version: pkg.version, integrity: pack.integrity });
        dependencies[pkg.name] = `file:../${pack.filename}`;
    }
    const managers = [
        { name: 'npm', binary: process.execPath, prefix: [npmCli], args: ['install', '--no-audit', '--no-fund'] },
        { name: 'pnpm', binary: process.execPath, prefix: [pnpmCli], args: ['install', '--ignore-workspace', '--store-dir', './.pnpm-store'] },
        { name: 'bun', binary: process.env.BUN_BIN || 'bun', prefix: [], args: ['install'] }
    ];
    for (const manager of managers) {
        const version = run(manager.binary, [...manager.prefix, '--version'], root).trim();
        assert.match(version, manager.name === 'npm' ? /^12\./ : manager.name === 'pnpm' ? /^10\./ : /^1\.4\./);
        for (const images of [false, true]) for (let n = 1; n <= 3; n++) {
            const consumer = join(scratch, `${manager.name}-${images}-${n}`);
            mkdirSync(consumer);
            const selected = { ...dependencies };
            if (!images) delete selected['@zenithbuild/image'];
            writeFileSync(join(consumer, 'package.json'), JSON.stringify({
                private: true, type: 'module', dependencies: selected,
                overrides: selected, pnpm: { overrides: selected }
            }, null, 2));
            const start = performance.now();
            run(manager.binary, [...manager.prefix, ...manager.args], consumer);
            const elapsedMs = Math.round(performance.now() - start);
            const metrics = measure(join(consumer, 'node_modules'));
            assert.equal(metrics.sharp.length > 0, images, `${manager.name}: unexpected Sharp tree`);
            result.runs.push({ manager: manager.name, version, images, run: n, elapsedMs, ...metrics });
            writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
            console.log(`${manager.name}@${version} images=${images} run=${n} bytes=${metrics.bytes} sharp=${metrics.sharp.length}`);
            assert.ok(consumer.startsWith(scratch + '/'));
            rmSync(consumer, { recursive: true, force: true });
        }
    }
} finally {
    assert.ok(scratch.startsWith(join(tmpdir(), 'zenith-image-install-bench-')));
    rmSync(scratch, { recursive: true, force: true });
}
