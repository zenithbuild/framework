import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { discoverPublicAssets } from './public-assets.js';
import { loadImagePackage } from './image-package-loader.js';

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SKIP = new Set(['node_modules', '.git', '.zenith-output', '.zenith', 'dist', 'build']);
const NO_IMAGES = {
    buildImageArtifacts: async () => ({ manifest: {} }),
    createImageRuntimePayload: () => null,
    materializeImageMarkup: async ({ html }) => html,
    materializeImageMarkupInHtmlFiles: async () => {},
    injectImageRuntimePayload: (html) => html,
    injectImageRuntimePayloadIntoHtmlFiles: async () => {},
    handleImageRequest: async (_req, res) => { res.writeHead(404); res.end('Not Found'); },
    handleImageFetchRequest: async () => new Response('Not Found', { status: 404 })
};

async function hasImageComponent(dir, visited = new Set()) {
    if (visited.has(dir)) return false;
    visited.add(dir);
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && !SKIP.has(entry.name) && await hasImageComponent(path, visited)) return true;
        // Do not follow directory symlinks into dependencies or outside the project.
        if (entry.isFile() && entry.name.endsWith('.zen') && /<Image(?=[\s/>])/.test(await readFile(path, 'utf8'))) return true;
    }
    return false;
}

export async function projectUsesImages(projectRoot, sourceDir = projectRoot) {
    const assets = await discoverPublicAssets(projectRoot);
    return assets.some((asset) => RASTER.has(extname(asset.publicPath).toLowerCase()))
        || await hasImageComponent(sourceDir);
}

// Run this preflight before compilation or output removal. A no-image project
// never resolves the optional package, even when another workspace installs it.
/** @returns {Promise<{api: Record<string, (...args: any[]) => any>, componentPath: string | null, packageRoot: string | null, sharpVersionRange: string | null}>} */
export async function prepareProjectImages(projectRoot, sourceDir = projectRoot) {
    const required = await projectUsesImages(projectRoot, sourceDir);
    const loaded = await loadImagePackage({ projectRoot, required });
    return loaded || { api: NO_IMAGES, componentPath: null, packageRoot: null, sharpVersionRange: null };
}

export function createProjectImageApi(projectRoot) {
    // Re-evaluate usage so adding the first image during dev is handled too.
    return async () => (await prepareProjectImages(projectRoot)).api;
}
