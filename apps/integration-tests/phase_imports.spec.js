// PHASE IMPORTS — Compiler/Bundler import seam validation.
// Contract focus:
// - .zen imports resolve at compile time.
// - Bundler emits deterministic component.<hoist>.<hash>.js assets.
// - Browser bundles contain no bare @zenithbuild/* specifiers.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
import { walkFilesDeterministic, writeText } from './helpers/fs.js';

jest.setTimeout(120000);

function pageAssetFromHtml(html) {
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of tags) {
    if (!/\bdata-zx-page\b/i.test(tag)) {
      continue;
    }
    const src = tag.match(/\bsrc="([^"]+)"/i);
    if (src) {
      return src[1].replace(/^\//, '');
    }
  }
  return null;
}

describe('Phase imports', () => {
  test('emits deterministic component module and rewrites page imports', async () => {
    const root = await createTempProject('zenith-phase-imports');
    try {
      await scaffoldZenithProject(root, {
        router: true,
        pages: {
          'index.zen': `<script>
import Button from './components/Button.zen'
</script>
<main><Button label="Clicks"></Button></main>`,
          'about.zen': '<main>About</main>'
        }
      });

      await writeText(
        path.join(root, 'pages', 'components', 'Button.zen'),
        `<script>
const label = __props.label
</script>
<button id="label">{label}</button>
`
      );

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build');

      const distDir = path.join(root, 'dist');
      const files = await walkFilesDeterministic(distDir);
      const componentAssets = files.filter((entry) => /^assets\/component\..+\.[0-9a-f]{8}\.js$/.test(entry));
      expect(componentAssets.length).toBe(1);

      const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
      const pageAsset = pageAssetFromHtml(indexHtml);
      expect(pageAsset).not.toBeNull();
      const pageSource = await fs.readFile(path.join(distDir, pageAsset), 'utf8');

      expect(pageSource.includes('component.')).toBe(true);
      expect(pageSource.includes('@zenithbuild/')).toBe(false);

      const componentSource = await fs.readFile(path.join(distDir, componentAssets[0]), 'utf8');
      expect(componentSource.includes('@zenithbuild/')).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
