import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { presence, zenPresence } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('presence docs truth', () => {
    test('runtime exports keep zenPresence canonical and presence as an alias', () => {
        expect(typeof zenPresence).toBe('function');
        expect(typeof presence).toBe('function');
        expect(zenPresence).toBe(presence);
    });

    test('presence guide presents zenPresence first and presence second', () => {
        const guide = readRepoFile('docs/documentation/reactivity/presence.md');
        const zenIndex = guide.search(/\bzenPresence\s*\(/);
        const aliasIndex = guide.search(/\bpresence\s*\(/);

        expect(zenIndex).toBeGreaterThanOrEqual(0);
        expect(aliasIndex).toBeGreaterThan(zenIndex);
        expect(guide).toContain('hidden');
        expect(guide).toContain('entering');
        expect(guide).toContain('present');
        expect(guide).toContain('exiting');
        expect(guide).toContain('no fragment retention');
        expect(guide).toContain('no router coupling');
    });

    test('presence-facing docs do not deprecate zenPresence', () => {
        const combined = [
            readRepoFile('docs/documentation/reactivity/presence.md'),
            readRepoFile('docs/documentation/reactivity/effects-vs-mount.md'),
            readRepoFile('docs/documentation/reference/primitives-patterns.md'),
            readRepoFile('docs/documentation/contracts/runtime-contract.md'),
            readRepoFile('packages/runtime/RUNTIME_CONTRACT.md')
        ].join('\n');

        expect(/zenPresence[\s\S]{0,80}deprecated/i.test(combined)).toBe(false);
        expect(/deprecated[\s\S]{0,80}zenPresence/i.test(combined)).toBe(false);
    });
});
