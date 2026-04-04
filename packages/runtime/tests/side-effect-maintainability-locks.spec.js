import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');
const SIDE_EFFECT_FILES = [
    'zeneffect.ts',
    'reactivity-core.ts',
    'side-effect-scope.ts',
    'effect-utils.ts',
    'effect-scheduler.ts',
    'effect-runtime.ts',
    'mount-runtime.ts'
];

function readSource(fileName) {
    return fs.readFileSync(path.join(SRC_DIR, fileName), 'utf8');
}

describe('Track E side-effect maintainability locks', () => {
    test('zeneffect.ts is a thin facade over extracted modules', () => {
        const source = readSource('zeneffect.ts');
        const lineCount = source.split(/\r?\n/).length;

        expect(source).toContain("from './effect-runtime.js'");
        expect(source).toContain("from './effect-utils.js'");
        expect(source).toContain("from './mount-runtime.js'");
        expect(source).toContain("from './side-effect-scope.js'");
        expect(source).not.toContain('function createScheduler(');
        expect(source).not.toContain('function normalizeEffectOptions(');
        expect(source).not.toContain('function createEffectContext(');
        expect(source).not.toContain('function createMountContext(');
        expect(source).not.toContain('function createAutoTrackedEffect(');
        expect(source).not.toContain('function createExplicitDependencyEffect(');
        expect(source).not.toContain('function createInternalScope(');
        expect(lineCount).toBeLessThanOrEqual(150);
    });

    test('authoritative side-effect internals are consumed directly by sibling modules', () => {
        expect(readSource('signal.ts')).toContain("from './reactivity-core.js'");
        expect(readSource('state.ts')).toContain("from './reactivity-core.js'");
        expect(readSource('cleanup.js')).toContain("from './side-effect-scope.js'");
        expect(readSource('hydrate.js')).toContain("from './side-effect-scope.js'");
    });

    test('runtime template bundle includes extracted side-effect modules', () => {
        const templateSource = `${readSource('template.js')}\n${readSource('runtime-template-profile.js')}`;

        for (let i = 0; i < SIDE_EFFECT_FILES.length; i++) {
            expect(templateSource).toContain(`'${SIDE_EFFECT_FILES[i].replace(/\.ts$/, '.js')}'`);
        }
    });

    test('zeneffect.ts no longer dominates the side-effect runtime cluster', () => {
        const counts = SIDE_EFFECT_FILES.map((fileName) => ({
            fileName,
            lineCount: readSource(fileName).split(/\r?\n/).length
        }));
        const zeneffectCount = counts.find((entry) => entry.fileName === 'zeneffect.ts').lineCount;
        const largestCount = counts.reduce((max, entry) => Math.max(max, entry.lineCount), 0);

        expect(zeneffectCount).toBeLessThan(largestCount);
    });

    test('side-effect files stay within the 500 line ceiling', () => {
        for (let i = 0; i < SIDE_EFFECT_FILES.length; i++) {
            const lineCount = readSource(SIDE_EFFECT_FILES[i]).split(/\r?\n/).length;
            expect(lineCount).toBeLessThanOrEqual(500);
        }
    });
});
