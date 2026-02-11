// ---------------------------------------------------------------------------
// hash-drift-lock.spec.js — PHASE 5 Hash Drift Lock
// ---------------------------------------------------------------------------

import { hash } from '../src/hash.js';

test('hash stable snapshot', () => {
    const input = 'Zenith Core Determinism';
    expect(hash(input)).toBe('21aeffbdd632ba454eba61c54174a5f1dc3ee4c484ef30a4cbe094402ccd8c8d');
});
