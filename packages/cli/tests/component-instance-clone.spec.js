import { cloneComponentIrForInstance } from '../dist/component-instance-ir.js';
import {
    buildComponentExpressionRewrite,
    remapCompiledExpressionSignals,
    resolveStateKeyFromBindings
} from '../dist/build/expression-rewrites.js';
import { resolvePropsValueCode } from '../dist/build/scoped-identifier-rewrite.js';
import { extractDeclaredIdentifiers } from '../dist/build/typescript-expression-utils.js';

describe('component instance cloning', () => {
    test('keeps lexical meaning intact while applying deterministic instance isolation', () => {
        const componentIr = {
            expressions: [
                'items.map((total) => ({ total, label: "total literal", nested: `${count} / total literal`, value: total + count }))',
                '{ count }'
            ],
            expression_bindings: [
                {
                    literal: 'items.map((total) => ({ total, label: "total literal", nested: `${count} / total literal`, value: total + count }))',
                    compiled_expr: 'items.map((total) => ({ total, label: "total literal", nested: `${count} / total literal`, value: total + count }))',
                    component_instance: 'count',
                    component_binding: 'handler(count)',
                    signal_index: null,
                    signal_indices: [],
                    state_index: null
                },
                {
                    literal: '{ count }',
                    compiled_expr: '{ count }',
                    component_instance: null,
                    component_binding: null,
                    signal_index: null,
                    signal_indices: [],
                    state_index: null
                }
            ],
            hoisted: {
                state: [{ key: 'count', value: 'signal(0)' }],
                functions: ['increment'],
                signals: ['count'],
                declarations: [
                    'const label = "count literal";',
                    'const handler = () => { const count = "shadow"; return count; };'
                ],
                code: ['const payload = { count };']
            },
            ref_bindings: []
        };

        const { ir } = cloneComponentIrForInstance(
            componentIr,
            2,
            extractDeclaredIdentifiers,
            resolveStateKeyFromBindings
        );

        expect(ir.expressions[0]).toContain('items.map((total) => ({ total,');
        expect(ir.expressions[0]).toContain('nested: `${count__inst2} / total literal`');
        expect(ir.expressions[0]).toContain('value: total + count__inst2');
        expect(ir.expressions[0]).not.toContain('total__inst2 + count__inst2');

        expect(ir.expressions[1]).toContain('{ count: count__inst2 }');
        expect(ir.expression_bindings[0].component_instance).toBe('count__inst2');
        expect(ir.expression_bindings[0].component_binding).toBe('handler__inst2(count__inst2)');
        expect(ir.hoisted.declarations[0]).toContain('"count literal"');
        expect(ir.hoisted.declarations[1]).toContain('const handler__inst2 = () =>');
        expect(ir.hoisted.declarations[1]).toContain('const count = "shadow";');
        expect(ir.hoisted.declarations[1]).toContain('return count;');
        expect(ir.hoisted.code[0]).toContain('{ count: count__inst2 }');
        expect(ir.hoisted.state[0].key).toBe('count__inst2');
    });

    test('same component and instance id clone deterministically', () => {
        const componentIr = {
            expressions: ['count + increment()'],
            expression_bindings: [
                {
                    literal: 'count + increment()',
                    compiled_expr: 'count + increment()',
                    component_instance: 'count',
                    component_binding: 'increment',
                    signal_index: null,
                    signal_indices: [],
                    state_index: null
                }
            ],
            hoisted: {
                state: [{ key: 'count', value: 'signal(0)' }],
                functions: ['increment'],
                signals: ['count'],
                declarations: ['const memo = { count };'],
                code: ['const payload = { count };']
            },
            ref_bindings: []
        };

        const left = cloneComponentIrForInstance(
            componentIr,
            7,
            extractDeclaredIdentifiers,
            resolveStateKeyFromBindings
        );
        const right = cloneComponentIrForInstance(
            componentIr,
            7,
            extractDeclaredIdentifiers,
            resolveStateKeyFromBindings
        );

        expect(JSON.stringify(left.ir)).toBe(JSON.stringify(right.ir));
        expect([...left.renameMap.entries()]).toEqual([...right.renameMap.entries()]);
        expect(left.refIdentifierPairs).toEqual(right.refIdentifierPairs);
    });

    test('props rewrite consumes exact compiler metadata and does not invent scope rewrites', () => {
        expect(
            resolvePropsValueCode('count + 1', {
                expressionRewrite: {
                    map: new Map(),
                    bindings: new Map(),
                    ambiguous: new Set(),
                    signals: [],
                    stateBindings: []
                }
            })
        ).toBe('count + 1');

        expect(
            resolvePropsValueCode('nextCount', {
                expressionRewrite: {
                    map: new Map(),
                    bindings: new Map([
                        ['nextCount', { compiled_expr: 'signalMap.get(0).get() + 1' }]
                    ]),
                    ambiguous: new Set(),
                    signals: [{ state_index: 0 }],
                    stateBindings: [{ key: 'count__inst7' }]
                }
            })
        ).toBe('count__inst7.get() + 1');
    });

    test('component rewrite lookup consumes compiler-owned binding literals without source recompilation', () => {
        const rewrite = buildComponentExpressionRewrite({
            expressions: ['count__inst7 + 1', 'c0.toggle'],
            expression_bindings: [
                {
                    literal: 'count + 1',
                    compiled_expr: 'signalMap.get(0).get() + 1',
                    component_instance: null,
                    component_binding: null,
                    signal_index: 0,
                    signal_indices: [0],
                    state_index: 0
                },
                {
                    literal: 'c0.toggle',
                    compiled_expr: null,
                    component_instance: 'c0',
                    component_binding: 'toggle',
                    signal_index: null,
                    signal_indices: [],
                    state_index: null
                }
            ],
            signals: [{ state_index: 0 }],
            hoisted: {
                state: [{ key: 'count__inst7', value: 'signal(0)' }],
                functions: [],
                declarations: [],
                signals: ['count__inst7']
            }
        });

        expect(rewrite.map.get('count + 1')).toBe('count__inst7 + 1');
        expect(rewrite.bindings.get('count + 1')).toMatchObject({
            compiled_expr: 'signalMap.get(0).get() + 1',
            signal_index: 0,
            signal_indices: [0],
            state_index: 0
        });
        expect(rewrite.bindings.get('c0.toggle')).toMatchObject({
            component_instance: 'c0',
            component_binding: 'toggle'
        });
        expect(rewrite.sequence).toEqual([
            expect.objectContaining({ raw: 'count + 1', rewritten: 'count__inst7 + 1' }),
            expect.objectContaining({ raw: 'c0.toggle', rewritten: 'c0.toggle' })
        ]);
    });

    test('props rewrite preserves shadowed local signalMap bindings', () => {
        expect(
            resolvePropsValueCode('shadowedSignalMap', {
                expressionRewrite: {
                    map: new Map(),
                    bindings: new Map([
                        ['shadowedSignalMap', {
                            compiled_expr: 'items.map((signalMap) => signalMap.get(0)).join(",")'
                        }]
                    ]),
                    ambiguous: new Set(),
                    signals: [{ state_index: 0 }],
                    stateBindings: [{ key: 'count__inst7' }]
                }
            })
        ).toBe('items.map((signalMap) => signalMap.get(0)).join(",")');
    });

    test('props rewrite preserves destructuring locals and nested lambdas while remapping true signal reads', () => {
        expect(
            resolvePropsValueCode('nestedDestructure', {
                expressionRewrite: {
                    map: new Map(),
                    bindings: new Map([
                        ['nestedDestructure', {
                            compiled_expr: 'items.map(({ count }) => () => count + signalMap.get(0).get())'
                        }]
                    ]),
                    ambiguous: new Set(),
                    signals: [{ state_index: 0 }],
                    stateBindings: [{ key: 'total__inst7' }]
                }
            })
        ).toBe('items.map(({ count }) => () => count + total__inst7.get())');
    });

    test('compiled signal remap preserves local signalMap shadowing while rewriting compiler-owned reads', () => {
        expect(
            remapCompiledExpressionSignals(
                'items.map((signalMap) => signalMap.get(0)).join(",")',
                [{ state_index: 0 }],
                [{ key: 'count__inst7' }],
                new Map([['count__inst7', 3]])
            )
        ).toBe('items.map((signalMap) => signalMap.get(0)).join(",")');

        expect(
            remapCompiledExpressionSignals(
                'items.map(({ count }) => () => count + signalMap.get(0).get())',
                [{ state_index: 0 }],
                [{ key: 'total__inst7' }],
                new Map([['total__inst7', 4]])
            )
        ).toBe('items.map(({ count }) => () => count + signalMap.get(4).get())');
    });

    test('instance cloning preserves literals comments templates and regex text while renaming live bindings', () => {
        const componentIr = {
            expressions: ['count'],
            expression_bindings: [
                {
                    literal: 'count',
                    compiled_expr: 'count',
                    component_instance: null,
                    component_binding: null,
                    signal_index: null,
                    signal_indices: [],
                    state_index: null
                }
            ],
            hoisted: {
                state: [{ key: 'count', value: 'signal(0)' }],
                functions: ['describe'],
                signals: ['count'],
                declarations: [
                    'const literal = "count literal";',
                    'const template = `template raw count ${count}`;',
                    'const matcher = /count+/g;',
                    [
                        'function describe() {',
                        '  // count stays in this comment',
                        '  return `${template} ${literal} ${matcher.source} ${count}`;',
                        '}'
                    ].join('\n')
                ],
                code: []
            },
            ref_bindings: []
        };

        const { ir } = cloneComponentIrForInstance(
            componentIr,
            2,
            extractDeclaredIdentifiers,
            resolveStateKeyFromBindings
        );

        const hoisted = ir.hoisted.declarations.join('\n');

        expect(hoisted).toContain('"count literal"');
        expect(hoisted).toContain('// count stays in this comment');
        expect(hoisted).toContain('`template raw count ${count__inst2}`');
        expect(hoisted).toContain('/count+/g');
        expect(hoisted).toContain('${template__inst2} ${literal__inst2} ${matcher__inst2.source} ${count__inst2}');
        expect(hoisted).not.toContain('"count__inst2 literal"');
        expect(hoisted).not.toContain('// count__inst2 stays in this comment');
        expect(hoisted).not.toContain('/count__inst2+/g');
    });
});
