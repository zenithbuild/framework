import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const FIXED_VERSION = [0, 35, 5];
const IMAGE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function versionAtLeast(actual, minimum) {
    const parsed = String(actual).split('.').map((part) => Number.parseInt(part, 10));
    for (let index = 0; index < minimum.length; index += 1) {
        if ((parsed[index] || 0) > minimum[index]) return true;
        if ((parsed[index] || 0) < minimum[index]) return false;
    }
    return true;
}

describe('Sharp security floor', () => {
    test('manifest and frozen install require the patched Sharp line', async () => {
        const manifest = JSON.parse(
            await readFile(join(IMAGE_ROOT, 'package.json'), 'utf8')
        );

        expect(manifest.dependencies.sharp).toBe('^0.35.5');
        expect(versionAtLeast(sharp.versions.sharp, FIXED_VERSION)).toBe(true);
    });
});
