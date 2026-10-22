import { validateConfig as core } from '../../core/dist/config.js';
import { validateConfig as cli } from '../dist/config.js';
import { loadConfig as loadCore } from '../../core/dist/config.js';
import { loadConfig as loadCli } from '../dist/config.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cases = [
    ['defaults', {}],
    ['unknown config key', { unknown: true }],
    ['base path normalization', { basePath: '/docs//' }],
    ['invalid base path', { basePath: 'docs' }],
    ['quality upper bound', { images: { quality: 101 } }],
    ['quality lower bound', { images: { quality: 0 } }],
    ['image format normalization', { images: { formats: ['GIF'] } }],
    ['multiple formats', { images: { formats: ['JPEG', 'webp'] } }],
    ['image widths', { images: { deviceSizes: [32, 16, 32] } }],
    ['remote pattern validation', { images: { remotePatterns: [{ hostname: 'EXAMPLE.COM', unexpected: true }] } }],
    ['local network policy type', { images: { dangerouslyAllowLocalNetwork: 'yes' } }],
    ['cache lifetime boundary', { images: { minimumCacheTTL: 0 } }]
];

function evaluate(validate, input) {
    try {
        // Compare public config data. CLI-only non-enumerable loading metadata
        // is a separate contract and must survive the future facade migration.
        return { accepted: true, value: JSON.parse(JSON.stringify(validate(structuredClone(input)))) };
    } catch (error) {
        return { accepted: false, error: error.message };
    }
}

test.each(cases)('shared config boundary preserves current core/CLI behavior: %s', (_, input) => {
    expect(evaluate(cli, input)).toEqual(evaluate(core, input));
});

test('shared plugin loading retains CLI messages from thrown plain objects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zenith-config-hook-message-'));
    try {
        await writeFile(join(root, 'zenith.config.js'), "module.exports = { plugins: [{ name: 'diagnostic', config() { throw { message: 'Readable failure' }; } }] };\n");
        for (const load of [loadCore, loadCli]) {
            await expect(load(root)).rejects.toThrow('[Zenith plugin diagnostic] config failed: Readable failure');
        }
    } finally { await rm(root, { recursive: true, force: true }); }
});
