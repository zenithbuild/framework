import { resolveExtension, listExtensions } from '../dist/extensions/registry.js';
import { runCommand as runPluginCommand } from '../dist/commands/plugin/index.js';
import { runCommand as runAdapterCommand } from '../dist/commands/adapter/index.js';
import { createZenithLogger } from '../dist/ui/logger.js';

function createTestLogger() {
    const lines = [];
    const logger = createZenithLogger({
        stdout: { isTTY: false, write: (chunk) => lines.push(String(chunk)) },
        stderr: { isTTY: false, write: (chunk) => lines.push(String(chunk)) }
    });
    return { logger, lines };
}

describe('extension registry and read-only CLI', () => {
    test('alias resolution maps image to @zenithbuild/plugin-image', () => {
        const entry = resolveExtension('image', 'plugin');
        expect(entry?.name).toBe('@zenithbuild/plugin-image');
    });

    test('plugin list returns registry plugins', async () => {
        const plugins = listExtensions('plugin');
        expect(plugins.some((entry) => entry.alias === 'image')).toBe(true);
    });

    test('zenith plugin list does not throw', async () => {
        const { logger, lines } = createTestLogger();
        const code = await runPluginCommand(['list'], { projectRoot: process.cwd(), logger });
        expect(code).toBe(0);
        expect(lines.join('')).toContain('@zenithbuild/plugin-image');
    });

    test('zenith plugin search finds image', async () => {
        const { logger, lines } = createTestLogger();
        const code = await runPluginCommand(['search', 'image'], { projectRoot: process.cwd(), logger });
        expect(code).toBe(0);
        expect(lines.join('')).toContain('Image Plugin');
    });

    test('zenith plugin info resolves alias without importing package entrypoints', async () => {
        const { logger, lines } = createTestLogger();
        const code = await runPluginCommand(['info', 'image'], { projectRoot: process.cwd(), logger });
        expect(code).toBe(0);
        expect(lines.join('')).toContain('image -> @zenithbuild/plugin-image');
        expect(lines.join('')).toContain('Not installed');
    });

    test('zenith adapter list includes registry and built-in targets', async () => {
        const { logger, lines } = createTestLogger();
        const code = await runAdapterCommand(['list'], { projectRoot: process.cwd(), logger });
        expect(code).toBe(0);
        const output = lines.join('');
        expect(output).toContain('@zenithbuild/adapter-vercel');
        expect(output).toContain('Built-in targets');
        expect(output).toContain('node');
    });

    test('unsupported plugin commands are unknown in M1', async () => {
        for (const subcommand of ['add', 'remove', 'create']) {
            const { logger, lines } = createTestLogger();
            const code = await runPluginCommand([subcommand, 'image'], { projectRoot: process.cwd(), logger });
            expect(code).toBe(1);
            expect(lines.join('')).toContain(`Unknown plugin command: ${subcommand}`);
        }
    });

    test('unsupported adapter commands are unknown in M1', async () => {
        for (const subcommand of ['add', 'create']) {
            const { logger, lines } = createTestLogger();
            const code = await runAdapterCommand([subcommand, 'vercel'], { projectRoot: process.cwd(), logger });
            expect(code).toBe(1);
            expect(lines.join('')).toContain(`Unknown adapter command: ${subcommand}`);
        }
    });
});
