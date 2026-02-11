// ---------------------------------------------------------------------------
// api-lock.spec.js — PHASE 1 Surface Lock (Public API Freeze)
// ---------------------------------------------------------------------------

import * as core from '../src/index.js';

test('public API surface is frozen', () => {
    expect(Object.keys(core).sort()).toEqual([
        'config',
        'errors',
        'guards',
        'hash',
        'order',
        'path',
        'version'
    ]);
});
