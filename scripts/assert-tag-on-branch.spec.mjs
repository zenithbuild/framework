import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts/assert-tag-on-branch.mjs');

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return result.stdout.trim();
}

function setupRepo() {
  const tempDir = makeTempDir('zenith-assert-tag-on-branch-');
  const originDir = path.join(tempDir, 'origin.git');
  const workDir = path.join(tempDir, 'work');

  mkdirSync(workDir, { recursive: true });
  run('git', ['init', '--bare', originDir], tempDir);
  run('git', ['init', '--initial-branch=master'], workDir);
  run('git', ['config', 'user.name', 'Zenith Test'], workDir);
  run('git', ['config', 'user.email', 'zenith@example.com'], workDir);
  run('git', ['remote', 'add', 'origin', originDir], workDir);

  writeFileSync(path.join(workDir, 'README.md'), '# test\n', 'utf8');
  run('git', ['add', 'README.md'], workDir);
  run('git', ['commit', '-m', 'initial'], workDir);
  run('git', ['push', '-u', 'origin', 'master'], workDir);

  run('git', ['checkout', '-b', 'train'], workDir);
  writeFileSync(path.join(workDir, 'train.txt'), 'train\n', 'utf8');
  run('git', ['add', 'train.txt'], workDir);
  run('git', ['commit', '-m', 'train commit'], workDir);
  const trainSha = run('git', ['rev-parse', 'HEAD'], workDir);
  run('git', ['push', '-u', 'origin', 'train'], workDir);

  run('git', ['checkout', '-b', 'feature/tag-drift', 'master'], workDir);
  writeFileSync(path.join(workDir, 'feature.txt'), 'feature\n', 'utf8');
  run('git', ['add', 'feature.txt'], workDir);
  run('git', ['commit', '-m', 'feature commit'], workDir);
  const featureSha = run('git', ['rev-parse', 'HEAD'], workDir);
  run('git', ['push', '-u', 'origin', 'feature/tag-drift'], workDir);

  run('git', ['fetch', 'origin', '+refs/heads/*:refs/remotes/origin/*'], workDir);

  return { tempDir, workDir, trainSha, featureSha };
}

test('passes when tagged commit is contained in the expected branch', () => {
  const repo = setupRepo();

  try {
    const result = spawnSync(process.execPath, [SCRIPT, 'train'], {
      cwd: repo.workDir,
      env: {
        ...process.env,
        GITHUB_SHA: repo.trainSha,
        GITHUB_REF_NAME: 'v0.6.13',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /is contained in origin\/train/);
  } finally {
    rmSync(repo.tempDir, { recursive: true, force: true });
  }
});

test('fails when tagged commit is not contained in the expected branch', () => {
  const repo = setupRepo();

  try {
    const result = spawnSync(process.execPath, [SCRIPT, 'train'], {
      cwd: repo.workDir,
      env: {
        ...process.env,
        GITHUB_SHA: repo.featureSha,
        GITHUB_REF_NAME: 'v0.6.13',
      },
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /is not contained in origin\/train/);
    assert.match(result.stderr, /origin\/feature\/tag-drift/);
  } finally {
    rmSync(repo.tempDir, { recursive: true, force: true });
  }
});

test('fails when required GitHub environment variables are missing', () => {
  const repo = setupRepo();

  try {
    const result = spawnSync(process.execPath, [SCRIPT, 'train'], {
      cwd: repo.workDir,
      env: {
        ...process.env,
        GITHUB_REF_NAME: 'v0.6.13',
      },
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing required environment variable: GITHUB_SHA/);
  } finally {
    rmSync(repo.tempDir, { recursive: true, force: true });
  }
});
