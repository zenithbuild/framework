// PHASE 2 — Compiler -> Bundler process seam.
// Contract: compiler IR is passed to bundler via the sealed envelope over stdin,
// bundler exits cleanly, and emitted files are deterministic across repeated runs.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect } from '@jest/globals';
import { createTempProject } from './helpers/project.js';
import { bundlerBin, hasExecutable } from './helpers/paths.js';
import { pipeCompilerToBundler } from './helpers/pipeline.js';
import { diffHashPairs, hashTree } from './helpers/fs.js';

const bundlerReady = hasExecutable(bundlerBin);

async function makeEntry() {
  const root = await createTempProject('zenith-phase2');
  const entry = path.join(root, 'index.zen');
  await fsp.writeFile(entry, '<div><h1>{title}</h1></div>', 'utf8');
  return { root, entry };
}

describe('Phase 2: compiler -> bundler process seam', () => {
  test('bundler binary exists for process-boundary validation', () => {
    expect(bundlerReady).toBe(true);
  });

  const processTest = bundlerReady ? test : test.skip;

  processTest('compiler IR envelope can be piped into bundler stdin', async () => {
    const { root, entry } = await makeEntry();
    const outDir = path.join(root, 'dist-a');

    const result = await pipeCompilerToBundler(entry, outDir);

    expect(result.compiler.exitCode).toBe(0);
    expect((result.compiler.stderr || '').trim()).toBe('');
    expect(result.envelope).toBeTruthy();
    expect(result.envelope.route).toBe('/');
    expect(result.envelope.file).toBe(entry);
    expect(result.envelope.router).toBe(false);

    expect(result.bundler.exitCode).toBe(0);
    expect(result.outDirExists).toBe(true);

    await fsp.rm(root, { recursive: true, force: true });
  });

  processTest('bundler output is deterministic across two runs (SHA-256 exact)', async () => {
    const { root, entry } = await makeEntry();
    const outA = path.join(root, 'dist-a');
    const outB = path.join(root, 'dist-b');

    const runA = await pipeCompilerToBundler(entry, outA);
    const runB = await pipeCompilerToBundler(entry, outB);

    expect(runA.compiler.exitCode).toBe(0);
    expect(runA.bundler.exitCode).toBe(0);
    expect(runB.compiler.exitCode).toBe(0);
    expect(runB.bundler.exitCode).toBe(0);

    const aPairs = await hashTree(outA);
    const bPairs = await hashTree(outB);

    expect(aPairs.length).toBeGreaterThan(0);
    expect(aPairs.length).toBe(bPairs.length);

    const diffs = diffHashPairs(aPairs, bPairs);
    expect(diffs).toEqual([]);

    await fsp.rm(root, { recursive: true, force: true });
  });

  processTest('bundler rejects payload when graph_hash is corrupted', async () => {
    const { root, entry } = await makeEntry();
    const outDir = path.join(root, 'dist-corrupt');
    const result = await pipeCompilerToBundler(entry, outDir, {
      envelopeMutator(envelope) {
        return {
          ...envelope,
          ir: {
            ...envelope.ir,
            graph_hash: `corrupt-${envelope.ir.graph_hash}`
          }
        };
      }
    });

    expect(result.compiler.exitCode).toBe(0);
    expect(result.bundler.exitCode).not.toBe(0);
    expect(result.bundler.stderr).toContain('graph_hash mismatch');

    await fsp.rm(root, { recursive: true, force: true });
  });
});
