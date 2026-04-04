import { describe, expect, test } from 'bun:test';
import { runtimeModuleProfileSnapshot, runtimeModuleSource } from '../dist/template.js';

describe('runtime template profile assembly', () => {
    test('default runtime profile preserves full runtime module source', () => {
        const fullProfile = runtimeModuleProfileSnapshot('default');

        expect(fullProfile.profile).toBe('default');
        expect(fullProfile.source).toBe(runtimeModuleSource());
        expect(fullProfile.source).toContain('function zenPresence(');
        expect(fullProfile.source).toContain('__zenith_runtime_error_overlay');
    });

    test('production emitted profile omits presence and overlay payload', () => {
        const productionProfile = runtimeModuleProfileSnapshot('production-emitted');

        expect(productionProfile.profile).toBe('production-emitted');
        expect(productionProfile.source).not.toContain('function zenPresence(');
        expect(productionProfile.source).not.toContain('__zenith_runtime_error_overlay');
        expect(productionProfile.contributors.some((entry) => entry.id === 'presence.js')).toBe(false);
        expect(
            productionProfile.contributors.some(
                (entry) => entry.id === 'diagnostics.js' && entry.sourceFile === 'diagnostics-production.js'
            )
        ).toBe(true);
    });

    test('production profile contributor ranking is deterministic', () => {
        const left = runtimeModuleProfileSnapshot('production-emitted').contributors;
        const right = runtimeModuleProfileSnapshot('production-emitted').contributors;
        expect(left).toEqual(right);
        for (let i = 1; i < left.length; i += 1) {
            expect(left[i - 1].bytes >= left[i].bytes).toBe(true);
        }
    });
});
