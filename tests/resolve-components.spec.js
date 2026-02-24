import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    buildComponentRegistry,
    expandComponents,
} from '../src/resolve-components.js';

async function makeSrc(files) {
    const root = await mkdtemp(join(tmpdir(), 'zenith-resolve-components-'));
    const srcDir = join(root, 'src');
    await mkdir(srcDir, { recursive: true });

    for (const [relativePath, contents] of Object.entries(files)) {
        const fullPath = join(srcDir, relativePath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, contents, 'utf8');
    }

    return { root, srcDir };
}

describe('resolve-components', () => {
    let project;

    afterEach(async () => {
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('expands self-closing components', async () => {
        project = await makeSrc({
            'components/Foo.zen': '<div class="foo">Foo</div>',
        });

        const registry = buildComponentRegistry(project.srcDir);
        const { expandedSource, usedComponents } = expandComponents(
            '<Foo />',
            registry,
            '/virtual/page.zen'
        );

        expect(expandedSource).toBe('<div class="foo">Foo</div>');
        expect(usedComponents).toEqual(['Foo']);
    });

    test('expands slots for paired tags', async () => {
        project = await makeSrc({
            'components/Card.zen': '<section class="card"><slot /></section>',
        });

        const registry = buildComponentRegistry(project.srcDir);
        const { expandedSource } = expandComponents(
            '<Card><p>Body</p></Card>',
            registry,
            '/virtual/page.zen'
        );

        expect(expandedSource).toBe('<section class="card"><p>Body</p></section>');
    });

    test('supports document-mode wrappers', async () => {
        project = await makeSrc({
            'layouts/Layout.zen': `
<html lang="en">
  <head><title>Site</title></head>
  <body><slot /></body>
</html>`,
        });

        const registry = buildComponentRegistry(project.srcDir);
        const { expandedSource } = expandComponents(
            '<Layout><main>Home</main></Layout>',
            registry,
            '/virtual/page.zen'
        );

        expect(expandedSource).toContain('<html lang="en">');
        expect(expandedSource).toContain('<main>Home</main>');
    });

    test('throws when children are passed to a component without <slot />', async () => {
        project = await makeSrc({
            'components/Foo.zen': '<div>No slot</div>',
        });

        const registry = buildComponentRegistry(project.srcDir);
        expect(() => {
            expandComponents('<Foo><span>x</span></Foo>', registry, '/virtual/page.zen');
        }).toThrow('has children but its template has no <slot />');
    });

    test('throws on circular component dependencies', async () => {
        project = await makeSrc({
            'components/A.zen': '<B />',
            'components/B.zen': '<A />',
        });

        const registry = buildComponentRegistry(project.srcDir);
        expect(() => {
            expandComponents('<A />', registry, '/virtual/page.zen');
        }).toThrow('Circular component dependency detected');
    });

    test('throws on duplicate component names in the registry', async () => {
        project = await makeSrc({
            'components/Button.zen': '<button>One</button>',
            'layouts/Button.zen': '<div>Two</div>',
        });

        expect(() => buildComponentRegistry(project.srcDir)).toThrow(
            'Duplicate component name "Button"'
        );
    });

    test('does not auto-register framework components', async () => {
        project = await makeSrc({
            'components/Foo.zen': '<div>Foo</div>',
        });

        const registry = buildComponentRegistry(project.srcDir);
        expect(registry.has('ZenLink')).toBe(false);
    });
});
