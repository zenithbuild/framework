// PHASE 1 — CLI -> Compiler process seam validation.
// Contract: CLI invokes compiler binary, compiler emits strict JSON IR,
// and CLI passes IR to bundler without mutation.

import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { createTempProject } from './helpers/project.js';
import { bundlerBin, cliBuildModule, compilerBin, hasExecutable, repoRoot, toFileHref } from './helpers/paths.js';
import { validateCompilerIR } from './helpers/ir-schema.js';
import { runCompilerBinary } from './helpers/pipeline.js';

let tmpDirs = [];

beforeEach(() => {
  tmpDirs = [];
  jest.restoreAllMocks();
  jest.resetModules();
});

async function makePage(content = '<h1>{count}</h1>') {
  const root = await createTempProject('zenith-phase1');
  const pagesDir = path.join(root, 'pages');
  const outDir = path.join(root, 'dist');

  await fs.mkdir(pagesDir, { recursive: true });
  await fs.writeFile(path.join(pagesDir, 'index.zen'), content, 'utf8');

  tmpDirs.push(root);
  return { root, pagesDir, outDir };
}

// The mocked-spawn tests below never execute a toolchain binary, so they point
// the CLI at stub files through the env overrides instead of depending on a
// native build in packages/*/target/release.
async function withStubToolchain(run) {
  const stubDir = await createTempProject('zenith-phase1-stub-bin');
  tmpDirs.push(stubDir);
  const stubs = {
    compiler: path.join(stubDir, 'zenith-compiler'),
    bundler: path.join(stubDir, 'zenith-bundler')
  };
  for (const stub of Object.values(stubs)) {
    await fs.writeFile(stub, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  const previous = {
    compiler: process.env.ZENITH_COMPILER_BIN,
    bundler: process.env.ZENITH_BUNDLER_BIN
  };
  process.env.ZENITH_COMPILER_BIN = stubs.compiler;
  process.env.ZENITH_BUNDLER_BIN = stubs.bundler;
  try {
    return await run(stubs);
  } finally {
    for (const [tool, name] of [['compiler', 'ZENITH_COMPILER_BIN'], ['bundler', 'ZENITH_BUNDLER_BIN']]) {
      if (previous[tool] === undefined) delete process.env[name];
      else process.env[name] = previous[tool];
    }
  }
}

afterAll(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Phase 1: CLI -> compiler process seam', () => {
  test.each(['compiler', 'bundler'])('%s probe failures stop before compilation or IR forwarding', async (tool) => {
    const project = await makePage();
    await withStubToolchain(async (stubs) => {
      const failingBinary = stubs[tool];
      const spawnSyncMock = jest.fn((binary, args) => {
        if (args?.[0] !== '--version') throw new Error('compilation must not start');
        return binary === failingBinary
          ? { status: 1, stdout: '', stderr: 'probe deliberately rejected' }
          : { status: 0, stdout: 'zenith 0.8.0\n', stderr: '' };
      });
      const spawnMock = jest.fn();
      await jest.isolateModulesAsync(async () => {
        jest.unstable_mockModule('node:child_process', () => ({ spawnSync: spawnSyncMock, spawn: spawnMock }));
        const { build } = await import(toFileHref(cliBuildModule));
        await expect(build({ pagesDir: project.pagesDir, outDir: project.outDir }))
          .rejects.toThrow('probe deliberately rejected');
      });
      expect(spawnMock).not.toHaveBeenCalled();
      expect(spawnSyncMock.mock.calls.length).toBeGreaterThan(0);
      expect(spawnSyncMock.mock.calls.every(([, args]) => args[0] === '--version')).toBe(true);
      expect(spawnSyncMock.mock.calls.some(([binary]) => binary === failingBinary)).toBe(true);
    });
  });

  test('CLI bridge spawns compiler binary and forwards IR unchanged', () => withStubToolchain(async ({ compiler: compilerBin, bundler: bundlerBin }) => {
    const cliManifest = JSON.parse(
      await fs.readFile(path.join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8')
    );
    const fakeIR = {
      ir_version: 1,
      schemaVersion: 1,
      graph_hash: 'deadbeef',
      graph_edges: [],
      graph_nodes: [],
      html: '<h1 data-zx-e="0"></h1>',
      expressions: ['count'],
      signals: [],
      marker_bindings: [],
      event_bindings: [],
      expression_bindings: [],
      diagnostics: [],
      warnings: [],
      ref_bindings: [],
      style_blocks: [],
      nodes: [],
      hoisted: {
        imports: [],
        declarations: [],
        functions: [],
        signals: [],
        state: [],
        code: []
      }
    };

    const spawnSyncMock = jest.fn((spawnPath, spawnArgs) => {
      if (spawnArgs?.length === 1 && spawnArgs[0] === '--version') {
        return {
          status: 0,
          stdout: `${path.basename(spawnPath)} ${cliManifest.version}\n`,
          stderr: ''
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify(fakeIR),
        stderr: ''
      };
    });

    const spawnMock = jest.fn(() => {
      const child = new EventEmitter();
      const stdinChunks = [];
      child.stdin = {
        write: jest.fn((chunk) => {
          stdinChunks.push(chunk);
          return true;
        }),
        end: jest.fn(() => {
          child.emit('close', 0);
        })
      };
      child.__stdinChunks = stdinChunks;
      return child;
    });

    const project = await makePage();

    await jest.isolateModulesAsync(async () => {
      jest.unstable_mockModule('node:child_process', () => ({
        spawnSync: spawnSyncMock,
        spawn: spawnMock
      }));

      const { build } = await import(toFileHref(cliBuildModule));

      await build({
        pagesDir: project.pagesDir,
        outDir: project.outDir,
        config: { router: true }
      });
    });

    expect(spawnSyncMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const versionProbeCalls = spawnSyncMock.mock.calls.filter(([, spawnArgs]) => (
      spawnArgs?.length === 1 && spawnArgs[0] === '--version'
    ));
    expect(versionProbeCalls).toHaveLength(2);
    expect(versionProbeCalls.map(([binary]) => binary).sort()).toEqual([compilerBin, bundlerBin].sort());

    const compilerCalls = spawnSyncMock.mock.calls.filter(([spawnPath, spawnArgs]) => (
      spawnPath === compilerBin && spawnArgs?.[0] === '--stdin'
    ));
    expect(compilerCalls).toHaveLength(1);

    const [spawnPath, spawnArgs, spawnOpts] = compilerCalls[0];
    expect(spawnPath).toBe(compilerBin);
    expect(spawnArgs).toEqual([
      '--stdin',
      expect.stringMatching(/pages[\\/]index\.zen$/)
    ]);
    expect(spawnOpts).toEqual(expect.objectContaining({ encoding: 'utf8' }));

    const compilerResult = spawnSyncMock.mock.results[
      spawnSyncMock.mock.calls.findIndex(([spawnPath, spawnArgs]) => (
        spawnPath === compilerBin && spawnArgs?.[0] === '--stdin'
      ))
    ]?.value;
    const parsed = JSON.parse(compilerResult.stdout);
    expect(validateCompilerIR(parsed)).toEqual([]);
    expect(compilerResult.stderr).toBe('');

    const [bundlerPath, bundlerArgs, bundlerOpts] = spawnMock.mock.calls[0];
    expect(bundlerPath).toBe(bundlerBin);
    expect(bundlerArgs).toEqual([
      '--out-dir',
      path.join(project.root, '.zenith-output', 'static'),
      '--base-path',
      '/',
      '--route-check'
    ]);
    expect(bundlerOpts).toEqual(expect.objectContaining({
      cwd: project.root,
      stdio: ['pipe', 'inherit', 'inherit']
    }));

    const bundlerChild = spawnMock.mock.results[0].value;
    const payload = JSON.parse(bundlerChild.__stdinChunks.join(''));
    // A no-image project uses the native bare-input contract and no image payload.
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload.image_runtime_payload).toBeUndefined();
    const envelope = payload[0];

    expect(envelope.ir).toEqual(expect.objectContaining(fakeIR));
    expect(envelope.ir).toEqual(expect.objectContaining({
      components_scripts: {},
      component_instances: [],
      signals: [],
      has_guard: false,
      has_load: false,
      has_action: false,
      guard_module_ref: null,
      load_module_ref: null,
      action_module_ref: null
    }));
    expect(envelope.route).toBe('/');
    expect(envelope.file).toMatch(/pages[\\/]index\.zen$/);
    expect(envelope.router).toBe(true);
  }));

  // This test executes the real compiler, so it needs a native build. Skip it,
  // rather than fail, when packages/compiler/target/release has no binary.
  const testWithNativeCompiler = hasExecutable(compilerBin) ? test : test.skip;
  testWithNativeCompiler('compiler binary stdout is strict JSON IR with no warnings on stderr', async () => {
    const project = await makePage('<script lang="ts">function save() {}</script><div><button on:click={save}>Save</button></div>');
    const entry = path.join(project.pagesDir, 'index.zen');

    const result = runCompilerBinary(entry);

    expect(result.status).toBe(0);
    expect((result.stderr || '').trim()).toBe('');

    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const ir = JSON.parse(result.stdout);
    expect(validateCompilerIR(ir)).toEqual([]);

    expect(ir.schemaVersion).toBe(1);
    expect(Array.isArray(ir.diagnostics)).toBe(true);
    expect(Array.isArray(ir.warnings)).toBe(true);
    expect(Array.isArray(ir.ref_bindings)).toBe(true);
  });
});
