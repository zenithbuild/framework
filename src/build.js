// ---------------------------------------------------------------------------
// build.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// SSG build engine.
//
// Pipeline:
//   manifest → compile (per page) → bundle (per IR) → write /dist
//
// V0: Compiler and bundler are stub interfaces.
// Integration phase will swap to real @zenithbuild/compiler and @zenithbuild/bundler.
//
// Rules:
//   - Each page produces one HTML file
//   - No JS emitted for static-only pages
//   - Content-hashed JS/CSS filenames
//   - Deterministic output for identical input
// ---------------------------------------------------------------------------

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { generateManifest } from './manifest.js';
import { compile } from '@zenithbuild/compiler';

/**
 * @typedef {{ html: string, js?: string, css?: string, hasExpressions: boolean }} PageBundle
 * @typedef {{ compile: (filePath: string) => Promise<object>, bundle: (ir: object) => Promise<PageBundle> }} Toolchain
 */

/**
 * Compiler bridge invocation.
 * Calls the sealed Rust-backed compiler package.
 *
 * @param {string} filePath
 * @returns {Promise<object>}
 */
export async function bridgeCompile(filePath) {
    const output = compile(filePath);
    return {
        file: filePath,
        ir: output,
        hasExpressions: Array.isArray(output.expressions) && output.expressions.length > 0
    };
}

// Backward-compatible alias for existing imports.
export const stubCompile = bridgeCompile;

/**
 * Default stub bundler — returns static HTML.
 * Will be replaced with @zenithbuild/bundler in integration phase.
 *
 * @param {object} ir
 * @returns {Promise<PageBundle>}
 */
export async function stubBundle(ir) {
    return {
        html: `<!DOCTYPE html><html><head></head><body><!-- ${ir.file} --></body></html>`,
        hasExpressions: ir.hasExpressions || false
    };
}

/**
 * Simple content hash for deterministic filenames.
 *
 * @param {string} content
 * @returns {string} - 8-char hex hash
 */
export function contentHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit int
    }
    return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Convert a route path to an output file path.
 *
 * /           → index.html
 * /about      → about/index.html
 * /users/:id  → users/[id]/index.html
 *
 * @param {string} routePath
 * @returns {string}
 */
export function routeToOutputPath(routePath) {
    if (routePath === '/') {
        return 'index.html';
    }

    const segments = routePath.split('/').filter(Boolean).map((seg) => {
        // :param → [param] for directory name
        if (seg.startsWith(':')) {
            return `[${seg.slice(1)}]`;
        }
        return seg;
    });

    return segments.join('/') + '/index.html';
}

/**
 * Build all pages to the output directory.
 *
 * @param {{ pagesDir: string, outDir: string, toolchain?: Toolchain, config?: object }} options
 * @returns {Promise<{ pages: number, assets: string[] }>}
 */
export async function build(options) {
    const { pagesDir, outDir, config = {} } = options;
    const compilePage = options.toolchain?.compile || bridgeCompile;
    const bundle = options.toolchain?.bundle || stubBundle;

    // Clean output directory
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    // Generate manifest
    const manifest = await generateManifest(pagesDir);

    const assets = [];
    let pageCount = 0;

    for (const entry of manifest) {
        // 1. Compile
        const ir = await compilePage(join(pagesDir, entry.file));

        // 2. Bundle
        const result = await bundle(ir);

        // 3. Write HTML
        const htmlPath = join(outDir, routeToOutputPath(entry.path));
        await mkdir(dirname(htmlPath), { recursive: true });

        let finalHtml = result.html;

        // 4. Write JS/CSS assets only if page has expressions
        if (result.hasExpressions && result.js) {
            const jsHash = contentHash(result.js);
            const jsFile = `assets/${jsHash}.js`;
            const jsPath = join(outDir, jsFile);
            await mkdir(dirname(jsPath), { recursive: true });
            await writeFile(jsPath, result.js);
            assets.push(jsFile);

            // Inject script tag
            finalHtml = finalHtml.replace(
                '</body>',
                `<script type="module" src="/${jsFile}"></script></body>`
            );
        }

        if (result.css) {
            const cssHash = contentHash(result.css);
            const cssFile = `assets/${cssHash}.css`;
            const cssPath = join(outDir, cssFile);
            await mkdir(dirname(cssPath), { recursive: true });
            await writeFile(cssPath, result.css);
            assets.push(cssFile);

            // Inject link tag
            finalHtml = finalHtml.replace(
                '</head>',
                `<link rel="stylesheet" href="/${cssFile}"></head>`
            );
        }

        await writeFile(htmlPath, finalHtml);
        pageCount++;
    }

    return { pages: pageCount, assets };
}
