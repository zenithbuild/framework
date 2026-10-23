import { createImageRuntimePayload, injectImageRuntimePayload } from '@zenithbuild/core/config/images';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export { createImageRuntimePayload, injectImageRuntimePayload };

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
