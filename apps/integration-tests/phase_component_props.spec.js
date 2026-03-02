// PHASE COMPONENT PROPS — props payload shape lock.
// Contract focus:
// - component instance props are serialized as an array payload.
// - static and signal props preserve deterministic, explicit descriptors.

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
  test('emits array-based props descriptors for component instances', async () => {
    const root = await createTempProject('zenith-phase-component-props');
    try {
      await scaffoldZenithProject(root, {
        router: false,
        pages: {
          'index.zen': `<script>
import Card from './components/Card.zen'
const count = signal(0)
</script>
<main><Card label="Clicks" count={count}></Card></main>`
        }
      });

      await writeText(
        path.join(root, 'pages', 'components', 'Card.zen'),
        `<script>
const label = __props.label
const count = __props.count
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
      const propsMatch = pageSource.match(/props:(\[[^\]]*\])/);
      expect(propsMatch).not.toBeNull();

      const propsTable = JSON.parse(propsMatch[1]);
      expect(Array.isArray(propsTable)).toBe(true);
      expect(propsTable.length).toBe(2);

      const byName = new Map(propsTable.map((entry) => [entry.name, entry]));
      expect(byName.get('label')?.type).toBe('static');
      expect(byName.get('label')?.value).toBe('Clicks');
      expect(byName.get('count')?.type).toBe('signal');
      expect(byName.get('count')?.index).toBe(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
