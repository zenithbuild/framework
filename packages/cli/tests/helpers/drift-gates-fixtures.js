import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

export const INTERNAL_PACKAGE_NAMES = [
    '@zenithbuild/core',
    '@zenithbuild/cli',
    '@zenithbuild/compiler',
    '@zenithbuild/compiler-darwin-arm64',
    '@zenithbuild/compiler-darwin-x64',
    '@zenithbuild/compiler-linux-x64',
    '@zenithbuild/compiler-win32-x64',
    '@zenithbuild/runtime',
    '@zenithbuild/router',
    '@zenithbuild/bundler',
    '@zenithbuild/bundler-darwin-arm64',
    '@zenithbuild/bundler-darwin-x64',
    '@zenithbuild/bundler-linux-x64',
    '@zenithbuild/bundler-win32-x64'
];

export const INTERNAL_DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

export const TRAIN_MANIFESTS = [
    'packages/core/package.json',
    'packages/cli/package.json',
    'packages/compiler/package.json',
    'packages/compiler-darwin-arm64/package.json',
    'packages/compiler-darwin-x64/package.json',
    'packages/compiler-linux-x64/package.json',
    'packages/compiler-win32-x64/package.json',
    'packages/runtime/package.json',
    'packages/router/package.json',
    'packages/bundler/package.json',
    'packages/bundler-darwin-arm64/package.json',
    'packages/bundler-darwin-x64/package.json',
    'packages/bundler-linux-x64/package.json',
    'packages/bundler-win32-x64/package.json'
];

export function collectFiles(dir, allowExt) {
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

export function scanFiles(files, matcher) {
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
