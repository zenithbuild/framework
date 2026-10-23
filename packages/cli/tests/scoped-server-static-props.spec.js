import { parseScopedComponentStaticProps } from '../dist/scoped-server-data/static-props.js';

describe('scoped server static props (#99B-2)', () => {
    test('accepts literal-only component props', () => {
        const result = parseScopedComponentStaticProps({
            attrs: [
                'title="Hello"',
                'featured',
                'count={3}',
                'enabled={true}',
                'empty={null}',
                'meta={{ label: "Docs", nested: { ok: true }, items: [1, "two", null] }}'
            ].join(' '),
            ownerKey: 'src/components/Card.zen',
            contextFile: 'src/pages/index.zen',
            occurrenceId: 'o0'
        });

        expect(result.diagnostics).toEqual([]);
        expect(result.props).toEqual({
            title: 'Hello',
            featured: true,
            count: 3,
            enabled: true,
            empty: null,
            meta: {
                label: 'Docs',
                nested: { ok: true },
                items: [1, 'two', null]
            }
        });
    });

    test('preserves backslashes in quoted props as literal text', () => {
        const result = parseScopedComponentStaticProps({
            attrs: String.raw`path="C:\temp" line="line\ntext" quote="He said \"hi\""`,
            ownerKey: 'src/components/Card.zen',
            contextFile: 'src/pages/index.zen',
            occurrenceId: 'o0'
        });

        expect(result.diagnostics).toEqual([]);
        expect(result.props).toEqual({
            path: 'C:\\temp',
            line: 'line\\ntext',
            quote: 'He said "hi"'
        });
        expect(result.props.path).not.toContain('\t');
        expect(result.props.line).not.toContain('\n');
    });

    test.each([
        ['identifier', 'title={title}', 'identifiers require runtime evaluation'],
        ['member expression', 'user={data.user}', 'member expressions require runtime evaluation'],
        ['call expression', 'value={getValue()}', 'function calls require runtime evaluation'],
        ['spread', '{...props}', 'spread props are unsupported'],
        ['event handler', 'onClick={handleClick}', 'event/function props require runtime evaluation'],
        ['function value', 'mapper={(value) => value}', 'function values are unsupported'],
        ['template expression', 'title={`Hello ${name}`}', 'template literals are unsupported']
    ])('rejects %s with CSV013', (_label, attrs, reason) => {
        const result = parseScopedComponentStaticProps({
            attrs,
            ownerKey: 'src/components/Card.zen',
            contextFile: 'src/pages/index.zen',
            occurrenceId: 'o1'
        });

        expect(result.props).toEqual({});
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                code: 'CSV013',
                severity: 'error',
                filePath: 'src/pages/index.zen',
                message: expect.stringContaining(reason)
            })
        ]);
        expect(result.diagnostics[0].message).toContain('src/components/Card.zen');
        expect(result.diagnostics[0].message).toContain('o1');
    });
});
