import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

function delay(ms) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function pickCssAsset(assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
        return '';
    }
    const cssAssets = assets
        .filter((entry) => typeof entry === 'string' && entry.endsWith('.css'))
        .map((entry) => entry.startsWith('/') ? entry : `/${entry}`);
    if (cssAssets.length === 0) {
        return '';
    }
    const devStable = cssAssets.find((entry) => entry.endsWith('/styles.dev.css'));
    if (devStable) {
        return devStable;
    }
    const preferred = cssAssets.find((entry) => /\/styles(\.|\/|$)/.test(entry));
    return preferred || cssAssets[0];
}

async function waitForCssFile(absolutePath, retries = 16, delayMs = 40) {
    for (let i = 0; i <= retries; i++) {
        try {
            const info = await stat(absolutePath);
            if (info.isFile()) {
                return true;
            }
        } catch {
            // keep retrying
        }
        if (i < retries) {
            await delay(delayMs);
        }
    }
    return false;
}

export async function syncCssStateFromBuild({
    buildResult,
    nextBuildId,
    outDir,
    state,
    trace
}) {
    state.currentCssHref = `/__zenith_dev/styles.css?buildId=${nextBuildId}`;
    const candidate = pickCssAsset(buildResult?.assets);
    if (!candidate) {
        trace('css_sync_skipped', { reason: 'no_css_asset', buildId: nextBuildId });
        return false;
    }

    const absoluteCssPath = join(outDir, candidate);
    const ready = await waitForCssFile(absoluteCssPath);
    if (!ready) {
        trace('css_sync_skipped', {
            reason: 'css_not_ready',
            buildId: nextBuildId,
            cssAsset: candidate,
            resolvedPath: absoluteCssPath
        });
        return false;
    }

    let cssContent = '';
    try {
        cssContent = await readFile(absoluteCssPath, 'utf8');
    } catch {
        trace('css_sync_skipped', {
            reason: 'css_read_failed',
            buildId: nextBuildId,
            cssAsset: candidate,
            resolvedPath: absoluteCssPath
        });
        return false;
    }
    if (typeof cssContent !== 'string') {
        trace('css_sync_skipped', {
            reason: 'css_invalid_type',
            buildId: nextBuildId,
            cssAsset: candidate,
            resolvedPath: absoluteCssPath
        });
        return false;
    }
    if (cssContent.length === 0) {
        trace('css_sync_skipped', {
            reason: 'css_empty',
            buildId: nextBuildId,
            cssAsset: candidate,
            resolvedPath: absoluteCssPath
        });
        cssContent = '/* zenith-dev: empty css */';
    }

    state.currentCssAssetPath = candidate;
    state.currentCssContent = cssContent;
    return true;
}
