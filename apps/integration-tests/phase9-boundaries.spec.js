// PHASE 9 — Cross-layer boundary enforcement scans.
// Contract: packages remain within sealed responsibilities.

import { describe, test, expect } from '@jest/globals';
import {
  bundlerRustSrcDir,
  compilerRustSrcDir,
  coreSrcDir,
  routerSrcDir,
  runtimeSrcDir
} from './helpers/paths.js';
import { scanSources } from './helpers/source-scan.js';

describe('Phase 9: cross-layer boundaries', () => {
  test('compiler Rust sources have no JS-layer coupling', async () => {
    const hits = await scanSources(compilerRustSrcDir, [
      /@zenithbuild\//,
      /process\.env/
    ], ['.rs']);

    expect(hits).toEqual([]);
  });

  test('bundler Rust sources do not directly couple runtime/router JS packages', async () => {
    const hits = await scanSources(bundlerRustSrcDir, [
      /@zenithbuild\/runtime/,
      /@zenithbuild\/router/
    ], ['.rs']);

    expect(hits).toEqual([]);
  });

  test('core has no cross-layer @zenithbuild imports', async () => {
    const hits = await scanSources(coreSrcDir, [/@zenithbuild\//], ['.js']);
    expect(hits).toEqual([]);
  });

  test('router has no auto-global exposure assignments', async () => {
    const hits = await scanSources(routerSrcDir, [
      /\b(?:window|globalThis)\.[A-Za-z_$][\w$]*\s*=/
    ], ['.js', '.ts']);

    expect(hits).toEqual([]);
  });

  test('runtime has no scope-global lookup primitives', async () => {
    const hits = await scanSources(runtimeSrcDir, [
      /eval\(/,
      /new\s+Function\s*\(/,
      /\bwith\s*\(/,
      /\bwindow\./,
      /\bglobalThis\./
    ], ['.js']);

    expect(hits).toEqual([]);
  });
});
