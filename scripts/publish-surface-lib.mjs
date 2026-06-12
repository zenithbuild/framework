import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const REPO_ROOT = resolve(__dirname, '..');
export const EXPECTED_REPOSITORY_URL = 'https://github.com/zenithbuild/framework';
export const DEFAULT_NPM_BIN = process.env.NPM_BIN || (process.platform === 'win32' ? 'npm.cmd' : 'npm');

function entry(dir, name, stage, requiredPackFiles = []) {
    return { dir: normalizePath(dir), name, stage, requiredPackFiles };
}

export const PUBLISH_SURFACE_MATRIX = [
    entry('packages/bundler-darwin-arm64', '@zenithbuild/bundler-darwin-arm64', 'platform', ['bin/zenith-bundler']),
    entry('packages/bundler-darwin-x64', '@zenithbuild/bundler-darwin-x64', 'platform', ['bin/zenith-bundler']),
    entry('packages/bundler-linux-x64', '@zenithbuild/bundler-linux-x64', 'platform', ['bin/zenith-bundler']),
    entry('packages/bundler-win32-x64', '@zenithbuild/bundler-win32-x64', 'platform', ['bin/zenith-bundler.exe']),
    entry('packages/compiler-darwin-arm64', '@zenithbuild/compiler-darwin-arm64', 'platform', ['bin/zenith-compiler']),
    entry('packages/compiler-darwin-x64', '@zenithbuild/compiler-darwin-x64', 'platform', ['bin/zenith-compiler']),
    entry('packages/compiler-linux-x64', '@zenithbuild/compiler-linux-x64', 'platform', ['bin/zenith-compiler']),
    entry('packages/compiler-win32-x64', '@zenithbuild/compiler-win32-x64', 'platform', ['bin/zenith-compiler.exe']),
    entry('packages/bundler', '@zenithbuild/bundler', 'release', ['dist/index.js', 'scripts/render-assets.mjs']),
    entry('packages/compiler', '@zenithbuild/compiler', 'release', ['dist/index.js']),
    entry('packages/runtime', '@zenithbuild/runtime', 'release', ['dist/index.js', 'dist/template.js']),
    entry('packages/router', '@zenithbuild/router', 'release', ['dist/index.js', 'dist/ZenLink.zen', 'template.js']),
    entry('packages/core', '@zenithbuild/core', 'release', ['dist/index.js', 'bin/zenith.js']),
    entry('packages/extension-registry', '@zenithbuild/extension-registry', 'release', ['dist/index.js', 'dist/registry.json']),
    entry('packages/cli', '@zenithbuild/cli', 'release', ['dist/index.js']),
    entry('packages/create-zenith', 'create-zenith', 'scaffolder', ['dist/cli.js'])
];

const FORBIDDEN_PACKED_PREFIXES = ['src/', 'tests/', 'test/', '__tests__/', '.github/', 'coverage/'];

function normalizePath(value) {
    return String(value || '')
        .replaceAll('\\', '/')
        .replace(/\/+/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');
}

function readSpawnText(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (value == null) {
        return '';
    }
    return String(value);
}

function shouldUseShellForNpm(platform, npmBin) {
    return platform === 'win32' && /(?:^|[\\/])npm(?:\.cmd)?$/i.test(String(npmBin || ''));
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function extractJsonPayload(raw, description) {
    const text = readSpawnText(raw);
    const objectStart = text.indexOf('{');
    const arrayStart = text.indexOf('[');
    const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
    if (start === -1) {
        throw new Error(`No JSON payload found in npm output for ${description}`);
    }
    const payload = text.slice(start).trim();
    return JSON.parse(payload);
}

function globPatternToRegExp(pattern) {
    let source = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        const next = pattern[index + 1];
        if (char === '*' && next === '*') {
            source += '.*';
            index += 1;
            continue;
        }
        if (char === '*') {
            source += '[^/]*';
            continue;
        }
        if (char === '?') {
            source += '[^/]';
            continue;
        }
        source += /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
    }
    source += '$';
    return new RegExp(source);
}

function filePatternMatches(pattern, packedFile) {
    const normalizedPattern = normalizePath(pattern);
    if (!normalizedPattern) {
        return false;
    }
    if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
        return globPatternToRegExp(normalizedPattern).test(packedFile);
    }
    return packedFile === normalizedPattern || packedFile.startsWith(`${normalizedPattern}/`);
}

function collectStringTarget(value, label, targets) {
    if (typeof value !== 'string') {
        return;
    }
    const target = normalizePath(value);
    if (!target || target.startsWith('../')) {
        return;
    }
    targets.push({ label, path: target });
}

function collectExports(value, label, targets) {
    if (typeof value === 'string') {
        collectStringTarget(value, label, targets);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entryValue, index) => collectExports(entryValue, `${label}[${index}]`, targets));
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }
    for (const [condition, entryValue] of Object.entries(value)) {
        collectExports(entryValue, `${label}.${condition}`, targets);
    }
}

function collectBrowserTargets(browser, targets) {
    if (typeof browser === 'string') {
        collectStringTarget(browser, 'browser', targets);
        return;
    }
    if (!browser || typeof browser !== 'object') {
        return;
    }
    for (const [key, value] of Object.entries(browser)) {
        collectStringTarget(key, 'browser', targets);
        collectStringTarget(value, 'browser', targets);
    }
}

function collectManifestTargets(pkg) {
    const targets = [];
    collectStringTarget(pkg.main, 'main', targets);
    collectStringTarget(pkg.module, 'module', targets);
    collectStringTarget(pkg.types, 'types', targets);
    collectStringTarget(pkg.typings, 'typings', targets);
    collectBrowserTargets(pkg.browser, targets);
    if (Array.isArray(pkg.man)) {
        pkg.man.forEach((entryValue, index) => collectStringTarget(entryValue, `man[${index}]`, targets));
    } else {
        collectStringTarget(pkg.man, 'man', targets);
    }
    if (typeof pkg.bin === 'string') {
        collectStringTarget(pkg.bin, 'bin', targets);
    } else if (pkg.bin && typeof pkg.bin === 'object') {
        for (const [command, entryValue] of Object.entries(pkg.bin)) {
            collectStringTarget(entryValue, `bin.${command}`, targets);
        }
    }
    if (pkg.exports && typeof pkg.exports === 'object') {
        for (const [exportKey, exportValue] of Object.entries(pkg.exports)) {
            collectExports(exportValue, `exports.${exportKey}`, targets);
        }
    }
    return targets;
}

function collectTopLevelPublishCandidates(root = REPO_ROOT) {
    const packagesRoot = join(root, 'packages');
    const directories = readdirSync(packagesRoot, { withFileTypes: true })
        .filter((entryValue) => entryValue.isDirectory())
        .map((entryValue) => entryValue.name)
        .sort();
    const candidates = [];
    for (const directory of directories) {
        const packageDir = normalizePath(join('packages', directory));
        const manifestPath = join(root, packageDir, 'package.json');
        if (!existsSync(manifestPath)) {
            continue;
        }
        const pkg = readJson(manifestPath);
        if (pkg.private === true) {
            continue;
        }
        candidates.push({ dir: packageDir, name: pkg.name });
    }
    return candidates;
}

export function assertPublishSurfaceMatrixCoverage({
    root = REPO_ROOT,
    matrix = PUBLISH_SURFACE_MATRIX,
    manifestEntries = collectTopLevelPublishCandidates(root)
} = {}) {
    const normalizedManifestEntries = manifestEntries.map((item) => ({
        ...item,
        dir: normalizePath(item.dir)
    }));
    const normalizedMatrix = matrix.map((item) => ({
        ...item,
        dir: normalizePath(item.dir)
    }));
    const matrixByDir = new Map();
    const duplicateDirs = new Set();
    const duplicateNames = new Set();
    const names = new Set();

    for (const item of normalizedMatrix) {
        if (matrixByDir.has(item.dir)) {
            duplicateDirs.add(item.dir);
        }
        matrixByDir.set(item.dir, item);
        if (names.has(item.name)) {
            duplicateNames.add(item.name);
        }
        names.add(item.name);
    }

    const missing = normalizedManifestEntries.filter((item) => !matrixByDir.has(item.dir));
    const extra = normalizedMatrix.filter((item) => !normalizedManifestEntries.some((entryValue) => entryValue.dir === item.dir));
    const mismatchedNames = normalizedManifestEntries
        .filter((item) => matrixByDir.has(item.dir) && matrixByDir.get(item.dir).name !== item.name)
        .map((item) => `${item.dir}: matrix=${matrixByDir.get(item.dir).name}, manifest=${item.name}`);

    const problems = [];
    if (duplicateDirs.size > 0) {
        problems.push(`duplicate matrix dirs: ${[...duplicateDirs].join(', ')}`);
    }
    if (duplicateNames.size > 0) {
        problems.push(`duplicate matrix names: ${[...duplicateNames].join(', ')}`);
    }
    if (missing.length > 0) {
        problems.push(`missing matrix entries: ${missing.map((item) => `${item.dir} (${item.name})`).join(', ')}`);
    }
    if (extra.length > 0) {
        problems.push(`matrix entries without top-level package manifests: ${extra.map((item) => item.dir).join(', ')}`);
    }
    if (mismatchedNames.length > 0) {
        problems.push(`matrix name mismatches: ${mismatchedNames.join('; ')}`);
    }
    if (problems.length > 0) {
        throw new Error(`Publish surface matrix mismatch: ${problems.join(' | ')}`);
    }
}

export function selectPublishMatrixEntries({ selection = 'all', filter = '', matrix = PUBLISH_SURFACE_MATRIX } = {}) {
    const validSelections = new Set(['all', 'framework', 'platform', 'release', 'scaffolder']);
    if (!validSelections.has(selection)) {
        throw new Error(`Unknown publish surface selection: ${selection}`);
    }

    let entries = matrix.filter((item) => {
        if (selection === 'all') {
            return true;
        }
        if (selection === 'framework') {
            return item.stage === 'platform' || item.stage === 'release';
        }
        return item.stage === selection;
    });

    const tokens = String(filter || '')
        .split(',')
        .map((value) => normalizePath(value.trim()))
        .filter(Boolean);
    if (tokens.length === 0) {
        return entries;
    }

    const unmatched = tokens.filter((token) => !entries.some((item) => item.dir === token || item.name === token));
    if (unmatched.length > 0) {
        throw new Error(`Unknown publish surface filter entries for ${selection}: ${unmatched.join(', ')}`);
    }
    entries = entries.filter((item) => tokens.some((token) => item.dir === token || item.name === token));
    if (entries.length === 0) {
        throw new Error(`No publish surface packages selected for ${selection}`);
    }
    return entries;
}

export function listPublishMatrixLines(options = {}) {
    return selectPublishMatrixEntries(options).map((item) => `${item.dir}|${item.name}`);
}

function verifyPackagePublishSurface({ root, entry, npmBin, spawn = spawnSync, platform = process.platform }) {
    const packageRoot = join(root, entry.dir);
    const manifestPath = join(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) {
        throw new Error(`Missing package manifest: ${manifestPath}`);
    }

    const pkg = readJson(manifestPath);
    if (pkg.private === true) {
        throw new Error(`Refusing to verify private package manifest: ${manifestPath}`);
    }
    if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
        throw new Error(`Missing non-empty files whitelist in ${manifestPath}`);
    }
    const repositoryUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
    if (repositoryUrl !== EXPECTED_REPOSITORY_URL) {
        throw new Error(`Invalid repository.url in ${manifestPath}: expected ${EXPECTED_REPOSITORY_URL}, found ${repositoryUrl || '(empty)'}`);
    }
    if (pkg.name !== entry.name) {
        throw new Error(`Package name mismatch in ${manifestPath}: expected ${entry.name}, found ${pkg.name || '(empty)'}`);
    }

    const result = spawn(npmBin, ['pack', '--dry-run', '--json', '.'], {
        cwd: packageRoot,
        encoding: 'utf8',
        env: process.env,
        shell: shouldUseShellForNpm(platform, npmBin)
    });
    const stdout = readSpawnText(result.stdout);
    const stderr = readSpawnText(result.stderr);
    const spawnError = result.error instanceof Error ? result.error.message : '';
    if (result.status !== 0 || result.error) {
        const details = [
            `npm pack --dry-run failed for ${entry.dir}`,
            spawnError ? `error:\n${spawnError}` : '',
            `stdout:\n${stdout.trim()}`,
            `stderr:\n${stderr.trim()}`
        ].filter(Boolean);
        throw new Error(
            details.join('\n')
        );
    }

    const payload = extractJsonPayload(stdout, `${entry.name} pack`);
    const files = Array.isArray(payload) && payload[0]?.files ? payload[0].files : [];
    const packedFiles = files.map((item) => normalizePath(item.path)).filter(Boolean);
    const packedSet = new Set(packedFiles);

    if (!packedSet.has('package.json')) {
        throw new Error(`${entry.dir}: package.json missing from npm pack output`);
    }

    for (const pattern of pkg.files) {
        if (!packedFiles.some((packedFile) => filePatternMatches(pattern, packedFile))) {
            throw new Error(`${entry.dir}: files entry "${pattern}" matched no packed files`);
        }
    }

    const leakedFiles = packedFiles.filter((packedFile) => FORBIDDEN_PACKED_PREFIXES.some((prefix) => packedFile.startsWith(prefix)));
    if (leakedFiles.length > 0) {
        throw new Error(`${entry.dir}: forbidden source/test files leaked into tarball: ${leakedFiles.join(', ')}`);
    }

    for (const requiredFile of entry.requiredPackFiles) {
        const normalizedRequired = normalizePath(requiredFile);
        if (!packedSet.has(normalizedRequired)) {
            throw new Error(`${entry.dir}: required packed file missing: ${normalizedRequired}`);
        }
    }

    for (const target of collectManifestTargets(pkg)) {
        if (!packedSet.has(target.path)) {
            throw new Error(`${entry.dir}: manifest target ${target.label} -> ${target.path} missing from npm pack output`);
        }
    }

    return {
        dir: entry.dir,
        name: entry.name,
        packedFiles: packedFiles.length
    };
}

export function verifyPublishSurface({
    root = REPO_ROOT,
    matrix = PUBLISH_SURFACE_MATRIX,
    selection = 'all',
    filter = '',
    npmBin = DEFAULT_NPM_BIN,
    spawn = spawnSync,
    platform = process.platform
} = {}) {
    assertPublishSurfaceMatrixCoverage({ root, matrix });
    const entries = selectPublishMatrixEntries({ selection, filter, matrix });
    return entries.map((entryValue) => verifyPackagePublishSurface({ root, entry: entryValue, npmBin, spawn, platform }));
}
