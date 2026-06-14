#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GHSA = 'GHSA-gv7w-rqvm-qjhr';
const PACKAGE_NAME = 'esbuild';
const RANGE_START = [0, 17, 0];
const PATCHED = [0, 28, 1];

const manifestNames = new Set(['package.json']);
const npmLockNames = new Set(['package-lock.json', 'npm-shrinkwrap.json']);
const bunLockNames = new Set(['bun.lock']);

const checkedFiles = [];
const esbuildRefs = [];

for (const file of trackedFiles()) {
    const name = file.split('/').pop();
    if (manifestNames.has(name)) {
        checkedFiles.push(file);
        scanPackageJson(file);
    } else if (npmLockNames.has(name)) {
        checkedFiles.push(file);
        scanNpmLock(file);
    } else if (bunLockNames.has(name)) {
        checkedFiles.push(file);
        scanBunLock(file);
    }
}

const vulnerableRefs = esbuildRefs.filter((ref) => isVulnerable(ref.version));

console.log(
    `[${GHSA}] checked ${checkedFiles.length} tracked package manifest/lock file(s); ` +
        `scanned ${esbuildRefs.length} esbuild reference(s); ` +
        `vulnerable=${vulnerableRefs.length}`
);

if (vulnerableRefs.length > 0) {
    for (const ref of vulnerableRefs) {
        const location = ref.location ? ` ${ref.location}` : '';
        console.error(`- ${ref.file}${location}: ${ref.name}@${ref.version}`);
    }
    console.error(
        `[${GHSA}] esbuild versions >=0.17.0 and <0.28.1 are vulnerable; ` +
            `update to ${PACKAGE_NAME}@${PATCHED.join('.')} or newer.`
    );
    process.exit(1);
}

function trackedFiles() {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .sort();
}

function scanPackageJson(file) {
    const json = readJson(file);
    for (const field of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
        'overrides'
    ]) {
        collectDependencyMap(file, field, json[field]);
    }
}

function scanNpmLock(file) {
    const json = readJson(file);
    for (const [packagePath, info] of Object.entries(json.packages ?? {})) {
        const name = packageNameFromLockEntry(packagePath, info);
        if (isEsbuildPackage(name) && typeof info?.version === 'string') {
            esbuildRefs.push({
                file,
                location: packagePath || 'packages[""]',
                name,
                version: info.version
            });
        }
    }
    for (const [name, info] of Object.entries(json.dependencies ?? {})) {
        if (isEsbuildPackage(name) && typeof info?.version === 'string') {
            esbuildRefs.push({
                file,
                location: `dependencies.${name}`,
                name,
                version: info.version
            });
        }
    }
}

function scanBunLock(file) {
    const source = readFileSync(file, 'utf8');
    for (const line of source.split('\n')) {
        const packageEntry = line.match(/^\s+"([^"]+)": \["([^@"]+)@([^"]+)"/);
        if (packageEntry) {
            const [, key, packageName, version] = packageEntry;
            if (isEsbuildPackage(key) && isEsbuildPackage(packageName)) {
                esbuildRefs.push({
                    file,
                    location: key,
                    name: key,
                    version
                });
            }
            continue;
        }
        const dependencyEntry = line.match(/"(@?[^"]*esbuild[^"]*)": "([^"]+)"/);
        if (dependencyEntry) {
            const [, name, version] = dependencyEntry;
            if (isEsbuildPackage(name)) {
                esbuildRefs.push({
                    file,
                    location: 'workspace dependency',
                    name,
                    version
                });
            }
        }
    }
}

function collectDependencyMap(file, location, dependencies) {
    if (!dependencies || typeof dependencies !== 'object') {
        return;
    }
    for (const [name, version] of Object.entries(dependencies)) {
        if (isEsbuildPackage(name) && typeof version === 'string') {
            esbuildRefs.push({
                file,
                location: `${location}.${name}`,
                name,
                version
            });
        }
    }
}

function packageNameFromLockEntry(packagePath, info) {
    if (typeof info?.name === 'string') {
        return info.name;
    }
    const marker = 'node_modules/';
    if (packagePath.includes(marker)) {
        return packagePath.slice(packagePath.lastIndexOf(marker) + marker.length);
    }
    return packagePath;
}

function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8'));
}

function isEsbuildPackage(name) {
    return name === PACKAGE_NAME || name.startsWith('@esbuild/');
}

function isVulnerable(versionText) {
    const version = parseVersion(versionText);
    if (!version) {
        return false;
    }
    return compare(version, RANGE_START) >= 0 && compare(version, PATCHED) < 0;
}

function parseVersion(versionText) {
    const match = String(versionText).match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(left, right) {
    for (let i = 0; i < 3; i += 1) {
        if (left[i] !== right[i]) {
            return left[i] - right[i];
        }
    }
    return 0;
}
