// PHASE PREVIEW SSR — request-time server script contract.
// Contract focus:
// - For non-prerender server scripts, preview executes script per-request params.
// - Preview injects __zenith_ssr_data payload via inline script.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';

jest.setTimeout(180000);

describe('Phase preview SSR', () => {
  test('preview injects request-scoped ssr payload and renders dynamic value', async () => {
    const root = await createTempProject('zenith-phase-preview-ssr');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<main><a id="user-link" href="/users/42">User</a></main>',
        'users/[id].zen': `<script server>
export const ssr = {
  user: { name: params.id }
}
</script>
<main><h1 id="name">{ssr.user.name}</h1></main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
    const browser = await chromium.launch({ headless: true });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });

      const hardLoad = await fetch(`http://localhost:${port}/users/42`);
      expect(hardLoad.status).toBe(200);
      const hardLoadBody = await hardLoad.text();
      expect(hardLoadBody.includes('window.__zenith_ssr_data')).toBe(true);
      expect(hardLoadBody.includes('__zenith_ssr=')).toBe(false);

      const page = await browser.newPage();
      const response = await page.goto(`http://localhost:${port}/users/42`, { waitUntil: 'load' });
      expect(response?.status()).toBe(200);
      await page.waitForSelector('#name', { state: 'attached', timeout: 3000 });
      await page.waitForFunction(
        () => (document.querySelector('#name')?.textContent || '').trim() === '42',
        null,
        { timeout: 3000 }
      );
      expect(((await page.textContent('#name')) || '').trim()).toBe('42');
      await page.close();
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('server script execution is request-isolated and does not mutate build graph identity', async () => {
    const root = await createTempProject('zenith-phase-preview-ssr-isolation');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<main><a id="user-link" href="/users/42">User</a></main>',
        'users/[id].zen': `<script server>
let counter = 0;
counter += 1;
export const ssr_data = { count: counter };
</script>
<main><h1 id="count">{ssr.count}</h1></main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const manifestPath = path.join(root, 'dist', 'assets', 'router-manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const userRoute = Array.isArray(manifest.routes)
      ? manifest.routes.find((entry) => entry.path === '/users/:id')
      : null;
    expect(userRoute).toBeTruthy();
    expect(typeof userRoute.page_asset).toBe('string');

    const pageAssetPath = path.join(root, 'dist', userRoute.page_asset);
    const beforeAsset = await fs.readFile(pageAssetPath, 'utf8');

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
      for (let i = 0; i < 100; i++) {
        const response = await fetch(`http://localhost:${port}/users/42`);
        expect(response.status).toBe(200);
        const body = await response.text();
        const payload = readInjectedSsr(body);
        expect(payload).toEqual({ count: 1 });
      }

      const afterAsset = await fs.readFile(pageAssetPath, 'utf8');
      expect(afterAsset).toBe(beforeAsset);
    } finally {
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('inline SSR payload escaping prevents script breakout', async () => {
    const root = await createTempProject('zenith-phase-preview-ssr-escape');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<script server lang="ts">
export const ssr_data = {
  dangerous: '</scr' + 'ipt><script>alert(1)</scr' + 'ipt>',
  lineSep: 'A\u2028B',
  paraSep: 'A\u2029B'
}
</script>
<main><h1 id="ok">escape</h1></main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });

    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
      const response = await fetch(`http://localhost:${port}/`);
      expect(response.status).toBe(200);
      const html = await response.text();

      expect(html.includes('<script>alert(1)</script>')).toBe(false);
      expect(html.includes('\\u003C\\u002Fscript\\u003E\\u003Cscript\\u003Ealert(1)\\u003C\\u002Fscript\\u003E')).toBe(true);
      expect(html.includes('\\u2028')).toBe(true);
      expect(html.includes('\\u2029')).toBe(true);
      expect((html.match(/id="zenith-ssr-data"/g) || []).length).toBe(1);
    } finally {
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

function readInjectedSsr(html) {
  const match = html.match(/window\.__zenith_ssr_data\s*=\s*Object\.freeze\(([\s\S]*?)\);<\/script>/i);
  if (!match) {
    return null;
  }
  return JSON.parse(match[1]);
}
