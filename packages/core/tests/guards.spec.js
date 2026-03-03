// ---------------------------------------------------------------------------
// guards.spec.js — Guard utility tests
// ---------------------------------------------------------------------------

import {
    containsForbiddenPattern,
    validateRouteParams,
    validateConfigSchema,
    FORBIDDEN_PATTERNS,
    BROWSER_GLOBALS
} from '../dist/guards.js';

describe('containsForbiddenPattern', () => {
    test('detects eval', () => {
        const found = containsForbiddenPattern('let x = eval("code")', ['eval(']);
        expect(found).toEqual(['eval(']);
    });

    test('detects new Function', () => {
        const found = containsForbiddenPattern('new Function("return 1")', ['new Function(']);
        expect(found).toEqual(['new Function(']);
    });

    test('detects multiple patterns', () => {
        const source = 'eval("x"); new Function("y")';
        const found = containsForbiddenPattern(source, ['eval(', 'new Function(']);
        expect(found).toEqual(['eval(', 'new Function(']);
    });

    test('clean source returns empty array', () => {
        const found = containsForbiddenPattern('const x = 1 + 2;', FORBIDDEN_PATTERNS);
        expect(found).toEqual([]);
    });

    test('empty source returns empty array', () => {
        expect(containsForbiddenPattern('', FORBIDDEN_PATTERNS)).toEqual([]);
    });
});

describe('validateRouteParams (re-exported)', () => {
    test('valid route passes', () => {
        expect(() => validateRouteParams('/users/:id')).not.toThrow();
    });

    test('repeated params throw', () => {
        expect(() => validateRouteParams('/users/:id/friends/:id')).toThrow();
    });
});

describe('validateConfigSchema (re-exported)', () => {
    test('valid config passes', () => {
        const result = validateConfigSchema({ router: true });
        expect(result.router).toBe(true);
    });

    test('unknown key throws', () => {
        expect(() => validateConfigSchema({ unknown: true })).toThrow();
    });
});

describe('FORBIDDEN_PATTERNS', () => {
    test('includes standard forbidden patterns', () => {
        expect(FORBIDDEN_PATTERNS).toContain('eval(');
        expect(FORBIDDEN_PATTERNS).toContain('new Function(');
    });
});

describe('BROWSER_GLOBALS', () => {
    test('includes standard browser globals', () => {
        expect(BROWSER_GLOBALS).toContain('window');
        expect(BROWSER_GLOBALS).toContain('document');
        expect(BROWSER_GLOBALS).toContain('navigator');
    });
});
