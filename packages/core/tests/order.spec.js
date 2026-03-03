// ---------------------------------------------------------------------------
// order.spec.js — Order utility tests
// ---------------------------------------------------------------------------

import { sortRoutes, sortAlpha, isCorrectOrder } from '../dist/order.js';

describe('sortRoutes', () => {
    test('static routes sort before dynamic routes', () => {
        const entries = [
            { path: '/users/:id' },
            { path: '/about' },
            { path: '/posts/:slug' },
            { path: '/' }
        ];
        const sorted = sortRoutes(entries);
        expect(sorted.map(e => e.path)).toEqual([
            '/',
            '/about',
            '/posts/:slug',
            '/users/:id'
        ]);
    });

    test('alphabetical tiebreak within static group', () => {
        const entries = [
            { path: '/docs' },
            { path: '/about' },
            { path: '/contact' }
        ];
        const sorted = sortRoutes(entries);
        expect(sorted.map(e => e.path)).toEqual(['/about', '/contact', '/docs']);
    });

    test('alphabetical tiebreak within dynamic group', () => {
        const entries = [
            { path: '/users/:id' },
            { path: '/posts/:slug' },
            { path: '/blog/:id' }
        ];
        const sorted = sortRoutes(entries);
        expect(sorted.map(e => e.path)).toEqual(['/blog/:id', '/posts/:slug', '/users/:id']);
    });

    test('does not mutate original array', () => {
        const entries = [{ path: '/b' }, { path: '/a' }];
        const sorted = sortRoutes(entries);
        expect(entries[0].path).toBe('/b');
        expect(sorted[0].path).toBe('/a');
    });

    test('deterministic across repeated calls', () => {
        const entries = [
            { path: '/users/:id' },
            { path: '/about' },
            { path: '/' },
            { path: '/posts/:slug' },
            { path: '/docs' }
        ];
        const r1 = sortRoutes(entries);
        const r2 = sortRoutes(entries);
        expect(r1.map(e => e.path)).toEqual(r2.map(e => e.path));
    });

    test('empty array returns empty', () => {
        expect(sortRoutes([])).toEqual([]);
    });

    test('single entry returns as-is', () => {
        expect(sortRoutes([{ path: '/' }])).toEqual([{ path: '/' }]);
    });
});

describe('sortAlpha', () => {
    test('sorts strings alphabetically', () => {
        expect(sortAlpha(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
    });

    test('does not mutate original', () => {
        const arr = ['c', 'a'];
        sortAlpha(arr);
        expect(arr[0]).toBe('c');
    });
});

describe('isCorrectOrder', () => {
    test('correctly ordered returns true', () => {
        expect(isCorrectOrder([
            { path: '/' },
            { path: '/about' },
            { path: '/users/:id' }
        ])).toBe(true);
    });

    test('incorrectly ordered returns false', () => {
        expect(isCorrectOrder([
            { path: '/users/:id' },
            { path: '/about' }
        ])).toBe(false);
    });
});
