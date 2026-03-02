// PHASE 3 — Bundler output validation.
// Contract: emitted HTML/JS/assets are internally consistent with no orphans,
// and expression markers align with expression table shape.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect } from '@jest/globals';
import { createTempProject } from './helpers/project.js';
import { bundlerBin, hasExecutable } from './helpers/paths.js';
import { pipeCompilerToBundler } from './helpers/pipeline.js';
import { walkFilesDeterministic } from './helpers/fs.js';

const bundlerReady = hasExecutable(bundlerBin);

function extractRefs(html) {
  const refs = new Set();
  const regex = /(?:src|href)=['\"]([^'\"]+)['\"]/g;
  let m = regex.exec(html);
  while (m) {
    refs.add(m[1]);
    m = regex.exec(html);
  }
  return refs;
}

function extractMarkerIndices(html) {
  const indices = [];
  const regex = /data-zx-(?:e|on-[a-zA-Z0-9_-]+)=['\"]([^'\"]+)['\"]/g;
  let m = regex.exec(html);
  while (m) {
    const values = m[1].split(/\s+/).filter(Boolean);
    for (const value of values) {
      const n = Number(value);
      if (!Number.isNaN(n)) {
        indices.push(n);
      }
    }
    m = regex.exec(html);
  }
  return indices;
}

function extractExpressionTableCount(jsSource) {
  const decl = jsSource.match(/const\s+__zenith_expr\s*=\s*(\[[\s\S]*?\]);/);
  if (!decl) {
    return 0;
  }

  const arr = decl[1];
  const quoted = [...arr.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)];
  return quoted.length;
}

async function resolvePageExpressionCount(outDir, jsRefs) {
  for (const ref of jsRefs) {
    const source = await fsp.readFile(path.join(outDir, ref), 'utf8');
    const count = extractExpressionTableCount(source);
    if (count > 0 || source.includes('const __zenith_expr = []')) {
      return count;
    }
  }
  return 0;
}

async function buildOutDir() {
  const root = await createTempProject('zenith-phase3');
  const entry = path.join(root, 'index.zen');
  const outDir = path.join(root, 'dist');
  await fsp.writeFile(entry, '<div><h1>{title}</h1><button on:click={save}>Save</button></div>', 'utf8');
  const result = await pipeCompilerToBundler(entry, outDir);
  if (result.bundler.exitCode !== 0) {
    throw new Error(`Bundler failed:\n${result.bundler.stderr}`);
  }
  return { root, outDir };
}

describe('Phase 3: bundler output contract', () => {
  test('bundler binary exists for output validation', () => {
    expect(bundlerReady).toBe(true);
  });

  const outputTest = bundlerReady ? test : test.skip;

  outputTest('HTML/JS/assets references resolve and no orphan JS is emitted', async () => {
    const { root, outDir } = await buildOutDir();

    const files = await walkFilesDeterministic(outDir);
    const htmlFiles = files.filter((f) => f.endsWith('.html'));
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    expect(htmlFiles.length).toBeGreaterThan(0);

    const referencedJs = new Set();
    for (const rel of htmlFiles) {
      const abs = path.join(outDir, rel);
      const html = await fsp.readFile(abs, 'utf8');
      const refs = extractRefs(html);

      for (const ref of refs) {
        if (!ref.startsWith('/')) {
          continue;
        }
        const refRel = ref.slice(1);
        const target = path.join(outDir, refRel);
        expect(fs.existsSync(target)).toBe(true);
        if (refRel.endsWith('.js')) {
          referencedJs.add(refRel.replaceAll('\\', '/'));
        }
      }
    }

    for (const js of jsFiles) {
      expect(referencedJs.has(js)).toBe(true);
    }

    await fsp.rm(root, { recursive: true, force: true });
  });

  outputTest('HTML expression markers match JS expression table count exactly', async () => {
    const { root, outDir } = await buildOutDir();

    const files = await walkFilesDeterministic(outDir);
    const htmlFiles = files.filter((f) => f.endsWith('.html'));

    for (const rel of htmlFiles) {
      const html = await fsp.readFile(path.join(outDir, rel), 'utf8');
      const refs = extractRefs(html);
      const markerIndices = extractMarkerIndices(html);

      const jsRefs = [...refs]
        .filter((ref) => ref.startsWith('/') && ref.endsWith('.js'))
        .map((ref) => ref.slice(1));

      if (jsRefs.length === 0) {
        expect(markerIndices.length).toBe(0);
        continue;
      }

      const exprCount = await resolvePageExpressionCount(outDir, jsRefs);

      expect(markerIndices.length).toBe(exprCount);
      for (const index of markerIndices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(exprCount);
      }
    }

    await fsp.rm(root, { recursive: true, force: true });
  });
});
