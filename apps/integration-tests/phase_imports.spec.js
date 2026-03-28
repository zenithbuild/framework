// PHASE IMPORTS — Compiler/Bundler import seam validation.
// Contract focus:
// - .zen imports resolve at compile time.
// - Imported component code inlines into the page bundle.
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

async function readRoutePageAsset(distDir, routePath = '/') {
  const manifest = JSON.parse(await fs.readFile(path.join(distDir, 'manifest.json'), 'utf8'));
  const routeChunk = manifest?.chunks?.[routePath];
  if (typeof routeChunk === 'string') {
    return routeChunk.replace(/^\//, '');
  }

  const htmlRel = routePath === '/' ? 'index.html' : path.join(routePath.replace(/^\//, ''), 'index.html');
  const html = await fs.readFile(path.join(distDir, htmlRel), 'utf8');
  return pageAssetFromHtml(html);
}

describe('Phase imports', () => {
  test('inlines imported component code and strips unresolved page imports', async () => {
    const root = await createTempProject('zenith-phase-imports');
    try {
      await scaffoldZenithProject(root, {
        router: true,
        pages: {
          'index.zen': `<script lang="ts">
import Button from '../components/Button.zen'
</script>
<main><Button label="Clicks"></Button></main>`,
          'about.zen': '<main>About</main>'
        }
      });

      await writeText(
        path.join(root, 'components', 'Button.zen'),
        `<script lang="ts">
interface ButtonProps {
  label?: string
}
const incoming = props as ButtonProps
const label = incoming.label
</script>
<button id="label">{label}</button>
`
      );

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build');

      const distDir = path.join(root, 'dist');
      const files = await walkFilesDeterministic(distDir);
      const componentAssets = files.filter((entry) => /^assets\/components_[A-Za-z0-9_]+\.[0-9a-f]{8}\.js$/.test(entry));
      expect(componentAssets).toHaveLength(0);

      const pageAsset = await readRoutePageAsset(distDir, '/');
      expect(pageAsset).not.toBeNull();
      const pageSource = await fs.readFile(path.join(distDir, pageAsset), 'utf8');

      expect(/[A-Za-z0-9_]*components_Button_zen_script0_[a-f0-9]+/.test(pageSource)).toBe(true);
      expect(pageSource.includes('var props = { label: "Clicks" };')).toBe(true);
      expect(pageSource.includes('import Button from')).toBe(false);
      expect(pageSource.includes('@zenithbuild/')).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
