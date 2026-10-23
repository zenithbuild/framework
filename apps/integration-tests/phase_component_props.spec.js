// PHASE COMPONENT PROPS — props prelude shape lock.
// Contract focus:
// - component instance props are serialized as an object prelude.
// - static and signal props preserve deterministic, explicit bindings.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
import { writeText } from './helpers/fs.js';

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

describe('Phase component props', () => {
  test('emits object-based props prelude for component instances', async () => {
    const root = await createTempProject('zenith-phase-component-props');
    try {
      await scaffoldZenithProject(root, {
        router: false,
        pages: {
          'index.zen': `<script lang="ts">
import Card from '../components/Card.zen'
const count = signal(0)
</script>
<main><Card label="Clicks" count={count}></Card></main>`
        }
      });

      await writeText(
        path.join(root, 'components', 'Card.zen'),
        `<script lang="ts">
interface CardProps {
  label?: string
  count?: unknown
}
const incoming = props as CardProps
const label = incoming.label
const count = incoming.count
</script>
<article><p>{label}</p><p>{count}</p></article>
`
      );

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build');

      const distDir = path.join(root, 'dist');
      const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
      const pageAsset = pageAssetFromHtml(indexHtml);
      expect(pageAsset).not.toBeNull();

      const pageSource = await fs.readFile(path.join(distDir, pageAsset), 'utf8');
      const propsMatch = pageSource.match(
        /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*\{[^}]*\blabel\s*:\s*["']Clicks["'][^}]*\bcount\s*:\s*[A-Za-z_$][A-Za-z0-9_$]*[^}]*\}\s*;?/
      );
      expect(propsMatch).not.toBeNull();
      expect(/\bcount\s*:\s*[A-Za-z_$][A-Za-z0-9_$]*/.test(propsMatch[0])).toBe(true);
      expect(/[A-Za-z0-9_]*components_Card_zen_script0_[a-f0-9]+/.test(pageSource)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
