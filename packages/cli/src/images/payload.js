import {
    imageRuntimeGlobalName,
    normalizeImageConfig,
    normalizeImageRuntimePayload
} from './shared.js';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createImageRuntimePayload(config, localImages, mode = 'passthrough') {
    return normalizeImageRuntimePayload({
        mode,
        config: normalizeImageConfig(config),
        localImages: localImages && typeof localImages === 'object' ? localImages : {}
    });
}

function serializeInlineScriptJson(payload) {
    return JSON.stringify(payload)
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/\//g, '\\u002F')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

export function injectImageRuntimePayload(html, payload) {
    const safePayload = createImageRuntimePayload(payload?.config || {}, payload?.localImages || {}, payload?.mode || 'passthrough');
    const globalName = imageRuntimeGlobalName();
    const serialized = serializeInlineScriptJson(safePayload);
    const scriptTag = `<script id="zenith-image-runtime">window.${globalName} = ${serialized};</script>`;
    const existingTagRe = /<script\b[^>]*\bid=(["'])zenith-image-runtime\1[^>]*>[\s\S]*?<\/script>/i;

    if (existingTagRe.test(html)) {
        return html.replace(existingTagRe, scriptTag);
    }
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${scriptTag}</head>`);
    }
    const bodyOpen = html.match(/<body\b[^>]*>/i);
    if (bodyOpen) {
        return html.replace(bodyOpen[0], `${bodyOpen[0]}${scriptTag}`);
    }
    return `${scriptTag}${html}`;
}

export async function injectImageRuntimePayloadIntoHtmlFiles(rootDir, payload) {
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
            const next = injectImageRuntimePayload(html, payload);
            if (next !== html) {
                await writeFile(fullPath, next, 'utf8');
            }
        }
    }

    await walk(rootDir);
}
