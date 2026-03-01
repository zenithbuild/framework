#!/usr/bin/env node
// ---------------------------------------------------------------------------
// index.js — Zenith CLI V0 Entry Point
// ---------------------------------------------------------------------------
// Commands:
//   zenith dev      — Development server + HMR
//   zenith build    — Static site generation to /dist
//   zenith preview  — Serve /dist statically
//
// Minimal arg parsing. No heavy dependencies.
// ---------------------------------------------------------------------------

import { resolve, join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger } from './ui/logger.js';

const COMMANDS = ['dev', 'build', 'preview'];
const DEFAULT_VERSION = '0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getCliVersion() {
    try {
        const pkgPath = join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : DEFAULT_VERSION;
    } catch {
        return DEFAULT_VERSION;
    }
}

function printUsage(logger) {
    logger.heading('V0');
    logger.print('Usage:');
    logger.print('  zenith dev [port|--port <port>]      Start development server');
    logger.print('  zenith build                         Build static site to /dist');
    logger.print('  zenith preview [port|--port <port>]  Preview /dist statically');
    logger.print('');
    logger.print('Options:');
    logger.print('  -h, --help        Show this help message');
    logger.print('  -v, --version     Print Zenith CLI version');
    logger.print('');
}

function resolvePort(args, fallback) {
    if (!Array.isArray(args) || args.length === 0) {
        return fallback;
    }

    const flagIndex = args.findIndex((arg) => arg === '--port' || arg === '-p');
    if (flagIndex >= 0 && args[flagIndex + 1]) {
        const parsed = Number.parseInt(args[flagIndex + 1], 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    const positional = args.find((arg) => /^[0-9]+$/.test(arg));
    if (positional) {
        const parsed = Number.parseInt(positional, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
}

/**
 * Load zenith.config.js from project root.
 *
 * @param {string} projectRoot
 * @returns {Promise<object>}
 */
async function loadConfig(projectRoot) {
    const configPath = join(projectRoot, 'zenith.config.js');
    try {
        const mod = await import(configPath);
        return mod.default || {};
    } catch {
        return {};
    }
}

/**
 * CLI entry point.
 *
 * @param {string[]} args - Process arguments (without node and script paths)
 * @param {string} [cwd] - Working directory override
 */
export async function cli(args, cwd) {
    const logger = createLogger(process);
    const command = args[0];
    const cliVersion = getCliVersion();

    if (args.includes('--version') || args.includes('-v')) {
        logger.print(`zenith ${cliVersion}`);
        process.exit(0);
    }

    if (args.includes('--help') || args.includes('-h')) {
        printUsage(logger);
        process.exit(0);
    }

    if (!command || !COMMANDS.includes(command)) {
        printUsage(logger);
        process.exit(command ? 1 : 0);
    }

    const projectRoot = resolve(cwd || process.cwd());
    const rootPagesDir = join(projectRoot, 'pages');
    const srcPagesDir = join(projectRoot, 'src', 'pages');
    const pagesDir = existsSync(rootPagesDir) ? rootPagesDir : srcPagesDir;
    const outDir = join(projectRoot, 'dist');
    const config = await loadConfig(projectRoot);

    if (command === 'build') {
        const { build } = await import('./build.js');
        logger.info('Building...');
        const result = await build({ pagesDir, outDir, config });
        logger.success(`Built ${result.pages} page(s), ${result.assets.length} asset(s)`);
        logger.summary([{ label: 'Output', value: './dist' }]);
    }

    if (command === 'dev') {
        const { createDevServer } = await import('./dev-server.js');
        const port = process.env.ZENITH_DEV_PORT
            ? Number.parseInt(process.env.ZENITH_DEV_PORT, 10)
            : resolvePort(args.slice(1), 3000);
        const host = process.env.ZENITH_DEV_HOST || '127.0.0.1';
        logger.info('Starting dev server...');
        const dev = await createDevServer({ pagesDir, outDir, port, host, config });
        logger.success(`Dev server running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${dev.port}`);

        // Graceful shutdown
        process.on('SIGINT', () => {
            dev.close();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            dev.close();
            process.exit(0);
        });
    }

    if (command === 'preview') {
        const { createPreviewServer } = await import('./preview.js');
        const port = resolvePort(args.slice(1), 4000);
        const host = process.env.ZENITH_PREVIEW_HOST || '127.0.0.1';
        logger.info('Starting preview server...');
        const preview = await createPreviewServer({ distDir: outDir, port, host });
        logger.success(`Preview server running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${preview.port}`);

        process.on('SIGINT', () => {
            preview.close();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            preview.close();
            process.exit(0);
        });
    }
}

// Auto-run if called directly
const isDirectRun = process.argv[1] && (
    process.argv[1].endsWith('/index.js') ||
    process.argv[1].endsWith('/zenith')
);

if (isDirectRun) {
    cli(process.argv.slice(2)).catch((error) => {
        const logger = createLogger(process);
        logger.error(error);
        process.exit(1);
    });
}
