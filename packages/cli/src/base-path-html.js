import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prependBasePath } from './base-path.js';

const SOFT_LINK_RE = /<a\b([^>]*\bdata-zen-link(?:=(["']).*?\2)?[^>]*)\bhref=(["'])(\/(?!\/)[^"']*)\3/gi;

export function rewriteSoftNavigationHrefBasePath(html, basePath) {
    return String(html || '').replace(SOFT_LINK_RE, (match, beforeHref, _attrQuote, hrefQuote, hrefValue) => {
        const nextHref = prependBasePath(basePath, hrefValue);
        if (nextHref === hrefValue) {
            return match;
        }
        return `<a${beforeHref}href=${hrefQuote}${nextHref}${hrefQuote}`;
    });
}

export async function rewriteSoftNavigationHrefBasePathInHtmlFiles(rootDir, basePath) {
    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir);
        } catch {
            return;
        }
        entries.sort((left, right) => left.localeCompare(right));
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const info = await stat(fullPath);
            if (info.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (!entry.endsWith('.html')) {
                continue;
            }
            const html = await readFile(fullPath, 'utf8');
            const next = rewriteSoftNavigationHrefBasePath(html, basePath);
            if (next !== html) {
                await writeFile(fullPath, next, 'utf8');
            }
        }
    }

    await walk(rootDir);
}
