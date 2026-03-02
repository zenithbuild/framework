// ---------------------------------------------------------------------------
// version.spec.js — Version utility tests
// ---------------------------------------------------------------------------

import { parseSemver, formatVersion, validateCompatibility } from '../src/version.js';

describe('parseSemver', () => {
    test('parses standard semver', () => {
        expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    test('parses with v prefix', () => {
        expect(parseSemver('v2.0.1')).toEqual({ major: 2, minor: 0, patch: 1 });
    });

    test('parses 0.x versions', () => {
        expect(parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
    });

    test('throws on invalid semver', () => {
        expect(() => parseSemver('not-a-version')).toThrow('Invalid semver');
    });

    test('throws on incomplete semver', () => {
        expect(() => parseSemver('1.2')).toThrow('Invalid semver');
    });
});

describe('formatVersion', () => {
    test('formats version object to string', () => {
        expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
    });

    test('formats zero version', () => {
        expect(formatVersion({ major: 0, minor: 0, patch: 0 })).toBe('0.0.0');
    });
});

describe('validateCompatibility', () => {
    test('same versions are compatible', () => {
        expect(validateCompatibility('1.0.0', '1.0.0')).toBeNull();
    });

    test('same major, close minor is compatible', () => {
        expect(validateCompatibility('1.0.0', '1.1.0')).toBeNull();
    });

    test('minor drift > 1 returns warning', () => {
        const warning = validateCompatibility('1.0.0', '1.3.0');
        expect(warning).toContain('Minor version drift');
    });

    test('different major versions throw', () => {
        expect(() => validateCompatibility('1.0.0', '2.0.0')).toThrow('Incompatible major versions');
    });

    test('patch differences are always compatible', () => {
        expect(validateCompatibility('1.0.0', '1.0.99')).toBeNull();
    });

    test('works with v prefix', () => {
        expect(validateCompatibility('v1.0.0', 'v1.0.0')).toBeNull();
    });
});
