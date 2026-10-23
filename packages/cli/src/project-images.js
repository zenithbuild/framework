import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { createImageRuntimePayload, injectImageRuntimePayload } from './image-config.js';
import { buildComponentRegistry } from './resolve-components.js';
import { discoverPublicAssets } from './public-assets.js';
import { createRequire } from 'node:module';
import { loadImagePackage } from './image-package-loader.js';
import { devInstallCommand } from './install-command.js';

const CLI_VERSION = createRequire(import.meta.url)('../package.json').version;

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const SKIP = new Set(['node_modules', '.git', '.zenith-output', '.zenith', 'dist', 'build']);
// Without @zenithbuild/image there are no Image markers to materialize, but
// the runtime payload script (also emitted for unsafeHTML) is part of the
// output contract and comes from the shared image config.
async function injectImageRuntimePayloadIntoHtmlFiles(rootDir, payload) {
    let entries = [];
    try {
        entries = await readdir(rootDir);
    } catch {
        return;
    }
    entries.sort((left, right) => left.localeCompare(right));
    for (const entry of entries) {
        const fullPath = join(rootDir, entry);
        if ((await stat(fullPath)).isDirectory()) {
            await injectImageRuntimePayloadIntoHtmlFiles(fullPath, payload);
            continue;
        }
        if (!entry.endsWith('.html')) continue;
        const html = await readFile(fullPath, 'utf8');
        const next = injectImageRuntimePayload(html, payload);
        if (next !== html) await writeFile(fullPath, next, 'utf8');
    }
}

const NO_IMAGES = {
    buildImageArtifacts: async () => ({ manifest: {} }),
    createImageRuntimePayload,
    materializeImageMarkup: async ({ html }) => html,
    materializeImageMarkupInHtmlFiles: async () => {},
    injectImageRuntimePayload,
    injectImageRuntimePayloadIntoHtmlFiles,
    handleImageRequest: async (_req, res) => { res.writeHead(404); res.end('Not Found'); },
    handleImageFetchRequest: async () => new Response('Not Found', { status: 404 })
};

// Non-public build metadata: lives next to .zenith-output/manifest.json, never
// in the deployable output directory.
const IMAGE_PACKAGE_MARKER = 'image-package.json';

async function findImageComponentUsers(dir, found = [], visited = new Set()) {
    if (visited.has(dir)) return found;
    visited.add(dir);
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return found; throw error; }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && !SKIP.has(entry.name)) await findImageComponentUsers(path, found, visited);
        // Do not follow directory symlinks into dependencies or outside the project.
        if (entry.isFile() && entry.name.endsWith('.zen') && /<Image(?=[\s/>])/.test(await readFile(path, 'utf8'))) found.push(path);
    }
    return found;
}

/** A project-defined `Image.zen` component owns the `<Image>` tag. */
function hasLocalImageComponent(sourceDir) {
    try {
        return buildComponentRegistry(sourceDir).has('Image');
    } catch {
        // Duplicate local names are reported by the build's own registry pass.
        return false;
    }
}

function projectRelative(projectRoot, path) {
    return relative(projectRoot, path).split(sep).join('/');
}

/**
 * `<Image>` in the source tree requires the package. Raster files in public/
 * alone (favicons, social images) only use it when it is installed; otherwise
 * they are copied verbatim.
 *
 * @returns {Promise<'component' | 'public-raster' | null>}
 */
export async function projectUsesImages(projectRoot, sourceDir = projectRoot) {
    return (await detectImageUsage(projectRoot, sourceDir)).usage;
}

async function detectImageUsage(projectRoot, sourceDir) {
    if (!hasLocalImageComponent(sourceDir)) {
        const users = await findImageComponentUsers(sourceDir);
        if (users.length > 0) {
            return { usage: 'component', users: users.map((path) => projectRelative(projectRoot, path)), localImageComponent: false };
        }
    }
    const assets = await discoverPublicAssets(projectRoot);
    const usage = assets.some((asset) => RASTER.has(extname(asset.publicPath).toLowerCase())) ? 'public-raster' : null;
    return { usage, users: [], localImageComponent: hasLocalImageComponent(sourceDir) };
}

// Run this preflight before compilation or output removal. A no-image project
// never resolves the optional package, even when another workspace installs it.
// A project-defined Image.zen wins over the package component: `<Image>` then
// needs no package, and an installed package only optimizes public rasters.
/** @returns {Promise<{api: Record<string, (...args: any[]) => any>, componentPath: string | null, packageRoot: string | null, sharpVersionRange: string | null, notice: string | null}>} */
export async function prepareProjectImages(projectRoot, sourceDir = projectRoot) {
    const { usage, users, localImageComponent } = await detectImageUsage(projectRoot, sourceDir);
    const loaded = await loadImagePackage({
        projectRoot, required: usage === 'component', ifInstalled: usage === 'public-raster', usedBy: users
    });
    if (loaded) return { ...loaded, componentPath: localImageComponent ? null : loaded.componentPath, notice: null };
    const notice = usage === 'public-raster'
        ? `Raster files in public/ are copied unoptimized. To optimize them, run ${devInstallCommand(projectRoot, `@zenithbuild/image@${CLI_VERSION}`)}.`
        : null;
    return { api: NO_IMAGES, componentPath: null, packageRoot: null, sharpVersionRange: null, notice };
}

export function imagePackageMarkerPath(projectRoot) {
    return join(resolve(projectRoot), '.zenith-output', IMAGE_PACKAGE_MARKER);
}

/**
 * Record, outside the deployable output, which image package produced `outDir`.
 * Preview reads it instead of rescanning sources.
 */
export async function writeImagePackageMarker(projectRoot, outDir, imagePackage) {
    if (!imagePackage?.packageRoot) return;
    const manifest = JSON.parse(await readFile(join(imagePackage.packageRoot, 'package.json'), 'utf8'));
    const markerPath = imagePackageMarkerPath(projectRoot);
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(markerPath, JSON.stringify({ name: manifest.name, version: manifest.version, outDir: resolve(outDir) }) + '\n');
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
            marker = JSON.parse(await readFile(imagePackageMarkerPath(projectRoot), 'utf8'));
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (marker?.name !== '@zenithbuild/image' || marker.outDir !== resolve(distDir)) return NO_IMAGES;
        return (await loadImagePackage({ projectRoot, required: true })).api;
    }
    return () => {
        pending ||= resolveApi().catch((error) => { pending = null; throw error; });
        return pending;
    };
}
