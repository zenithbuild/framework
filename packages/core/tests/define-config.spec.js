import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadConfig } from '../dist/config.js';

const CONFIG_MODULE_URL = pathToFileURL(join(process.cwd(), 'dist', 'config.js')).href;

describe('defineConfig', () => {
  let projectRoot = null;

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = null;
    }
  });

  test('returns the same config object for type inference passthrough', () => {
    const config = { target: 'static', outDir: 'build-output', basePath: '/docs' };
    expect(defineConfig(config)).toBe(config);
  });

  test('accepts the minimal plugin config surface for type inference passthrough', () => {
    const plugin = { name: 'auth', config: () => ({ basePath: '/auth' }) };
    const config = { plugins: [plugin] };
    expect(defineConfig(config)).toBe(config);
  });

  test('loadConfig supports zenith.config.ts files that call defineConfig()', async () => {
    projectRoot = join(tmpdir(), `zenith-core-define-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      join(projectRoot, 'zenith.config.ts'),
      [
        `import { defineConfig } from ${JSON.stringify(CONFIG_MODULE_URL)};`,
        'export default defineConfig({',
        '  target: "static",',
        '  outDir: "build-output",',
        '  pagesDir: "src/pages",',
        '  basePath: "/docs"',
        '});'
      ].join('\n'),
      'utf8'
    );

    const config = await loadConfig(projectRoot);
    expect(config.target).toBe('static');
    expect(config.outDir).toBe('build-output');
    expect(config.pagesDir).toBe('src/pages');
    expect(config.basePath).toBe('/docs');
  });
});
