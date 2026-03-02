// PHASE ZENEFFECT — explicit dependency effect contract.
// Contract focus:
// - zeneffect(fn, deps) runs deterministically.
// - cleanup function runs before re-run and on dispose path.

import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase zeneffect', () => {
  test('effect updates derived signal and tracks cleanup calls', async () => {
    const root = await createTempProject('zenith-phase-zeneffect');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script>
const count = signal(0)
const doubled = signal(0)
const cleanups = signal(0)

zeneffect(() => {
  doubled.set(count.get() * 2)
  return () => cleanups.set(cleanups.get() + 1)
}, [count])

function inc() { count.set(count.get() + 1) }
</script>
<main>
  <p id="count">{count}</p>
  <p id="doubled">{doubled}</p>
  <p id="cleanups">{cleanups}</p>
  <button id="inc" on:click={inc}>+</button>
</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
    const browser = await chromium.launch({ headless: true });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });

      expect(((await page.textContent('#count')) || '').trim()).toBe('0');
      expect(((await page.textContent('#doubled')) || '').trim()).toBe('0');
      expect(((await page.textContent('#cleanups')) || '').trim()).toBe('0');

      await page.click('#inc');
      await page.click('#inc');
      await page.waitForTimeout(120);

      expect(((await page.textContent('#count')) || '').trim()).toBe('2');
      expect(((await page.textContent('#doubled')) || '').trim()).toBe('4');
      expect(((await page.textContent('#cleanups')) || '').trim()).toBe('2');
      await page.close();
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
