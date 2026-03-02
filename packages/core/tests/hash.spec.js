// ---------------------------------------------------------------------------
// hash.spec.js — Hash utility tests
// ---------------------------------------------------------------------------

import { hash, hashShort } from '../src/hash.js';

describe('hash', () => {
    test('identical strings produce identical hashes', () => {
        expect(hash('foo')).toBe(hash('foo'));
    });

    test('different strings produce different hashes', () => {
        expect(hash('foo')).not.toBe(hash('bar'));
    });

    test('returns hex string', () => {
        const result = hash('test');
        expect(result).toMatch(/^[0-9a-f]+$/);
    });

    test('returns 64 character SHA-256 hex', () => {
        expect(hash('test').length).toBe(64);
    });

    test('normalizes path separators', () => {
        expect(hash('path\\to\\file')).toBe(hash('path/to/file'));
    });

    test('strips trailing newlines', () => {
        expect(hash('content\n')).toBe(hash('content'));
        expect(hash('content\n\n\n')).toBe(hash('content'));
    });

    test('empty string produces valid hash', () => {
        const result = hash('');
        expect(result.length).toBe(64);
    });

    test('deterministic across calls', () => {
        const results = new Set();
        for (let i = 0; i < 100; i++) {
            results.add(hash('deterministic'));
        }
        expect(results.size).toBe(1);
    });
});

describe('hashShort', () => {
    test('returns truncated hash', () => {
        const full = hash('content');
        const short = hashShort('content', 8);
        expect(short.length).toBe(8);
        expect(full.startsWith(short)).toBe(true);
    });

    test('default length is 8', () => {
        expect(hashShort('test').length).toBe(8);
    });

    test('custom length', () => {
        expect(hashShort('test', 12).length).toBe(12);
    });
});
