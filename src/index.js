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

import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from './ui/logger.js';

const COMMANDS = ['dev', 'build', 'preview'];

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

    if (!command || !COMMANDS.includes(command)) {
        logger.heading('V0');
        logger.print('Usage:');
        logger.print('  zenith dev       Start development server');
        logger.print('  zenith build     Build static site to /dist');
        logger.print('  zenith preview   Preview /dist statically');
        logger.print('');
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
        const port = parseInt(args[1]) || 3000;
        logger.info('Starting dev server...');
        const dev = await createDevServer({ pagesDir, outDir, port, config });
        logger.success(`Dev server running at http://localhost:${dev.port}`);

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
        const port = parseInt(args[1]) || 4000;
        logger.info('Starting preview server...');
        const preview = await createPreviewServer({ distDir: outDir, port });
        logger.success(`Preview server running at http://localhost:${preview.port}`);

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
