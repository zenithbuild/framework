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

async function readRoutePageBundle(distDir, routePath = '/') {
  const manifest = JSON.parse(await fs.readFile(path.join(distDir, 'manifest.json'), 'utf8'));
  const routeChunk = manifest?.chunks?.[routePath];
  if (typeof routeChunk !== 'string') {
    throw new Error(`missing route chunk for ${routePath}`);
  }
  return await fs.readFile(path.join(distDir, routeChunk.replace(/^\//, '')), 'utf8');
}

function extractComponentScope(pageJs, componentName) {
  const match = pageJs.match(new RegExp(`[A-Za-z0-9_]*components_${componentName}_zen_script0_[a-f0-9]+`));
  if (!match) {
    throw new Error(`missing inlined scope for component ${componentName}`);
  }
  return match[0];
}

function extractScopedLines(pageJs, scopeFragment) {
  return pageJs
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(scopeFragment))
    .filter((line) => !line.includes('__zenith_expression_bindings'));
}

async function startPreview(root) {
  const port = await getFreePort();
  const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
  await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200, 404], timeoutMs: 45000 });
  return { preview, port };
}

async function writeComponent(root, name, source) {
  const componentDir = path.join(root, 'components');
  await fs.mkdir(componentDir, { recursive: true });
  const abs = path.join(componentDir, `${name}.zen`);
  await fs.writeFile(abs, source, 'utf8');
  return abs;
}

describe('Phase 18: component prop stress', () => {
  test('25 component instances share one signal prop source and stay stable across route cycles', async () => {
    const root = await createTempProject('zenith-phase18-props');
    const instanceCount = 25;
    const childBlocks = Array.from({ length: instanceCount }, (_, index) => `
  <Child value={count} childIndex="${index}" />`).join('\n');

    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': `<script lang="ts">
  import Child from '../components/Child.zen'
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
    await writeComponent(root, 'Child', `<script lang="ts">
interface ChildProps {
  value?: unknown
  childIndex?: string
}
const incoming = props as ChildProps
const value = incoming.value
const childIndex = incoming.childIndex
</script>
<span class="child-value" data-child={childIndex}>{value}</span>
`);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const dist = path.join(root, 'dist');
    const assets = await fs.readdir(path.join(dist, 'assets'));
    const componentAssets = assets.filter((name) => /^component\.[a-zA-Z0-9_-]+\.[a-f0-9]{8}\.js$/.test(name));
    expect(componentAssets).toHaveLength(0);

    const pageJs = await readRoutePageBundle(dist, '/');
    expect(pageJs).toMatch(/const __zenith_components\s*=\s*\[\s*\]/);
    const signalTableMatch = pageJs.match(/const __zenith_signals\s*=\s*(?:Object\.freeze\()?(\[[\s\S]*?\])\)?;/);
    expect(signalTableMatch).toBeTruthy();
    const signalTable = Function(`"use strict";return (${signalTableMatch[1]});`)();
    expect(signalTable.length).toBe(1);

    const { preview, port } = await startPreview(root);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      let values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(instanceCount);
      expect(values.every((value) => value === '0')).toBe(true);

      for (let i = 0; i < 25; i++) {
        await page.click('#inc');
      }
      await page.waitForFunction(
        (expectedCount) => {
          const values = Array.from(document.querySelectorAll('.child-value')).map((node) => (node.textContent || '').trim());
          return values.length === expectedCount && values.every((value) => value === values[0]) && Number.parseInt(values[0] || '0', 10) >= 10;
        },
        instanceCount,
        { timeout: 3000 }
      );
      values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(instanceCount);
      const afterBurstValue = values[0];
      expect(values.every((value) => value === afterBurstValue)).toBe(true);
      expect(Number.parseInt(afterBurstValue, 10)).toBeGreaterThanOrEqual(10);

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

      await page.waitForFunction(
        (expectedCount) => {
          const values = Array.from(document.querySelectorAll('.child-value')).map((node) => (node.textContent || '').trim());
          return values.length === expectedCount && values.every((value) => value === '0');
        },
        instanceCount,
        { timeout: 3000 }
      );
      await page.click('#inc');
      await page.waitForFunction(
        (expected) => Array.from(document.querySelectorAll('.child-value')).every((node) => (node.textContent || '').trim() === expected),
        '1',
        { timeout: 3000 }
      );
      values = await page.$$eval('.child-value', (nodes) => nodes.map((node) => node.textContent?.trim() || ''));
      expect(values.length).toBe(instanceCount);
      expect(values.every((value) => value === '1')).toBe(true);
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('whitespace-only source edits preserve emitted identity and hashes', async () => {
    const root = await createTempProject('zenith-phase18-identity');
    const baseIndex = `<script lang="ts">
  import Child from '../components/Child.zen'
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <Child value={count} />
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
    await writeComponent(root, 'Child', `<script lang="ts">
interface ChildProps {
  value?: unknown
}
const incoming = props as ChildProps
const value = incoming.value
</script>
<span>{value}</span>
`);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const dist = path.join(root, 'dist');
    const firstPageJs = await readRoutePageBundle(dist, '/');
    const firstScope = extractComponentScope(firstPageJs, 'Child');
    const firstScopedLines = extractScopedLines(firstPageJs, firstScope);

    const whitespaceOnlyVariant = `\n\n<!-- leading whitespace/comment only -->\n${baseIndex}\n<!-- trailing whitespace/comment only -->\n`;
    await fs.writeFile(path.join(root, 'pages', 'index.zen'), whitespaceOnlyVariant, 'utf8');

    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const secondPageJs = await readRoutePageBundle(dist, '/');
    const secondScope = extractComponentScope(secondPageJs, 'Child');
    expect(secondScope).toBe(firstScope);
    expect(extractScopedLines(secondPageJs, secondScope)).toEqual(firstScopedLines);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('route params and component props with the same name stay isolated', async () => {
    const root = await createTempProject('zenith-phase18-param-prop-collision');
    await scaffoldZenithProject(root, {
      router: true,
      pages: {
        'index.zen': '<main><a href="/users/42" id="go-user">User</a></main>',
        'users/[id].zen': `<script lang="ts">
  import UserCard from '../../components/UserCard.zen'
  const id = signal(7)
  function inc() { id.set(id.get() + 1) }
</script>
<main>
  <p id="route-id">{params.id}</p>
  <UserCard id={id} />
  <button id="inc" on:click={inc}>+</button>
</main>`
      }
    });
    await writeComponent(root, 'UserCard', `<script lang="ts">
interface UserCardProps {
  id?: unknown
}
const incoming = props as UserCardProps
const id = incoming.id
</script>
<p id="prop-id">{id}</p>
`);

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
