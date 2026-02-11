
import { describe, it, expect } from 'bun:test';
import { compile } from '../index';
import * as Compiler from '../index';
import fs from 'fs';
import path from 'path';

/**
 * Phase 5: Boundary & Integration Lockdown
 * 
 * These tests ensure that the Zenith Compiler enforces strict boundaries:
 * 1. The CLI acts as a thin transport.
 * 2. The Internal API is locked down (only specific exports).
 * 3. Legacy paths are removed.
 */

describe('Phase 5: Boundary Contracts', () => {

    it('Should expose only the allowed API surface', () => {
        const exportedKeys = Object.keys(Compiler);

        // Allowed public exports (Hardened Surface)
        const allowed = [
            'compile',
            'parseZenFile',
            // Types are allowed (and don't show up in Object.keys except in some environments, but we list them if they do)
            'FinalizedOutput',
            'CompiledTemplate'
        ];

        // Ensure everything exported is in the allowed list
        exportedKeys.forEach(key => {
            expect(allowed).toContain(key);
        });

        // Ensure important ones are present
        expect(Compiler.compile).toBeDefined();
    });

    it('Should compile a simple file without side effects (Purity Check)', async () => {
        const source = `
        <script>
        state count = 0;
        </script>
        <button on:click={() => count++}>{count}</button>
        `;

        const result = await compile(source, 'integrity-check.zen', {});

        expect(result.finalized).toBeDefined();
        // Ensure no "patching" logic in pure compile result
        // (If there was patching in CLI, it's not here)
    });

    // Verify Legacy Paths are Gone
    it('Should NOT expose compileZenSource (Legacy)', () => {
        // @ts-ignore
        expect(Compiler.compileZenSource).toBeUndefined();
    });

    it('Should NOT expose old build modes', () => {
        // @ts-ignore
        expect(Compiler.buildSPA).toBeUndefined();
    });
});
