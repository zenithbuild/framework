// PHASE 10 — End-to-end sanity.
// Contract: scaffold minimal project, build, serve, navigate, and validate dynamic route param behavior.

import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase 10: end-to-end sanity', () => {
  test('minimal V0 project builds, serves, navigates, and resolves dynamic params', async () => {
    const root = await createTempProject('zenith-phase10');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<div><h1>E2E Home</h1><a id="about-link" href="/about">About</a><a id="user-link" href="/users/1">User 1</a></div>',
        'about.zen': '<div><h1>E2E About</h1><a id="home-link" href="/">Home</a></div>',
        'users/[id].zen': '<div><h1 id="user-page">User {params.id}</h1></div>'
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
      const hardLoad = await page.goto(`http://localhost:${port}/users/1`, { waitUntil: 'load' });
      expect(hardLoad?.status()).toBe(200);
      const hardLoadBody = await page.content();
      expect(hardLoadBody.includes('404 Not Found')).toBe(false);

      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      const homeContent = await page.content();
      expect(homeContent.includes('E2E Home')).toBe(true);

      const aboutLink = await page.$('#about-link');
      expect(aboutLink).not.toBeNull();

      await page.click('#about-link', { timeout: 2000 });
      await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
      await page.waitForSelector('h1', { timeout: 3000 });
      const aboutContent = await page.content();
      expect(aboutContent.includes('E2E About')).toBe(true);

      await page.click('#home-link', { timeout: 2000 });
      await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });

      await page.click('#user-link', { timeout: 2000 });
      await page.waitForURL(`http://localhost:${port}/users/1`, { timeout: 3000 });

      const pathname = await page.evaluate(() => window.location.pathname);
      expect(pathname).toBe('/users/1');

      const userHeader = await page.$('#user-page');
      expect(userHeader).not.toBeNull();
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
