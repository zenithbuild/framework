import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { discoverPublicAssets } from './public-assets.js';
import { createRequire } from 'node:module';
import { loadImagePackage } from './image-package-loader.js';
import { devInstallCommand } from './install-command.js';

const CLI_VERSION = createRequire(import.meta.url)('../package.json').version;

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

/**
 * `<Image>` in the source tree requires the package. Raster files in public/
 * alone (favicons, social images) only use it when it is installed; otherwise
 * they are copied verbatim.
 *
 * @returns {Promise<'component' | 'public-raster' | null>}
 */
export async function projectUsesImages(projectRoot, sourceDir = projectRoot) {
    if (await hasImageComponent(sourceDir)) return 'component';
    const assets = await discoverPublicAssets(projectRoot);
    return assets.some((asset) => RASTER.has(extname(asset.publicPath).toLowerCase())) ? 'public-raster' : null;
}

// Run this preflight before compilation or output removal. A no-image project
// never resolves the optional package, even when another workspace installs it.
/** @returns {Promise<{api: Record<string, (...args: any[]) => any>, componentPath: string | null, packageRoot: string | null, sharpVersionRange: string | null, notice: string | null}>} */
export async function prepareProjectImages(projectRoot, sourceDir = projectRoot) {
    const usage = await projectUsesImages(projectRoot, sourceDir);
    const loaded = await loadImagePackage({ projectRoot, required: usage === 'component', ifInstalled: usage === 'public-raster' });
    if (loaded) return { ...loaded, notice: null };
    const notice = usage === 'public-raster'
        ? `Raster files in public/ are copied unoptimized. To optimize them, run ${devInstallCommand(projectRoot, `@zenithbuild/image@${CLI_VERSION}`)}.`
        : null;
    return { api: NO_IMAGES, componentPath: null, packageRoot: null, sharpVersionRange: null, notice };
}

export async function writeImagePackageMarker(outDir, imagePackage) {
    if (!imagePackage?.packageRoot) return;
    const manifest = JSON.parse(await readFile(join(imagePackage.packageRoot, 'package.json'), 'utf8'));
    const markerDir = join(outDir, '_zenith', 'image');
    await mkdir(markerDir, { recursive: true });
    await writeFile(join(markerDir, 'package.json'), JSON.stringify({ name: manifest.name, version: manifest.version }) + '\n');
}

/**
 * Preview serves what build produced: build writes the marker only when it used
 * the image package, so preview never rescans sources. Resolved once per server.
 */
export function createProjectImageApi(projectRoot, distDir) {
    let pending = null;
    async function resolveApi() {
        let marker;
        try {
            marker = JSON.parse(await readFile(join(distDir, '_zenith', 'image', 'package.json'), 'utf8'));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (marker?.name !== '@zenithbuild/image') return NO_IMAGES;
        return (await loadImagePackage({ projectRoot, required: true })).api;
    }
    return () => {
        pending ||= resolveApi().catch((error) => { pending = null; throw error; });
        return pending;
    };
}
