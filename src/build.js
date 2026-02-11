// ---------------------------------------------------------------------------
// build.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Orchestration-only build engine.
//
// Pipeline:
//   manifest → compiler process → sealed envelope → bundler process
//
// The CLI does not inspect IR fields and does not write output files.
// The bundler owns all asset and HTML emission.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateManifest } from './manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');

/**
 * Resolve a binary path from deterministic candidates.
 *
 * Supports both repository layout (../zenith-*) and installed package layout
 * under node_modules/@zenithbuild (../compiler, ../bundler).
 *
 * @param {string[]} candidates
 * @returns {string}
 */
function resolveBinary(candidates) {
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}

const COMPILER_BIN = resolveBinary([
    resolve(CLI_ROOT, '../compiler/target/release/zenith-compiler'),
    resolve(CLI_ROOT, '../zenith-compiler/target/release/zenith-compiler')
]);

const BUNDLER_BIN = resolveBinary([
    resolve(CLI_ROOT, '../bundler/target/release/zenith-bundler'),
    resolve(CLI_ROOT, '../zenith-bundler/target/release/zenith-bundler')
]);

/**
 * Run the compiler process and parse its JSON stdout.
 *
 * @param {string} filePath
 * @returns {object}
 */
function runCompiler(filePath) {
    const result = spawnSync(COMPILER_BIN, [filePath], { encoding: 'utf8' });

    if (result.error) {
        throw new Error(`Compiler spawn failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(result.stderr || `Compiler failed with exit code ${result.status}`);
    }

    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        throw new Error(`Compiler emitted invalid JSON: ${err.message}`);
    }
}

/**
 * Run bundler process for one page envelope.
 *
 * @param {object} envelope
 * @param {string} outDir
 * @returns {Promise<void>}
 */
function runBundler(envelope, outDir) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(
            BUNDLER_BIN,
            ['--out-dir', outDir],
            { stdio: ['pipe', 'inherit', 'inherit'] }
        );

        child.on('error', (err) => {
            rejectPromise(new Error(`Bundler spawn failed: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }
            rejectPromise(new Error(`Bundler failed with exit code ${code}`));
        });

        child.stdin.write(JSON.stringify(envelope));
        child.stdin.end();
    });
}

/**
 * Collect generated assets for reporting.
 *
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
async function collectAssets(rootDir) {
    const files = [];

    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const name of entries) {
            const fullPath = join(dir, name);
            const info = await stat(fullPath);
            if (info.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
                files.push(relative(rootDir, fullPath).replaceAll('\\', '/'));
            }
        }
    }

    await walk(rootDir);
    files.sort((a, b) => a.localeCompare(b));
    return files;
}

/**
 * Build all pages by orchestrating compiler and bundler binaries.
 *
 * @param {{ pagesDir: string, outDir: string, config?: object }} options
 * @returns {Promise<{ pages: number, assets: string[] }>}
 */
export async function build(options) {
    const { pagesDir, outDir, config = {} } = options;
    const routerEnabled = config.router === true;

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const manifest = await generateManifest(pagesDir);

    for (const entry of manifest) {
        const sourceFile = join(pagesDir, entry.file);
        const ir = runCompiler(sourceFile);
        const envelope = {
            route: entry.path,
            file: sourceFile,
            ir,
            router: routerEnabled
        };
        await runBundler(envelope, outDir);
    }

    const assets = await collectAssets(outDir);
    return { pages: manifest.length, assets };
}
