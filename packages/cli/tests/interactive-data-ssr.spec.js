import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectInteractiveDataBindings } from '../dist/build/ssr-data-paths.js';
import { materializeSsrBindings } from '../dist/server-runtime/ssr-bindings.js';

const markers = [
    ['text', null, '__title'], ['attr', 'content', '__title'],
    ['attr', 'href', 'data.link'], ['attr', 'style', 'data.style'],
    ['attr', 'unsafeHTML', 'data.markup'], ['text', null, '__computed'],
    ['text', null, '__mutable'], ['text', null, 'data.constructor.name'],
    ['text', null, 'data.items[0].name'], ['text', null, 'data.nested'], ['text', null, '__fromMutable'],
];
function compileFixture() {
    return {
        hoisted: {
            declarations: ['const __props = props', 'const __title = __props.metadata.title',
                'const __computed = inspect(data)', 'let __mutable = data.style', 'const __fromMutable = __mutable'],
            code: ['var props = { metadata: data.metadata }; var __props = props; var __title = __props.metadata.title; var __computed = inspect(data); var __mutable = data.style; var __fromMutable = __mutable;'],
        },
        marker_bindings: markers.map(([kind, attr], index) => ({
            index, kind, attr, selector: kind === 'text' ? 'comment:zx-e:' + index : '[data-zx-a="' + index + '"]',
        })),
        expression_bindings: markers.map(([, , compiled_expr], marker_index) => ({ marker_index, compiled_expr })),
    };
}

test('interactive plans only project immutable scalar bindings and never execute setup', () => {
    const fixture = compileFixture();
    expect(collectInteractiveDataBindings(fixture).map(({ path }) => path)).toEqual([
        ['metadata', 'title'], ['metadata', 'title'], ['link'], ['items', '0', 'name'], ['nested'],
    ]);
    expect(collectInteractiveDataBindings({ ...fixture, has_scoped_server_data: true })).toEqual([]);
});

test('request values are isolated and escaped on interactive pages and void attributes close correctly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zenith-ssr-projection-'));
    const planPath = join(dir, 'ssr-bindings.json');
    const html = '<title><!--zx-e:0--></title><meta data-zx-a="1" /><a data-zx-a="2"></a><p><!--zx-e:9--></p>';
    try {
        await writeFile(planPath, JSON.stringify({ '/': collectInteractiveDataBindings(compileFixture()) }));
        const render = (title, link) => materializeSsrBindings({ html, planPath, routePath: '/',
            payload: { metadata: { title }, link, nested: { label: 'not a scalar' } } });
        const [one, two] = await Promise.all([render('First & second', '/docs'), render('Other', 'invalid:example')]);
        expect(one).toContain('First &amp; second<!--/ zx-e:0-->');
        expect(one).toMatch(/content="First &amp; second"\s*\/>/);
        expect(one).toContain('href="/docs"');
        expect(one).not.toContain('[object Object]');
        expect(two).toContain('content="Other"');
        expect(two).not.toContain('href=');
        expect(two).not.toContain('First');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
