// PHASE 4 — Runtime validation on emitted JS.
// Contract: runtime JS executes without syntax/runtime declaration errors,
// avoids forbidden primitives, and does not pollute globals.

import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, test, expect } from '@jest/globals';
import { createTempProject } from './helpers/project.js';
import { bundlerBin, hasExecutable } from './helpers/paths.js';
import { pipeCompilerToBundler } from './helpers/pipeline.js';
import { walkFilesDeterministic } from './helpers/fs.js';
import { stripCommentsAndStrings } from './helpers/source-scan.js';

const bundlerReady = hasExecutable(bundlerBin);

const FORBIDDEN_PATTERNS = [
  /eval\(/,
  /new\s+Function\s*\(/,
  /window\.__global/i,
  /process\.env/,
  /Date\s*\(/,
  /Math\.random\s*\(/,
  /crypto\.randomUUID\s*\(/
];

async function buildOutDir() {
  const root = await createTempProject('zenith-phase4');
  const entry = path.join(root, 'index.zen');
  const outDir = path.join(root, 'dist');
  await fsp.writeFile(entry, '<div><h1>{title}</h1><button on:click={save}>Save</button></div>', 'utf8');
  const result = await pipeCompilerToBundler(entry, outDir);
  if (result.bundler.exitCode !== 0) {
    throw new Error(`Bundler failed:\n${result.bundler.stderr}`);
  }
  return { root, outDir };
}

function extractFirstModuleScript(html) {
  const m = html.match(/<script[^>]*src=['\"]([^'\"]+\.js)['\"][^>]*>/i);
  return m ? m[1] : null;
}

describe('Phase 4: runtime output safety', () => {
  test('bundler binary exists for runtime validation', () => {
    expect(bundlerReady).toBe(true);
  });

  const runtimeTest = bundlerReady ? test : test.skip;

  runtimeTest('emitted runtime JS has no forbidden primitives', async () => {
    const { root, outDir } = await buildOutDir();
    const files = await walkFilesDeterministic(outDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    expect(jsFiles.length).toBeGreaterThan(0);

    for (const rel of jsFiles) {
      const source = await fsp.readFile(path.join(outDir, rel), 'utf8');
      const stripped = stripCommentsAndStrings(source);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(stripped)).toBe(false);
      }
    }

    await fsp.rm(root, { recursive: true, force: true });
  });

  runtimeTest('runtime JS executes in JSDOM context with no global pollution', async () => {
    const { root, outDir } = await buildOutDir();

    const htmlPath = path.join(outDir, 'index.html');
    const html = await fsp.readFile(htmlPath, 'utf8');
    const scriptRef = extractFirstModuleScript(html);
    expect(scriptRef).toBeTruthy();

    const jsPath = path.join(outDir, scriptRef.slice(1));
    const jsSource = await fsp.readFile(jsPath, 'utf8');

    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      runScripts: 'outside-only'
    });

    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      console,
      globalThis: dom.window
    });

    const beforeKeys = new Set(Object.keys(dom.window));

    const module = new vm.SourceTextModule(jsSource, {
      context,
      identifier: jsPath
    });

    await module.link(async () => {
      // Provide a deterministic stub for runtime module imports in this VM check.
      return new vm.SourceTextModule(
        [
          'export function hydrate() {}',
          'export function signal(v) { return { get: () => v, set() {} }; }',
          'export function state(v) { return v; }',
          'export function zeneffect() {}'
        ].join('\n'),
        { context }
      );
    });

    await expect(module.evaluate()).resolves.toBeUndefined();

    const afterKeys = Object.keys(dom.window);
    const allowedNew = [/^__zenith/i];
    const leaked = afterKeys.filter(
      (key) =>
        !beforeKeys.has(key) &&
        !allowedNew.some((pattern) => pattern.test(key))
    );

    expect(leaked).toEqual([]);

    await fsp.rm(root, { recursive: true, force: true });
  });
});
