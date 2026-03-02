// PHASE 17 — Deterministic runtime stability (browser-level endurance).
// Contract focus:
// - Deep reactivity stress survives route churn.
// - Dynamic hard-load routing matrix is exact and deterministic.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(240000);

async function startPreview(root) {
  const port = await getFreePort();
  const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
  await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200, 404], timeoutMs: 45000 });
  return { preview, port };
}

describe('Phase 17: runtime endurance', () => {
  test('deep reactivity survives rapid updates, route cycles, and back/forward churn', async () => {
    const root = await createTempProject('zenith-phase17-reactivity');
    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<script>
  const count = signal(0)
  const double = signal(0)
  zeneffect([count], () => {
    double.set(count.get() * 2)
  })
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <nav>
    <a href="/about" id="link-about">About</a>
  </nav>
  <p id="count">{count}</p>
  <p id="double">{double}</p>
  <button id="inc" on:click={inc}>+</button>
</main>`,
        'about.zen': '<main><a id="link-home" href="/">Home</a><p>About</p></main>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });

    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      expect(((await page.textContent('#count')) || '').trim()).toBe('0');
      expect(((await page.textContent('#double')) || '').trim()).toBe('0');

      await page.evaluate(() => {
        const inc = document.getElementById('inc');
        for (let i = 0; i < 200; i++) {
          inc?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
      await page.waitForTimeout(200);
      expect(((await page.textContent('#count')) || '').trim()).toBe('200');
      expect(((await page.textContent('#double')) || '').trim()).toBe('400');

      await page.click('#link-about');
      await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
      await page.click('#link-home');
      await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });

      await page.click('#inc');
      await page.waitForTimeout(60);
      expect(((await page.textContent('#count')) || '').trim()).toBe('201');
      expect(((await page.textContent('#double')) || '').trim()).toBe('402');

      for (let i = 0; i < 50; i++) {
        await page.click('#link-about');
        await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
        await page.goBack();
        await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });
        await page.goForward();
        await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
        await page.click('#link-home');
        await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });
      }

      await page.click('#inc');
      await page.waitForTimeout(60);
      expect(((await page.textContent('#count')) || '').trim()).toBe('202');
      expect(((await page.textContent('#double')) || '').trim()).toBe('404');

      expect(consoleErrors).toEqual([]);
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('hard-load dynamic route matrix is exact-length and deterministic', async () => {
    const root = await createTempProject('zenith-phase17-route-matrix');
    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<main><h1>Home</h1></main>',
        'users/[id].zen': '<main><h1 id="user-id">User {params.id}</h1></main>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      const expected200 = [
        { path: '/users/1', id: '1' },
        { path: '/users/42', id: '42' },
        { path: '/users/999', id: '999' },
        { path: '/users/abc', id: 'abc' },
        { path: '/users/%20', id: '%20' }
      ];

      for (const entry of expected200) {
        const response = await page.goto(`http://localhost:${port}${entry.path}`, { waitUntil: 'load' });
        expect(response?.status()).toBe(200);
        const body = await page.content();
        expect(body.includes('404 Not Found')).toBe(false);
        expect(((await page.textContent('#user-id')) || '').trim()).toBe(entry.id);
      }

      const invalid = await page.goto(`http://localhost:${port}/users/42/extra`, { waitUntil: 'load' });
      expect(invalid?.status()).toBe(404);
      const invalidBody = await page.content();
      expect(invalidBody.includes('404 Not Found')).toBe(true);
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
