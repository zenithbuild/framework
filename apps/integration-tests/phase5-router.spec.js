// PHASE 5 — Router seam validation via real browser.
// Contract:
// - router:true should enable client-side navigation semantics.
// - router:false should remain full page navigation with no router injection.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { startProcess, waitForHttp, getFreePort, assertSuccess } from './helpers/process.js';

jest.setTimeout(180000);

async function setupProject(router) {
  const root = await createTempProject(router ? 'zenith-phase5-router' : 'zenith-phase5-static');
  await scaffoldZenithProject(root, {
    router,
    pages: {
      'index.zen': '<div><h1>Home</h1><a id="about-link" href="/about">About</a><a id="user-link" href="/users/42">User</a></div>',
      'about.zen': '<div><h1>About</h1><a id="home-link" href="/">Home</a></div>',
      'users/[id].zen': '<div><h1 id="user-id">{params.id}</h1></div>'
    }
  });

  assertSuccess(npmInstall(root), 'npm install');
  assertSuccess(runCli(root, ['build']), 'zenith build');
  return root;
}

async function startPreview(root) {
  const port = await getFreePort();
  const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
  await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200, 404], timeoutMs: 45000 });
  return { preview, port };
}

describe('Phase 5: router seam behavior', () => {
  test('router:true supports history navigation without full reload', async () => {
    const root = await setupProject(true);
    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      let loadEvents = 0;
      page.on('load', () => {
        loadEvents += 1;
      });

      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      const baselineLoads = loadEvents;

      const aboutLink = await page.$('#about-link');
      expect(aboutLink).not.toBeNull();

      await page.click('#about-link', { timeout: 2000 });
      await page.waitForTimeout(500);

      // SPA navigation should avoid full document reload.
      expect(loadEvents).toBe(baselineLoads);

      await page.goBack();
      await page.waitForTimeout(250);
      await page.goForward();
      await page.waitForTimeout(250);

      const pathname = await page.evaluate(() => window.location.pathname);
      expect(pathname).toBe('/about');

      // Router contract: no implicit scroll override.
      const distIndex = await fsp.readFile(path.join(root, 'dist', 'index.html'), 'utf8');
      expect(distIndex.includes('scrollTo(')).toBe(false);
    } finally {
      await browser.close();
      await preview.stop();
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  test('router:false remains full page reload and does not inject router script', async () => {
    const root = await setupProject(false);
    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });

    try {
      const indexHtml = await fsp.readFile(path.join(root, 'dist', 'index.html'), 'utf8');
      expect(indexHtml.includes('zenith-router')).toBe(false);

      const page = await browser.newPage();
      let loadEvents = 0;
      page.on('load', () => {
        loadEvents += 1;
      });

      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      const baselineLoads = loadEvents;

      const aboutLink = await page.$('#about-link');
      expect(aboutLink).not.toBeNull();

      await page.click('#about-link', { timeout: 2000 });
      await page.waitForLoadState('load');

      expect(loadEvents).toBeGreaterThan(baselineLoads);
    } finally {
      await browser.close();
      await preview.stop();
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  test('router:true remounts reactive bindings after route cycles', async () => {
    const root = await createTempProject('zenith-phase5-router-reactive');
    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<script>
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<div>
  <a id="about-link" href="/about">About</a>
  <p id="value">{count}</p>
  <button id="plus" on:click={inc}>+</button>
</div>`,
        'about.zen': '<div><a id="home-link" href="/">Home</a><p>About</p></div>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      expect(((await page.textContent('#value')) || '').trim()).toBe('0');

      await page.click('#about-link', { timeout: 2000 });
      await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });

      await page.click('#home-link', { timeout: 2000 });
      await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });

      await page.click('#plus');
      await page.click('#plus');
      await page.click('#plus');
      await page.waitForTimeout(200);

      expect(((await page.textContent('#value')) || '').trim()).toBe('3');
    } finally {
      await browser.close();
      await preview.stop();
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
