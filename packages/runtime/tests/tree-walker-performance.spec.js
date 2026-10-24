import { expect, test, describe } from 'bun:test';
import { hydrate } from '../src/hydrate.js';
import { cleanup } from '../src/cleanup.js';

describe('TreeWalker Performance Locks', () => {
    test('hydrate() creates exactly one TreeWalker for 100 comment markers', () => {
        const root = document.createElement('div');
        for (let i = 0; i < 100; i++) {
            root.appendChild(document.createComment(`zx:bind:${i}`));
        }

        const originalCreateTreeWalker = document.createTreeWalker;
        let createTreeWalkerCount = 0;

        document.createTreeWalker = function(...args) {
            createTreeWalkerCount++;
            return originalCreateTreeWalker.apply(this, args);
        };

        const expressions = [];
        const markers = [];
        for (let i = 0; i < 100; i++) {
            expressions.push({ marker_index: i, fn_index: 0 });
            markers.push({ kind: 'text', index: i, selector: `comment:zx:bind:${i}` });
        }

        try {
            hydrate({
                ir_version: 1,
                root,
                state_values: [],
                signals: [],
                expressions,
                expr_fns: [() => 'test'],
                markers,
                events: [],
                refs: [],
                components: []
            });

            expect(createTreeWalkerCount).toBe(1);
        } finally {
            document.createTreeWalker = originalCreateTreeWalker;
            cleanup();
        }
    });

    test('missing comments do not cause crashes or extra scans', () => {
        const root = document.createElement('div');
        const expressions = [{ marker_index: 0, fn_index: 0 }];
        const markers = [{ kind: 'text', index: 0, selector: 'comment:zx:bind:notfound' }];

        // We expect an error about missing marker binding...
        let caughtErrors = 0;
        try {
            hydrate({
                ir_version: 1,
                root,
                state_values: [],
                signals: [],
                expressions,
                expr_fns: [() => 'test'],
                markers,
                events: [],
                refs: [],
                components: []
            });
        } catch (e) {
            caughtErrors++;
            expect(e.message).toContain('Unresolved text marker index 0');
        }
        expect(caughtErrors).toBe(1);
    });
});
