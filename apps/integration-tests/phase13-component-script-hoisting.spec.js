// PHASE 13 — Component script hoisting + compile-time inlining contract.
// Imported component scripts must inline into deterministic page bundles.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, getFreePort, startProcess, waitForHttp } from './helpers/process.js';
import { runCompilerBinary } from './helpers/pipeline.js';
import { hashTree } from './helpers/fs.js';

jest.setTimeout(180000);

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

async function readPageBundle(distDir, htmlPath = 'index.html') {
  const html = await fs.readFile(path.join(distDir, htmlPath), 'utf8');
  const scripts = parseScripts(html);
  const page = scripts.find((entry) => entry.page);
  if (!page) {
    throw new Error(`missing page script in dist/${htmlPath}`);
  }
  const jsPath = path.join(distDir, page.src.slice(1));
  return await fs.readFile(jsPath, 'utf8');
}

async function listComponentAssets(distDir) {
  const assetsDir = path.join(distDir, 'assets');
  const entries = await fs.readdir(assetsDir);
  return entries
    .filter((name) => /^components_[A-Za-z0-9_]+\.[a-f0-9]{8}\.js$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function hasInlinedComponentScope(pageJs, componentName) {
  return new RegExp(`[A-Za-z0-9_]*components_${componentName}_zen_script0_[a-f0-9]+`).test(pageJs);
}

async function writeComponent(root, name, source) {
  const componentDir = path.join(root, 'components');
  await fs.mkdir(componentDir, { recursive: true });
  const abs = path.join(componentDir, `${name}.zen`);
  await fs.writeFile(abs, source, 'utf8');
  return abs;
}

describe('Phase 13: component script hoisting', () => {
  test('build inlines imported component scripts into the deterministic page bundle', async () => {
    const root = await createTempProject('zenith-phase13');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main>
  <Card />
</main>`
      }
    });
    const cardPath = await writeComponent(root, 'Card', `<script lang="ts">
const count = signal(0)
function inc() {
  count.set(count.get() + 1)
}
</script>
<button on:click={inc}>{count}</button>
`);

    assertSuccess(npmInstall(root), 'npm install');

    const compilerResult = runCompilerBinary(cardPath);
    assertSuccess(compilerResult, 'component compiler');
    const componentIr = JSON.parse(compilerResult.stdout);
    expect(componentIr.diagnostics).toEqual([]);
    expect(componentIr.warnings).toEqual([]);
    expect(componentIr.html.includes('<script')).toBe(false);

    assertSuccess(runCli(root, ['build']), 'zenith build');
    const distDir = path.join(root, 'dist');

    const pageJs = await readPageBundle(distDir);
    expect((pageJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect(pageJs).toMatch(/const __zenith_component_bootstraps\s*=\s*\[\s*\]/);
    expect(pageJs).toMatch(/const __zenith_components\s*=\s*\[\s*\]/);
    expect(hasInlinedComponentScope(pageJs, 'Card')).toBe(true);
    expect(pageJs.includes('signal(0)')).toBe(true);
    expect(pageJs.includes('@zenithbuild/')).toBe(false);

    const componentAssets = await listComponentAssets(distDir);
    expect(componentAssets).toHaveLength(0);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('component module emission is deterministic across repeated builds', async () => {
    const root = await createTempProject('zenith-phase13-det');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main>
  <Card />
</main>`
      }
    });
    await writeComponent(root, 'Card', `<script lang="ts">
const count = signal(0)
function inc() { count.set(count.get() + 1) }
</script>
<button on:click={inc}>{count}</button>
`);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const firstHashes = await hashTree(path.join(root, 'dist'));

    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const secondHashes = await hashTree(path.join(root, 'dist'));

    expect(secondHashes).toEqual(firstHashes);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('identical component scripts across pages stay inlined without runtime component assets', async () => {
    const root = await createTempProject('zenith-phase13-dedupe');

    const sameComponent = `<script lang="ts">
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<button on:click={inc}>{count}</button>`;

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
import CardA from '../components/CardA.zen'
</script>
<main><CardA /></main>`,
        'about.zen': `<script lang="ts">
import CardB from '../components/CardB.zen'
</script>
<main><CardB /></main>`
      }
    });
    await writeComponent(root, 'CardA', sameComponent);
    await writeComponent(root, 'CardB', sameComponent);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const distDir = path.join(root, 'dist');
    const componentAssets = await listComponentAssets(distDir);
    expect(componentAssets).toHaveLength(0);

    const indexJs = await readPageBundle(distDir, 'index.html');
    const aboutJs = await readPageBundle(distDir, 'about/index.html');
    expect(hasInlinedComponentScope(indexJs, 'CardA')).toBe(true);
    expect(hasInlinedComponentScope(aboutJs, 'CardB')).toBe(true);
    expect(indexJs).toMatch(/const __zenith_components\s*=\s*\[\s*\]/);
    expect(aboutJs).toMatch(/const __zenith_components\s*=\s*\[\s*\]/);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('props table emission is deterministic across repeated builds', async () => {
    const root = await createTempProject('zenith-phase13-props-det');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
  import Card from '../components/Card.zen'
  const count = signal(0)
</script>
<main>
  <Card label="Clicks" count={count} />
</main>`
      }
    });
    await writeComponent(root, 'Card', `<script lang="ts">
interface CardProps {
  label?: string
  count?: unknown
}
const incoming = props as CardProps
const label = incoming.label
const count = incoming.count
</script>
<article>
  <p>{label}</p>
  <p>{count}</p>
</article>
`);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const first = await hashTree(path.join(root, 'dist'));
    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const second = await hashTree(path.join(root, 'dist'));
    expect(second).toEqual(first);

    const pageJs = await readPageBundle(path.join(root, 'dist'));
    const propsPrelude = pageJs.match(/var\s+props\s*=\s*\{[^}]*label:\s*['"]Clicks['"][^}]*count:\s*[^,}]+[^}]*\};/);
    expect(propsPrelude).not.toBeNull();
    expect(propsPrelude[0].includes('count: count')).toBe(false);
    expect(hasInlinedComponentScope(pageJs, 'Card')).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('signal props propagate updates through hydrated component bindings', async () => {
    const root = await createTempProject('zenith-phase13-props-live');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
  import Card from '../components/Card.zen'
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <Card label="Clicks" count={count} />
  <button id="inc" on:click={inc}>+</button>
</main>`
      }
    });
    await writeComponent(root, 'Card', `<script lang="ts">
interface CardProps {
  label?: string
  count?: unknown
}
const incoming = props as CardProps
const label = incoming.label
const count = incoming.count
</script>
<article>
  <p id="label">{label}</p>
  <p id="value">{count}</p>
</article>
`);

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const port = await getFreePort();
    const preview = startProcess('npm', ['run', 'preview', '--silent', '--', String(port)], { cwd: root });
    const browser = await chromium.launch({ headless: true });
    try {
      await waitForHttp(`http://localhost:${port}/`, { expectStatuses: [200], timeoutMs: 45000 });
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });

      await page.click('#inc');
      await page.click('#inc');
      await page.click('#inc');
      await page.waitForTimeout(200);

      const value = await page.textContent('#value');
      const label = await page.textContent('#label');
      expect((label || '').trim()).toBe('Clicks');
      expect((value || '').trim()).toBe('3');
    } finally {
      await browser.close();
      await preview.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
