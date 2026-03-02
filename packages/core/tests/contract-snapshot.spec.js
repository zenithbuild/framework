// ---------------------------------------------------------------------------
// contract-snapshot.spec.js — PHASE 10 Contract Snapshot Lock
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractPath = path.resolve(__dirname, '../CORE_CONTRACT.md');

test('CORE_CONTRACT.md hash snapshot is stable', () => {
    const contents = fs.readFileSync(contractPath, 'utf8');
    const digest = createHash('sha256').update(contents).digest('hex');
    expect(digest).toBe('9c9fc2fa0e35264755b7e14a78a6648ae8d11b8d9f39ce3cad925ea0bc704de7');
});
