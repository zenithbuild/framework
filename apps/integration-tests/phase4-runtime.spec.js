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

function extractRuntimeImportNames(jsSource) {
  const match = jsSource.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/runtime\.[^'"]+\.js['"]/);
  if (!match) {
    return [];
  }
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+as\s+/)[0].trim());
}

function createRuntimeStubSource(importNames) {
  const uniqueNames = [...new Set(importNames)];
  return uniqueNames.map((name) => {
    switch (name) {
      case 'hydrate':
        return 'export function hydrate() {}';
      case 'signal':
        return 'export function signal(value) { return { get: () => value, set() {}, subscribe() { return () => {}; } }; }';
      case 'state':
        return 'export function state(value) { return value; }';
      case 'ref':
        return 'export function ref(value = null) { return { current: value }; }';
      case 'zeneffect':
      case 'zenEffect':
      case 'zenMount':
      case 'zenOn':
      case 'zenResize':
        return `export function ${name}() { return () => {}; }`;
      case 'zenWindow':
        return 'export function zenWindow() { return globalThis.window ?? null; }';
      case 'zenDocument':
        return 'export function zenDocument() { return globalThis.document ?? null; }';
      case 'collectRefs':
        return 'export function collectRefs(...refs) { return refs.map((ref) => ref?.current ?? ref).filter(Boolean); }';
      default:
        return `export const ${name} = undefined;`;
    }
  }).join('\n');
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
    const runtimeImportNames = extractRuntimeImportNames(jsSource);

    const module = new vm.SourceTextModule(jsSource, {
      context,
      identifier: jsPath
    });

    await module.link(async () => {
      // Provide a deterministic stub for runtime module imports in this VM check.
      return new vm.SourceTextModule(
        createRuntimeStubSource(runtimeImportNames),
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
