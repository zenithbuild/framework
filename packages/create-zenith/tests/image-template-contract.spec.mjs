import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const version = readFileSync(join(root, 'TRAIN_VERSION'), 'utf8').trim();
const templates = join(root, 'packages/create-zenith/templates');

function usesImages(dir) {
    return readdirSync(dir, { withFileTypes: true }).some((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? usesImages(path)
            : /\.(png|jpe?g|webp|avif)$/i.test(entry.name)
                || (entry.name.endsWith('.zen') && /<Image(?=[\s/>])/.test(readFileSync(path, 'utf8')));
    });
}

test('image-bearing templates declare the exact train image package; no-image templates stay lean', () => {
    for (const name of ['basic', 'css', 'tailwind']) {
        const dir = join(templates, name);
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        const dependency = pkg.dependencies?.['@zenithbuild/image'] || pkg.devDependencies?.['@zenithbuild/image'];
        assert.equal(dependency, usesImages(dir) ? version : undefined, name);
    }
});
