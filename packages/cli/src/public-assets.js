import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

function isWithin(parent, child) {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function maybeLstat(filePath) {
    try {
        return await lstat(filePath);
    } catch {
        return null;
    }
}

function normalizePublicPath(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function routePathToPublicPath(routePath) {
    if (typeof routePath !== 'string' || routePath.length === 0) {
        return null;
    }
    if (routePath.includes(':') || routePath.includes('*')) {
        return null;
    }
    const publicPath = normalizePublicPath(routePath);
    return publicPath || null;
}

async function walkPublicRoot(rootDir) {
    const resolvedRoot = resolve(rootDir);
    const rootInfo = await maybeLstat(resolvedRoot);
    if (!rootInfo || !rootInfo.isDirectory()) {
        return [];
    }

    const files = [];
    async function walk(currentDir) {
        const entries = await readdir(currentDir, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const sourcePath = join(currentDir, entry.name);
            const info = await maybeLstat(sourcePath);
            if (!info || info.isSymbolicLink()) {
                continue;
            }
            if (info.isDirectory()) {
                await walk(sourcePath);
                continue;
            }
            if (!info.isFile()) {
                continue;
            }
            const relativePath = normalizePublicPath(relative(resolvedRoot, sourcePath));
            if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
                continue;
            }
            files.push({
                sourcePath,
                publicPath: relativePath
            });
        }
    }

    await walk(resolvedRoot);
    return files;
}

export async function discoverPublicAssets(projectRoot) {
    const resolvedProjectRoot = resolve(projectRoot);
    const roots = [
        join(resolvedProjectRoot, 'public'),
        join(resolvedProjectRoot, 'src', 'public')
    ];
    const byPublicPath = new Map();

    for (const rootDir of roots) {
        for (const asset of await walkPublicRoot(rootDir)) {
            byPublicPath.set(asset.publicPath, asset);
        }
    }

    return [...byPublicPath.values()]
        .sort((left, right) => left.publicPath.localeCompare(right.publicPath));
}

export function deriveReservedPublicAssetPaths(routeManifest) {
    const reserved = new Set();
    if (!Array.isArray(routeManifest)) {
        return reserved;
    }
    for (const entry of routeManifest) {
        const publicPath = routePathToPublicPath(entry?.path);
        if (publicPath) {
            reserved.add(publicPath);
        }
        if (typeof entry?.output === 'string') {
            const outputPath = normalizePublicPath(entry.output);
            if (outputPath) {
                reserved.add(outputPath);
            }
        }
    }
    return reserved;
}

export async function copyPublicAssets({ projectRoot, outDir, reservedPaths = null }) {
    const resolvedOutDir = resolve(outDir);
    const assets = await discoverPublicAssets(projectRoot);
    const reserved = reservedPaths instanceof Set
        ? reservedPaths
        : new Set(Array.isArray(reservedPaths) ? reservedPaths : []);
    let copied = 0;
    let skipped = 0;

    for (const asset of assets) {
        if (reserved.has(asset.publicPath)) {
            skipped += 1;
            continue;
        }
        const destinationPath = resolve(resolvedOutDir, asset.publicPath);
        if (!isWithin(resolvedOutDir, destinationPath)) {
            skipped += 1;
            continue;
        }

        if (await maybeLstat(destinationPath)) {
            skipped += 1;
            continue;
        }

        await mkdir(dirname(destinationPath), { recursive: true });
        await copyFile(asset.sourcePath, destinationPath);
        copied += 1;
    }

    return {
        copied,
        skipped,
        assets: assets.map((asset) => asset.publicPath)
    };
}
