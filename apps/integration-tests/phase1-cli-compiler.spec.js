// PHASE 1 — CLI -> Compiler process seam validation.
// Contract: CLI invokes compiler binary, compiler emits strict JSON IR,
// and CLI passes IR to bundler without mutation.

import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { createTempProject } from './helpers/project.js';
import { bundlerBin, cliBuildModule, compilerBin, toFileHref } from './helpers/paths.js';
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

afterAll(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Phase 1: CLI -> compiler process seam', () => {
  test('CLI bridge spawns compiler binary and forwards IR unchanged', async () => {
    const fakeIR = {
      ir_version: 1,
      graph_hash: 'deadbeef',
      graph_edges: [],
      graph_nodes: [],
      html: '<h1 data-zx-e="0"></h1>',
      expressions: ['count'],
      hoisted: {
        imports: [],
        declarations: [],
        functions: [],
        signals: [],
        state: [],
        code: []
      }
    };

    const spawnSyncMock = jest.fn(() => ({
      status: 0,
      stdout: JSON.stringify(fakeIR),
      stderr: ''
    }));

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

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [spawnPath, spawnArgs, spawnOpts] = spawnSyncMock.mock.calls[0];
    expect(spawnPath).toBe(compilerBin);
    expect(spawnArgs).toHaveLength(1);
    expect(spawnArgs[0]).toMatch(/pages[\\/]index\.zen$/);
    expect(spawnOpts).toEqual(expect.objectContaining({ encoding: 'utf8' }));

    const parsed = JSON.parse(spawnSyncMock.mock.results[0].value.stdout);
    expect(validateCompilerIR(parsed)).toEqual([]);
    expect(spawnSyncMock.mock.results[0].value.stderr).toBe('');

    const [bundlerPath, bundlerArgs, bundlerOpts] = spawnMock.mock.calls[0];
    expect(bundlerPath).toBe(bundlerBin);
    expect(bundlerArgs).toEqual(['--out-dir', project.outDir]);
    expect(bundlerOpts).toEqual({ stdio: ['pipe', 'inherit', 'inherit'] });

    const bundlerChild = spawnMock.mock.results[0].value;
    const payload = JSON.parse(bundlerChild.__stdinChunks.join(''));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    const envelope = payload[0];

    expect(envelope.ir).toEqual(fakeIR);
    expect(envelope.route).toBe('/');
    expect(envelope.file).toMatch(/pages[\\/]index\.zen$/);
    expect(envelope.router).toBe(true);
  });

  test('compiler binary stdout is strict JSON IR with no warnings on stderr', async () => {
    const project = await makePage('<div><button on:click={save}>Save</button></div>');
    const entry = path.join(project.pagesDir, 'index.zen');

    const result = runCompilerBinary(entry);

    expect(result.status).toBe(0);
    expect((result.stderr || '').trim()).toBe('');

    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const ir = JSON.parse(result.stdout);
    expect(validateCompilerIR(ir)).toEqual([]);

    // No unexpected keys at the process seam.
    expect(Object.keys(ir).sort()).toEqual([
      'component_instances',
      'components_scripts',
      'event_bindings',
      'expression_bindings',
      'expressions',
      'graph_edges',
      'graph_hash',
      'graph_nodes',
      'hoisted',
      'html',
      'imports',
      'ir_version',
      'marker_bindings',
      'modules',
      'prerender',
      'server_script',
      'signals',
      'ssr_data',
      'style_blocks'
    ]);
  });
});
