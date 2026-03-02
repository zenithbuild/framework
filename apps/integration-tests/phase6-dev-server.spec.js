// PHASE 6 — Dev server stability.
// Contract: edits trigger rebuild without server crash and dev server never mutates HTML.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase 6: dev server stability', () => {
  test('touching .zen triggers rebuild without HTML mutation', async () => {
    const root = await createTempProject('zenith-phase6');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': '<div><h1>{count}</h1></div>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');

    const port = await getFreePort();
    const dev = startProcess('npm', ['run', 'dev', '--silent', '--', String(port)], { cwd: root });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });

      const first = await fetch(`http://localhost:${port}/`);
      const firstHtml = await first.text();
      expect(firstHtml.includes('__zenith_hmr')).toBe(false);

      const pageFile = path.join(root, 'pages', 'index.zen');
      await fs.appendFile(pageFile, '\n<!-- touch -->\n', 'utf8');

      // Give watcher time to rebuild and wait until HTTP serves again.
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
      const second = await fetch(`http://localhost:${port}/`);
      const secondHtml = await second.text();

      expect(second.status).toBe(200);
      expect(secondHtml.includes('__zenith_hmr')).toBe(false);
      expect(dev.proc.exitCode).toBeNull();
    } finally {
      await dev.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
