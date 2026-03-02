// PHASE 11 — Script boundary enforcement (Zenith V0).
// Contract source: zenith-bundler/SCRIPT_BOUNDARY_CONTRACT.md
// This suite validates bundler-owned script emission and emitted JS purity.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess } from './helpers/process.js';
import { walkFilesDeterministic } from './helpers/fs.js';
import { stripCommentsAndStrings } from './helpers/source-scan.js';

jest.setTimeout(180000);

const FORBIDDEN_JS_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\.env\b/,
  /\bDate\s*\(/,
  /\bMath\.random\s*\(/,
  /\bcrypto\.randomUUID\s*\(/,
  /\b(?:window|globalThis)\.[A-Za-z_$][\w$]*\s*=/
];

function extractScripts(html) {
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match = regex.exec(html);
  while (match) {
    const attrs = match[1] || '';
    scripts.push({
      index: match.index,
      attrs,
      body: match[2] || '',
      type: /\btype\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1] || null,
      src: /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1] || null,
      isRuntime: /\bdata-zx-runtime\b/.test(attrs),
      isPage: /\bdata-zx-page\b/.test(attrs),
      isRouter: /\bdata-zx-router\b/.test(attrs)
    });
    match = regex.exec(html);
  }
  return scripts;
}

function markerCount(html) {
  const regex = /data-zx-(?:e|on-[a-zA-Z0-9_-]+)=['"]([^'"]+)['"]/g;
  let total = 0;
  let m = regex.exec(html);
  while (m) {
    total += m[1].split(/\s+/).filter(Boolean).length;
    m = regex.exec(html);
  }
  return total;
}

function expressionCount(jsSource) {
  const decl = jsSource.match(/const\s+__zenith_expr\s*=\s*(\[[\s\S]*?\]);/);
  if (!decl) return 0;
  const quoted = [...decl[1].matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)];
  return quoted.length;
}

async function buildFixture(options) {
  const root = await createTempProject('zenith-phase11');

  await scaffoldZenithProject(root, {
    router: options.router,
    pages: {
      'index.zen': '<main><h1>{title}</h1><button on:click={save}>Save</button></main>',
      'about.zen': '<main><h1>About Static</h1></main>'
    }
  });

  assertSuccess(npmInstall(root), 'npm install');
  assertSuccess(runCli(root, ['build']), 'zenith build');

  return { root, dist: path.join(root, 'dist') };
}

describe('Phase 11: script boundary lock', () => {
  test('router=false: reactive page gets runtime+page scripts, static page gets none', async () => {
    const { root, dist } = await buildFixture({ router: false });

    const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    const aboutHtml = await fs.readFile(path.join(dist, 'about', 'index.html'), 'utf8');

    const indexScripts = extractScripts(indexHtml);
    const aboutScripts = extractScripts(aboutHtml);

    expect(indexScripts.length).toBe(2);
    expect(indexScripts.filter((s) => s.isRuntime).length).toBe(1);
    expect(indexScripts.filter((s) => s.isPage).length).toBe(1);
    expect(indexScripts.filter((s) => s.isRouter).length).toBe(0);

    expect(aboutScripts.length).toBe(0);

    await fs.rm(root, { recursive: true, force: true });
  });

  test('router=true: router script injected once per page and no inline scripts', async () => {
    const { root, dist } = await buildFixture({ router: true });

    const htmlFiles = ['index.html', 'about/index.html'];
    for (const rel of htmlFiles) {
      const html = await fs.readFile(path.join(dist, rel), 'utf8');
      const scripts = extractScripts(html);
      const bodyEnd = html.lastIndexOf('</body>');

      for (const script of scripts) {
        expect(script.type).toBe('module');
        expect(script.src).toMatch(/^\/assets\/[A-Za-z0-9._-]+\.js$/);
        expect(script.body.trim()).toBe('');
        expect(script.index).toBeLessThan(bodyEnd);
      }

      const srcs = scripts.map((s) => s.src);
      expect(new Set(srcs).size).toBe(srcs.length);

      // Router script must be present exactly once when router=true.
      expect(scripts.filter((s) => s.isRouter).length).toBe(1);

      if (rel === 'index.html') {
        // Reactive page: runtime + page + router.
        expect(scripts.length).toBe(3);
        expect(scripts.filter((s) => s.isRuntime).length).toBe(1);
        expect(scripts.filter((s) => s.isPage).length).toBe(1);
      } else {
        // Static page: router only.
        expect(scripts.length).toBe(1);
      }
    }

    await fs.rm(root, { recursive: true, force: true });
  });

  test('emitted JS is self-contained ESM with deterministic bootstrap and no forbidden tokens', async () => {
    const { root, dist } = await buildFixture({ router: true });

    const files = await walkFilesDeterministic(dist);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const rel of jsFiles) {
      const source = await fs.readFile(path.join(dist, rel), 'utf8');
      const stripped = stripCommentsAndStrings(source);

      // No bare module specifiers in browser output.
      expect(/\bfrom\s+['"][@][^'"]+['"]/.test(stripped)).toBe(false);
      expect(/\bimport\s+['"][@][^'"]+['"]/.test(stripped)).toBe(false);

      for (const pattern of FORBIDDEN_JS_PATTERNS) {
        expect(pattern.test(stripped)).toBe(false);
      }
    }

    // Reactive page bootstrap contract checks.
    const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    const indexScripts = extractScripts(indexHtml);
    const pageScript = indexScripts.find((s) => s.isPage);

    expect(pageScript).toBeTruthy();
    const pageJs = await fs.readFile(path.join(dist, pageScript.src.slice(1)), 'utf8');

    expect(pageJs.includes('const __zenith_expr')).toBe(true);
    expect(pageJs.includes('const __zenith_events')).toBe(true);
    expect(pageJs.includes('const __zenith_markers')).toBe(true);
    expect(pageJs.includes('hydrate({')).toBe(true);

    const markerTotal = markerCount(indexHtml);
    const exprTotal = expressionCount(pageJs);
    expect(markerTotal).toBe(exprTotal);

    await fs.rm(root, { recursive: true, force: true });
  });
});
