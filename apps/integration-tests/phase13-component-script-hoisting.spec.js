// PHASE 13 — Component script hoisting + compile-time factory contract.
// Component scripts must compile into deterministic component modules.

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
    .filter((name) => /^component\.[a-zA-Z0-9_-]+\.[a-f0-9]{8}\.js$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

describe('Phase 13: component script hoisting', () => {
  test('compiler emits components_scripts and bundler emits deterministic component factory module', async () => {
    const root = await createTempProject('zenith-phase13');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<main>
  <Card>
    <script>
      const count = signal(0)
      function inc() {
        count.set(count.get() + 1)
      }
    </script>
    <button on:click={inc}>{count}</button>
  </Card>
</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');

    const compilerResult = runCompilerBinary(path.join(root, 'pages', 'index.zen'));
    assertSuccess(compilerResult, 'compiler');
    const ir = JSON.parse(compilerResult.stdout);
    expect(Object.keys(ir.components_scripts).length).toBeGreaterThan(0);
    expect(Array.isArray(ir.component_instances)).toBe(true);
    expect(ir.component_instances.length).toBeGreaterThan(0);

    assertSuccess(runCli(root, ['build']), 'zenith build');
    const distDir = path.join(root, 'dist');

    const pageJs = await readPageBundle(distDir);
    expect((pageJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect(pageJs.includes('const __zenith_components = [')).toBe(true);

    const componentAssets = await listComponentAssets(distDir);
    expect(componentAssets.length).toBeGreaterThan(0);

    const componentSource = await fs.readFile(path.join(distDir, 'assets', componentAssets[0]), 'utf8');
    expect(componentSource.includes('export function createComponent_')).toBe(true);
    expect(componentSource.includes('bindings: Object.freeze({')).toBe(true);

    expect(componentSource.includes('__component_instance')).toBe(false);
    expect(componentSource.includes('mountComponent(')).toBe(false);
    expect(componentSource.includes('onMount(')).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('component module emission is deterministic across repeated builds', async () => {
    const root = await createTempProject('zenith-phase13-det');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<main>
  <Card>
    <script>
      const count = signal(0)
      function inc() { count.set(count.get() + 1) }
    </script>
    <button on:click={inc}>{count}</button>
  </Card>
</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const firstHashes = await hashTree(path.join(root, 'dist'));

    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const secondHashes = await hashTree(path.join(root, 'dist'));

    expect(secondHashes).toEqual(firstHashes);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('identical component scripts across pages are deduped into one component asset', async () => {
    const root = await createTempProject('zenith-phase13-dedupe');

    const sameScript = `<script>
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<button on:click={inc}>{count}</button>`;

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<main><Card>${sameScript}</Card></main>`,
        'about.zen': `<main><Card>${sameScript}</Card></main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'zenith build');

    const componentAssets = await listComponentAssets(path.join(root, 'dist'));
    expect(componentAssets.length).toBe(1);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('props table emission is deterministic across repeated builds', async () => {
    const root = await createTempProject('zenith-phase13-props-det');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script>
  const count = signal(0)
</script>
<main>
  <Card label="Clicks" count={count}>
    <script>
      const label = __props.label
      const count = __props.count
    </script>
    <p>{label}</p>
    <p>{count}</p>
  </Card>
</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const first = await hashTree(path.join(root, 'dist'));
    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const second = await hashTree(path.join(root, 'dist'));
    expect(second).toEqual(first);

    const pageJs = await readPageBundle(path.join(root, 'dist'));
    expect(pageJs).toMatch(
      /props:\[\{"name":"count","type":"signal","index":0\},\{"name":"label","type":"static","value":"Clicks"\}\]/
    );

    await fs.rm(root, { recursive: true, force: true });
  });

  test('signal props propagate updates through hydrated component bindings', async () => {
    const root = await createTempProject('zenith-phase13-props-live');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script>
  const count = signal(0)
  function inc() { count.set(count.get() + 1) }
</script>
<main>
  <Card label="Clicks" count={count}>
    <script>
      const label = __props.label
      const count = __props.count
    </script>
    <p id="label">{label}</p>
    <p id="value">{count}</p>
  </Card>
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
