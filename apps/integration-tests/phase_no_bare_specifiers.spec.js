// PHASE NO BARE SPECIFIERS — emitted browser module safety.
// Contract focus:
// - Dist JS must not include bare internal imports.
// - Browser bundles must be self-contained relative assets.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
import { walkFilesDeterministic, writeText } from './helpers/fs.js';

jest.setTimeout(120000);

describe('Phase no-bare-specifiers', () => {
  test('dist JS has no bare @zenithbuild/* imports', async () => {
    const root = await createTempProject('zenith-phase-no-bare');
    try {
      await scaffoldZenithProject(root, {
        router: true,
        pages: {
          'index.zen': `<script>
import Button from './components/Button.zen'
const count = signal(0)
function inc() { count.set(count.get() + 1) }
</script>
<main>
  <Button label="Clicks" count={count}></Button>
  <button id="inc" on:click={inc}>+</button>
</main>`,
          'about.zen': '<main>About</main>'
        }
      });

      await writeText(
        path.join(root, 'pages', 'components', 'Button.zen'),
        `<script>
const label = __props.label
const count = __props.count
</script>
<article>
  <p>{label}</p>
  <p>{count}</p>
</article>
`
      );

      assertSuccess(npmInstall(root), 'npm install');
      assertSuccess(runCli(root, ['build']), 'zenith build');

      const distDir = path.join(root, 'dist');
      const files = await walkFilesDeterministic(distDir);
      const jsFiles = files.filter((entry) => entry.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);

      for (const rel of jsFiles) {
        const source = await fs.readFile(path.join(distDir, rel), 'utf8');
        expect(source.includes("@zenithbuild/")).toBe(false);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
