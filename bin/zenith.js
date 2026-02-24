#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Version mismatch check
const corePkgPath = join(__dirname, '../package.json');
const corePkg = JSON.parse(readFileSync(corePkgPath, 'utf-8'));

const expectedInternals = [
    '@zenithbuild/cli',
    '@zenithbuild/compiler',
    '@zenithbuild/runtime',
    '@zenithbuild/router',
    '@zenithbuild/bundler'
];

let hasMismatch = false;

for (const internal of expectedInternals) {
    const expectedVersion = corePkg.dependencies[internal];
    if (!expectedVersion) continue;

    try {
        const entryPath = require.resolve(internal);

        // Walk up to find the package's package.json
        let currentDir = dirname(entryPath);
        let pkgVersion = null;

        while (currentDir !== '/' && currentDir !== '.') {
            try {
                const pkgTxt = readFileSync(join(currentDir, 'package.json'), 'utf-8');
                const pkg = JSON.parse(pkgTxt);
                if (pkg.name === internal) {
                    pkgVersion = pkg.version;
                    break;
                }
            } catch (e) {
                // Ignored, continue walking up
            }
            currentDir = dirname(currentDir);
        }

        if (pkgVersion && pkgVersion !== expectedVersion) {
            console.error(`Version mismatch: ${internal} is version ${pkgVersion} but @zenithbuild/core expects exactly ${expectedVersion}`);
            hasMismatch = true;
        } else if (!pkgVersion) {
            // In a strict mode, failing to find package.json might be treated as a failure.
        }
    } catch (err) {
        console.error(`Version mismatch check failed: Could not resolve internal dependency ${internal}`);
        hasMismatch = true;
    }
}

if (hasMismatch) {
    process.exit(1);
}

// Proceed to hand off execution to the underlying CLI implementation
import('@zenithbuild/cli');
