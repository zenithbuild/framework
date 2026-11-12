import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@jest/globals';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE = 'public, max-age=0, must-revalidate';

function escapeRoute(path) {
    return path.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

export async function readOutputManifest(projectRoot) {
    return JSON.parse(await readFile(join(projectRoot, '.zenith-output', 'manifest.json'), 'utf8'));
}

export function expandPaths(paths, basePath = '/') {
    const expanded = new Set(paths);
    if (basePath !== '/') {
        for (const path of paths) {
            if (path.startsWith(`${basePath}/assets/`)) {
                expanded.add(path.slice(basePath.length));
            }
        }
    }
    return [...expanded];
}

export function assertVercelImmutableRoutes(routes, immutablePaths, basePath = '/') {
    const filesystemIndex = routes.findIndex((route) => route.handle === 'filesystem');
    expect(filesystemIndex).toBeGreaterThan(0);
    const headerRoutes = routes.filter((route) => route.headers);
    expect(headerRoutes.length).toBeGreaterThan(0);
    const sources = new Set();
    for (const route of headerRoutes) {
        expect(routes.indexOf(route)).toBeLessThan(filesystemIndex);
        expect(route.continue).toBe(true);
        expect(route.dest).toBeUndefined();
        expect(route.headers['Cache-Control']).toBe(IMMUTABLE_CACHE);
        expect(route.src.includes('router-manifest')).toBe(false);
        expect(route.src.includes('route-check')).toBe(false);
        expect(route.src.includes('_zenith/image')).toBe(false);
        sources.add(route.src);
    }
    for (const route of routes) {
        if (route.dest || route.handle) {
            expect(route.headers).toBeUndefined();
        }
    }
    for (const path of expandPaths(immutablePaths, basePath)) {
        expect(sources.has(`^${escapeRoute(path)}$`)).toBe(true);
    }
    expect(immutablePaths.length).toBeGreaterThan(0);
    expect(immutablePaths.some((path) => path.endsWith('.html') || path.endsWith('router-manifest.json'))).toBe(false);
}

export function assertNetlifyImmutableHeaders(source, immutablePaths, { basePath = '/', userLines = [] } = {}) {
    expect(immutablePaths.length).toBeGreaterThan(0);
    for (const line of userLines) {
        expect(source).toContain(line);
    }
    const catchAllAt = source.lastIndexOf('\n/*\n');
    expect(catchAllAt).toBeGreaterThan(-1);
    expect(source.slice(catchAllAt)).toContain(`Cache-Control: ${REVALIDATE_CACHE}`);
    for (const path of expandPaths(immutablePaths, basePath)) {
        const ruleAt = source.indexOf(`${path}\n  Cache-Control: ${IMMUTABLE_CACHE}`);
        expect(ruleAt).toBeGreaterThan(-1);
        expect(ruleAt).toBeLessThan(catchAllAt);
        if (userLines.length > 0) {
            expect(ruleAt).toBeLessThan(source.indexOf(userLines[0]));
        }
    }
    expect(source).not.toContain(`router-manifest.json\n  Cache-Control: ${IMMUTABLE_CACHE}`);
}
