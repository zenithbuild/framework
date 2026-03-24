import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CLI_VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
})();

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function extractAssetRefs(html) {
    const refs = new Set();

    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
        refs.add(String(match[1] || ''));
    }
    for (const match of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)) {
        refs.add(String(match[1] || ''));
    }

    return [...refs]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort();
}

async function readRouteHtml(staticDir, htmlPath) {
    try {
        return await readFile(join(staticDir, htmlPath.replace(/^\//, '')), 'utf8');
    } catch {
        return '';
    }
}

export async function writeBuildOutputManifest({ coreOutputDir, staticDir, target, routeManifest, basePath = '/' }) {
    const bundlerManifest = await readJson(join(staticDir, 'manifest.json'), {});
    const routerManifest = await readJson(join(staticDir, 'assets', 'router-manifest.json'), { routes: [] });
    const routeByPath = new Map(
        (Array.isArray(routerManifest.routes) ? routerManifest.routes : []).map((entry) => [entry.path, entry])
    );

    const routes = [];
    const routeAssetJs = new Set();
    const routeAssetCss = new Set();

    for (const entry of routeManifest) {
        const routeMeta = routeByPath.get(entry.path);
        const htmlPath = typeof routeMeta?.output === 'string' ? routeMeta.output : '/index.html';
        const html = await readRouteHtml(staticDir, htmlPath);
        const assets = extractAssetRefs(html);
        for (const asset of assets) {
            if (asset.endsWith('.css')) {
                routeAssetCss.add(asset);
                continue;
            }
            if (asset.endsWith('.js')) {
                routeAssetJs.add(asset);
            }
        }
        routes.push({
            path: entry.path,
            file: entry.file,
            path_kind: entry.path_kind,
            render_mode: entry.render_mode,
            requires_hydration: /<script\b[^>]*type="module"/i.test(html),
            params: [...entry.params],
            html: htmlPath,
            assets
        });
    }

    const jsAssets = new Set(
        [
            bundlerManifest.entry,
            bundlerManifest.core,
            bundlerManifest.router,
            ...Object.values(bundlerManifest.chunks || {}),
            ...routeAssetJs
        ].filter((value) => typeof value === 'string' && value.endsWith('.js'))
    );
    const cssAssets = new Set(
        [
            bundlerManifest.css,
            ...routeAssetCss
        ].filter((value) => typeof value === 'string' && value.endsWith('.css'))
    );

    const buildManifest = {
        schema_version: 1,
        zenith_version: CLI_VERSION,
        target,
        base_path: basePath,
        content_hash: typeof bundlerManifest.hash === 'string' ? bundlerManifest.hash : '',
        routes,
        assets: {
            js: [...jsAssets].sort(),
            css: [...cssAssets].sort(),
            vendor: typeof bundlerManifest.vendor === 'string' ? bundlerManifest.vendor : null
        }
    };

    await writeFile(
        join(coreOutputDir, 'manifest.json'),
        `${JSON.stringify(buildManifest, null, 2)}\n`,
        'utf8'
    );
    return buildManifest;
}
