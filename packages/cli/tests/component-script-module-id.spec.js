import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

describe('component script module_id ownership', () => {
    test('compiler → CLI → bundler fixture passes under bun', () => {
        const result = spawnSync('bun', ['tests/component-script-module-id.mjs'], {
            encoding: 'utf8',
            cwd: fileURLToPath(new URL('..', import.meta.url))
        });
        if (result.status !== 0) {
            throw new Error(
                `fixture failed (status ${result.status})\n${result.stdout || ''}\n${result.stderr || ''}`
            );
        }
        expect(result.stdout).toContain('component-script module_id ownership fixture passed');
    });
});
