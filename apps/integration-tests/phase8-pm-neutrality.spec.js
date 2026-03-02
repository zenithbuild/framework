// PHASE 8 — Package manager neutrality.
// Contract: npm and bun builds must produce byte-identical dist outputs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test, expect, jest } from '@jest/globals';
import { createTempProject, npmInstall, bunInstall, runCli, scaffoldZenithProject } from './helpers/project.js';
import { assertSuccess, runCommandSync } from './helpers/process.js';
import { copyDir, diffHashPairs, hashTree, walkFilesDeterministic } from './helpers/fs.js';

jest.setTimeout(180000);

function hasBun() {
  const result = runCommandSync('bun', ['--version']);
  return result.status === 0;
}

describe('Phase 8: package manager neutrality', () => {
  const pmTest = hasBun() ? test : test.skip;

  pmTest('npm and bun builds emit identical file tree and hashes', async () => {
    const root = await createTempProject('zenith-phase8');

    await scaffoldZenithProject(root, {
      router: false,
      pages: {
        'index.zen': '<div><h1>{title}</h1></div>',
        'about.zen': '<div><h1>About</h1></div>'
      }
    });

    const distNpm = path.join(root, 'dist-npm');
    const distBun = path.join(root, 'dist-bun');

    assertSuccess(npmInstall(root), 'npm install');
    assertSuccess(runCli(root, ['build']), 'npm zenith build');
    await copyDir(path.join(root, 'dist'), distNpm);

    await fs.rm(path.join(root, 'node_modules'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
    await fs.rm(path.join(root, 'package-lock.json'), { force: true });
    await fs.rm(path.join(root, 'bun.lockb'), { force: true });

    assertSuccess(bunInstall(root), 'bun install');
    const bunBuild = runCommandSync('bun', ['run', 'build'], { cwd: root });
    assertSuccess(bunBuild, 'bun run build');
    await copyDir(path.join(root, 'dist'), distBun);

    const npmFiles = await walkFilesDeterministic(distNpm);
    const bunFiles = await walkFilesDeterministic(distBun);
    expect(npmFiles).toEqual(bunFiles);

    const npmHashes = await hashTree(distNpm);
    const bunHashes = await hashTree(distBun);

    const diffs = diffHashPairs(npmHashes, bunHashes);
    expect(diffs).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });
});
