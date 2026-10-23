import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildComponentExpressionRewrite } from '../dist/build/expression-rewrites.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('compiler ownership boundary', () => {
    test('component expression rewrite consumes compiler-owned literal payloads directly', () => {
        const rewrite = buildComponentExpressionRewrite({
            expressions: ['__scoped_total'],
            expression_bindings: [{
                literal: 'total',
                compiled_expr: null,
                signal_index: 0,
                signal_indices: [0],
                state_index: 0,
                component_instance: null,
                component_binding: null
            }],
            signals: [{ state_index: 0 }],
            hoisted: {
                state: [{ key: '__scoped_total', value: 'signal(0)' }],
                functions: [],
                declarations: [],
                signals: [],
                code: []
            }
        });

        expect(rewrite.map.get('total')).toBe('__scoped_total');
        expect(rewrite.bindings.get('total')).toMatchObject({
            signal_index: 0,
            signal_indices: [0],
            state_index: 0
        });
        expect(rewrite.sequence).toEqual([{
            raw: 'total',
            rewritten: '__scoped_total',
            binding: {
                compiled_expr: null,
                signal_index: 0,
                signal_indices: [0],
                state_index: 0,
                component_instance: null,
                component_binding: null
            }
        }]);
    });

    test('cli rewrite boundary no longer recompiles template source to recover expression meaning', () => {
        const rewriteSource = readFileSync(
            resolve(REPO_ROOT, 'packages/cli/src/build/expression-rewrites.js'),
            'utf8'
        );
        const pageLoopStateSource = readFileSync(
            resolve(REPO_ROOT, 'packages/cli/src/build/page-loop-state.js'),
            'utf8'
        );

        expect(rewriteSource).not.toContain("from '../resolve-components.js'");
        expect(rewriteSource).not.toContain("from './compiler-runtime.js'");
        expect(rewriteSource).not.toContain('extractTemplate(');
        expect(rewriteSource).not.toContain('runCompiler(');
        expect(pageLoopStateSource).not.toContain('templateExpressionCache');
    });
});
