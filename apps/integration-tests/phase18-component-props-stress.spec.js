// PHASE 18 — Nested component prop stress + identity stability.
// Contract focus:
// - Signal prop fan-out remains single-graph and deterministic.
// - Whitespace-only source edits do not alter emitted identity.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';
import { hashTree } from './helpers/fs.js';

jest.setTimeout(240000);

function parseScripts(html) {
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m = regex.exec(html);
  while (m) {
    const attrs = m[1] || '';
    scripts.push({
      src: /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1] || null,
      page: /\bdata-zx-page\b/.test(attrs)
    });
    m = regex.exec(html);
  }
  return scripts;
}

async function startPreview(root) {
  const port = await getFreePort();
  const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
  await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200, 404], timeoutMs: 45000 });
  return { preview, port };
}

describe('Phase 18: component prop stress', () => {
  test('100 component instances share one signal prop source and stay stable across route cycles', async () => {
    const root = await createTempProject('zenith-phase18-props');
    const childBlocks = Array.from({ length: 100 }, (_, index) => `
  <Child value={count}>
    <script>
      const value = __props.value
    </script>
    <span class="child-value" data-child="${index}">{value}</span>
  </Child>`).join('\n');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<script>
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <nav>
    <a href="/about" id="link-about">About</a>
  </nav>
${childBlocks}
  <button id="inc" on:click={inc}>+</button>
</main>`,
        'about.zen': '<main><a href="/" id="link-home">Home</a><p>About</p></main>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const dist = path.join(root, 'dist');
    const assets = await fs.readdir(path.join(dist, 'assets'));
    const componentAssets = assets.filter((name) => /^component\.[a-zA-Z0-9_-]+\.[a-f0-9]{8}\.js$/.test(name));
    expect(componentAssets.length).toBe(1);

    const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    const pageScript = parseScripts(indexHtml).find((entry) => entry.page);
    expect(pageScript).toBeTruthy();
    const pageJs = await fs.readFile(path.join(dist, pageScript.src.slice(1)), 'utf8');
    const signalTableMatch = pageJs.match(/const __zenith_signals = Object\.freeze\((\[[\s\S]*?\])\);/);
    expect(signalTableMatch).toBeTruthy();
    const signalTable = JSON.parse(signalTableMatch[1]);
    expect(signalTable.length).toBe(1);

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      let values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(100);
      expect(values.every((value) => value === '0')).toBe(true);

      for (let i = 0; i < 25; i++) {
        await page.click('#inc');
      }
      await page.waitForTimeout(80);
      values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(100);
      expect(values.every((value) => value === '25')).toBe(true);

      await page.click('#link-about');
      await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
      await page.click('#link-home');
      await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });

      for (let i = 0; i < 10; i++) {
        await page.click('#link-about');
        await page.waitForURL(`http://localhost:${port}/about`, { timeout: 3000 });
        await page.goBack();
        await page.waitForURL(`http://localhost:${port}/`, { timeout: 3000 });
      }

      await page.click('#inc');
      await page.waitForTimeout(80);
      values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(100);
      expect(values.every((value) => value === '26')).toBe(true);
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('whitespace-only source edits preserve emitted identity and hashes', async () => {
    const root = await createTempProject('zenith-phase18-identity');
    const baseIndex = `<script>
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <Child value={count}>
    <script>
      const value = __props.value
    </script>
    <span>{value}</span>
  </Child>
  <button id="inc" on:click={inc}>+</button>
</main>
`;

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': baseIndex,
        'about.zen': '<main><h1>About</h1></main>',
        'users/[id].zen': '<main><h1>User {params.id}</h1></main>'
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const dist = path.join(root, 'dist');
    const hashA = await hashTree(dist);

    const whitespaceOnlyVariant = `\n\n<!-- leading whitespace/comment only -->\n${baseIndex}\n<!-- trailing whitespace/comment only -->\n`;
    await fs.writeFile(path.join(root, 'pages', 'index.zen'), whitespaceOnlyVariant, 'utf8');

    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const hashB = await hashTree(dist);
    expect(hashB).toEqual(hashA);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('route params and component props with the same name stay isolated', async () => {
    const root = await createTempProject('zenith-phase18-param-prop-collision');
    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<main><a href="/users/42" id="go-user">User</a></main>',
        'users/[id].zen': `<script>
  const id = signal(7)
  function inc() { id.set(id.get() + 1) }
</script>
<main>
  <p id="route-id">{params.id}</p>
  <UserCard id={id}>
    <script>
      const id = __props.id
    </script>
    <p id="prop-id">{id}</p>
  </UserCard>
  <button id="inc" on:click={inc}>+</button>
</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      const response = await page.goto(`http://localhost:${port}/users/42`, { waitUntil: 'load' });
      expect(response?.status()).toBe(200);

      expect(((await page.textContent('#route-id')) || '').trim()).toBe('42');
      expect(((await page.textContent('#prop-id')) || '').trim()).toBe('7');

      await page.click('#inc');
      await page.waitForTimeout(80);

      expect(((await page.textContent('#route-id')) || '').trim()).toBe('42');
      expect(((await page.textContent('#prop-id')) || '').trim()).toBe('8');
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
