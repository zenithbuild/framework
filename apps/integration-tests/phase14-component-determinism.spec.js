// PHASE 14 — Component hoist determinism and process seam hardening.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
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

async function readPageBundle(distDir, htmlPath) {
  const html = await fs.readFile(path.join(distDir, htmlPath), 'utf8');
  const pageScript = parseScripts(html).find((entry) => entry.page);
  if (!pageScript) {
    throw new Error(`missing page script in ${htmlPath}`);
  }
  const jsPath = path.join(distDir, pageScript.src.slice(1));
  return await fs.readFile(jsPath, 'utf8');
}

async function writeComponent(root, name, source) {
  const componentDir = path.join(root, 'components');
  await fs.mkdir(componentDir, { recursive: true });
  const abs = path.join(componentDir, `${name}.zen`);
  await fs.writeFile(abs, source, 'utf8');
  return abs;
}

async function listComponentAssets(distDir) {
  const assetsDir = path.join(distDir, 'assets');
  const entries = await fs.readdir(assetsDir);
  return entries
    .filter((name) => /^components_[A-Za-z0-9_]+\.[a-f0-9]{8}\.js$/.test(name))
    .sort((a, b) => a.localeCompare(b));
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

describe('Phase 14: component determinism lock', () => {
  test('same imported component source yields one stable inlined scope across pages', async () => {
    const root = await createTempProject('zenith-phase14');
    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main><Card /></main>`,
        'about.zen': `<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main><Card /></main>`
      }
    });
    await writeComponent(root, 'Card', `<script lang="ts">
const count = signal(0)
function inc() { count.set(count.get() + 1) }
</script>
<button on:click={inc}>{count}</button>
`);

    assertSuccess(npmInstall(root), 'npm install');
    const distDir = path.join(root, 'dist');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    const componentAssets = await listComponentAssets(distDir);
    expect(componentAssets).toHaveLength(0);

    const pageIndexJs = await readPageBundle(distDir, 'index.html');
    const pageAboutJs = await readPageBundle(distDir, 'about/index.html');
    expect((pageIndexJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect((pageAboutJs.match(/hydrate\s*\(\s*\{/g) || []).length).toBe(1);
    expect(/(?:const|let|var)\s+__zenith_component_bootstraps\s*=\s*\[\s*\]\s*;/.test(pageIndexJs)).toBe(true);
    expect(/(?:const|let|var)\s+__zenith_component_bootstraps\s*=\s*\[\s*\]\s*;/.test(pageAboutJs)).toBe(true);
    expect(/(?:const|let|var)\s+__zenith_components\s*=\s*\[\s*\]\s*;/.test(pageIndexJs)).toBe(true);
    expect(/(?:const|let|var)\s+__zenith_components\s*=\s*\[\s*\]\s*;/.test(pageAboutJs)).toBe(true);

    const indexScope = extractComponentScope(pageIndexJs, 'Card');
    const aboutScope = extractComponentScope(pageAboutJs, 'Card');
    expect(aboutScope).toBe(indexScope);
    expect(extractScopedLines(pageIndexJs, indexScope)).toEqual(extractScopedLines(pageAboutJs, aboutScope));

    const hashA = await hashTree(distDir);
    assertSuccess(runCli(root, ['build']), 'build pass #2');
    const hashB = await hashTree(distDir);
    expect(hashB).toEqual(hashA);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('page whitespace edits do not perturb the inlined component scope', async () => {
    const root = await createTempProject('zenith-phase14-asset');
    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': `<script lang="ts">
import Card from '../components/Card.zen'
</script>
<main><Card /></main>`
      }
    });
    await writeComponent(root, 'Card', `<script lang="ts">
const count = signal(0)
</script>
<p>{count}</p>
`);
    assertSuccess(npmInstall(root), 'npm install');
    const outDir = path.join(root, 'dist');
    assertSuccess(runCli(root, ['build']), 'build pass #1');
    expect(await listComponentAssets(outDir)).toHaveLength(0);
    const firstPageJs = await readPageBundle(outDir, 'index.html');
    const firstScope = extractComponentScope(firstPageJs, 'Card');
    const firstScopedLines = extractScopedLines(firstPageJs, firstScope);

    await fs.writeFile(
      path.join(root, 'pages', 'index.zen'),
      `<script lang="ts">
import Card from '../components/Card.zen'
</script>

<main>
  <Card />
</main>
`,
      'utf8'
    );

    assertSuccess(runCli(root, ['build']), 'build pass #2');
    expect(await listComponentAssets(outDir)).toHaveLength(0);
    const secondPageJs = await readPageBundle(outDir, 'index.html');
    const secondScope = extractComponentScope(secondPageJs, 'Card');
    expect(secondScope).toBe(firstScope);
    expect(extractScopedLines(secondPageJs, secondScope)).toEqual(firstScopedLines);

    await fs.rm(root, { recursive: true, force: true });
  });
});
