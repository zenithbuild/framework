import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, test } from '@jest/globals';
import { join } from 'node:path';
import { resolveCompilerBin } from '../dist/toolchain-paths.js';

const WORKSPACE_ROOT = join(process.cwd(), '..');

describe('compiler shipped surface (image materialization)', () => {
    const original = process.env.ZENITH_COMPILER_BIN;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.ZENITH_COMPILER_BIN;
        } else {
            process.env.ZENITH_COMPILER_BIN = original;
        }
    });

    test('resolved compiler (no ZENITH_COMPILER_BIN) documents merge-image-materialization', () => {
        const env = { ...process.env };
        delete env.ZENITH_COMPILER_BIN;
        const bin = resolveCompilerBin(WORKSPACE_ROOT, env);
        expect(existsSync(bin)).toBe(true);
        const r = spawnSync(bin, ['--help'], { encoding: 'utf8' });
        expect(r.status).toBe(0);
        expect(`${r.stdout}\n${r.stderr || ''}`).toContain('merge-image-materialization');
    });

    test('merge-image-materialization accepts empty marker table without jest-setup binary override', () => {
        const env = { ...process.env };
        delete env.ZENITH_COMPILER_BIN;
        const bin = resolveCompilerBin(WORKSPACE_ROOT, env);
        const r = spawnSync(bin, ['--merge-image-materialization'], {
            encoding: 'utf8',
            input: '{"marker_bindings":[],"literals":[]}'
        });
        expect(r.status).toBe(0);
        const out = (r.stdout || '').trim();
        expect(out).toContain('"image_materialization"');
    });
});
