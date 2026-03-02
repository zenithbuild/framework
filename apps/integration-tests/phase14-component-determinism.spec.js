// PHASE 14 — Component hoist determinism and process seam hardening.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, runCommandSync } from './helpers/process.js';
import { runCompilerBinary } from './helpers/pipeline.js';
import { hashTree } from './helpers/fs.js';
import { runProcessSeam } from './helpers/process-seam.mjs';
import { repoRoot } from './helpers/paths.js';

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

async function readPageBundle(distDir, htmlPath) {
  const html = await fs.readFile(path.join(distDir, htmlPath), 'utf8');
  const pageScript = parseScripts(html).find((entry) => entry.page);
  if (!pageScript) {
    throw new Error(`missing page script in ${htmlPath}`);
  }
  const jsPath = path.join(distDir, pageScript.src.slice(1));
  return await fs.readFile(jsPath, 'utf8');
}

describe('Phase 14: component determinism lock', () => {
  test('same component source yields stable hoist_id and deduped component module across pages', async () => {
    const root = await createTempProject('zenith-phase14');

    const buttonBlock = `<Card>
  <script>
    const count = signal(0)
    function inc() { count.set(count.get() + 1) }
  </script>
  <button on:click={inc}>{count}</button>
</Card>`;

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<main>${buttonBlock}</main>`,
        'about.zen': `<main>${buttonBlock}</main>`
      }
    });

    assertSuccess(npmInstall(root), 'npm install');

    const indexIr = JSON.parse(runCompilerBinary(path.join(root, 'pages', 'index.zen')).stdout);
    const aboutIr = JSON.parse(runCompilerBinary(path.join(root, 'pages', 'about.zen')).stdout);

    const indexHoist = Object.keys(indexIr.components_scripts).sort();
    const aboutHoist = Object.keys(aboutIr.components_scripts).sort();
    expect(indexHoist.length).toBe(1);
    expect(indexHoist).toEqual(aboutHoist);

    const distDir = path.join(root, 'dist');
    const seamIndex = await runProcessSeam({
      entry: path.join(root, 'pages', 'index.zen'),
      outDir: distDir,
      route: '/',
      router: false
    });
    expect(seamIndex.compiler.status).toBe(0);
    expect(seamIndex.bundler.status).toBe(0);

    const seamAbout = await runProcessSeam({
      entry: path.join(root, 'pages', 'about.zen'),
      outDir: distDir,
      route: '/about',
      router: false
    });
    expect(seamAbout.compiler.status).toBe(0);
    expect(seamAbout.bundler.status).toBe(0);

    const assets = await fs.readdir(path.join(distDir, 'assets'));
    const componentAssets = assets.filter((name) => /^component\.[a-zA-Z0-9_-]+\.[a-f0-9]{8}\.js$/.test(name));
    expect(componentAssets.length).toBe(1);

    const pageIndexJs = await readPageBundle(distDir, 'index.html');
    const pageAboutJs = await readPageBundle(distDir, 'about/index.html');
    expect((pageIndexJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect((pageAboutJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);

    const indexComponents = (pageIndexJs.match(/instance:/g) || []).length;
    const aboutComponents = (pageAboutJs.match(/instance:/g) || []).length;
    expect(indexComponents).toBe(indexIr.component_instances.length);
    expect(aboutComponents).toBe(aboutIr.component_instances.length);

    const hashA = await hashTree(distDir);
    const seamRepeatIndex = await runProcessSeam({
      entry: path.join(root, 'pages', 'index.zen'),
      outDir: distDir,
      route: '/',
      router: false
    });
    expect(seamRepeatIndex.bundler.status).toBe(0);
    const seamRepeatAbout = await runProcessSeam({
      entry: path.join(root, 'pages', 'about.zen'),
      outDir: distDir,
      route: '/about',
      router: false
    });
    expect(seamRepeatAbout.bundler.status).toBe(0);
    const hashB = await hashTree(distDir);
    expect(hashB).toEqual(hashA);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('process-seam helper script executes compiler->bundler pipeline and reports deterministic artifact list', async () => {
    const root = await createTempProject('zenith-phase14-seam');
    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': '<main><Card><script>const count = signal(0)</script><p>{count}</p></Card></main>'
      }
    });
    assertSuccess(npmInstall(root), 'npm install');

    const outDir = path.join(root, 'dist');
    const script = path.join(repoRoot, 'integration-tests', 'helpers', 'process-seam.mjs');
    const run = runCommandSync('node', [
      script,
      '--entry',
      path.join(root, 'pages', 'index.zen'),
      '--out-dir',
      outDir,
      '--route',
      '/',
      '--router',
      'false'
    ]);
    assertSuccess(run, 'process-seam');

    const payload = JSON.parse(run.stdout.trim());
    expect(payload.compiler.status).toBe(0);
    expect(payload.bundler.status).toBe(0);
    expect(Array.isArray(payload.files)).toBe(true);
    expect(payload.files.length).toBeGreaterThan(0);

    await fs.rm(root, { recursive: true, force: true });
  });
});
