// ---------------------------------------------------------------------------
// path.spec.js — Path utility tests
// ---------------------------------------------------------------------------

import {
    normalizeSeparators,
    fileToRoute,
    extractParams,
    isDynamic,
    validateRouteParams,
    canonicalize
} from '../src/path.js';

describe('normalizeSeparators', () => {
    test('replaces backslashes with forward slashes', () => {
        expect(normalizeSeparators('pages\\users\\[id].zen')).toBe('pages/users/[id].zen');
    });

    test('preserves forward slashes', () => {
        expect(normalizeSeparators('pages/users/index.zen')).toBe('pages/users/index.zen');
    });

    test('handles empty string', () => {
        expect(normalizeSeparators('')).toBe('');
    });
});

describe('fileToRoute', () => {
    test('index.zen maps to /', () => {
        expect(fileToRoute('index.zen')).toBe('/');
    });

    test('about.zen maps to /about', () => {
        expect(fileToRoute('about.zen')).toBe('/about');
    });

    test('nested static pages', () => {
        expect(fileToRoute('docs/getting-started.zen')).toBe('/docs/getting-started');
    });

    test('nested index maps to parent', () => {
        expect(fileToRoute('blog/index.zen')).toBe('/blog');
    });

    test('dynamic segment [param] → :param', () => {
        expect(fileToRoute('users/[id].zen')).toBe('/users/:id');
    });

    test('multiple dynamic segments', () => {
        expect(fileToRoute('users/[userId]/posts/[postId].zen')).toBe('/users/:userId/posts/:postId');
    });

    test('windows-style separators normalized', () => {
        expect(fileToRoute('pages\\users\\[id].zen')).toBe('/pages/users/:id');
    });

    test('custom extension', () => {
        expect(fileToRoute('about.html', '.html')).toBe('/about');
    });
});

describe('extractParams', () => {
    test('extracts single param', () => {
        expect(extractParams('/users/:id')).toEqual(['id']);
    });

    test('extracts multiple params', () => {
        expect(extractParams('/users/:userId/posts/:postId')).toEqual(['userId', 'postId']);
    });

    test('returns empty for static route', () => {
        expect(extractParams('/about')).toEqual([]);
    });
});

describe('isDynamic', () => {
    test('dynamic routes contain :', () => {
        expect(isDynamic('/users/:id')).toBe(true);
    });

    test('static routes do not contain :', () => {
        expect(isDynamic('/about')).toBe(false);
    });
});

describe('validateRouteParams', () => {
    test('valid params pass', () => {
        expect(() => validateRouteParams('/users/:id/posts/:postId')).not.toThrow();
    });

    test('repeated params throw', () => {
        expect(() => validateRouteParams('/users/:id/friends/:id')).toThrow('Repeated parameter name');
    });

    test('static route passes', () => {
        expect(() => validateRouteParams('/about')).not.toThrow();
    });
});

describe('canonicalize', () => {
    test('strips trailing slash', () => {
        expect(canonicalize('/about/')).toBe('/about');
    });

    test('preserves root', () => {
        expect(canonicalize('/')).toBe('/');
    });

    test('adds leading slash', () => {
        expect(canonicalize('about')).toBe('/about');
    });

    test('normalizes backslashes', () => {
        expect(canonicalize('users\\profile')).toBe('/users/profile');
    });
});
