#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const expectedBranch = process.argv[2];
const allowedBranches = new Set(['beta', 'train', 'master']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    ...options,
  });

  if (!options.allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    fail(`git ${args.join(' ')} failed${detail ? `: ${detail}` : '.'}`);
  }

  return result;
}

if (!allowedBranches.has(expectedBranch)) {
  fail('Usage: node scripts/assert-tag-on-branch.mjs <beta|train|master>');
}

const sha = process.env.GITHUB_SHA?.trim();
const tagName = process.env.GITHUB_REF_NAME?.trim();

if (!sha) {
  fail('Missing required environment variable: GITHUB_SHA');
}

if (!tagName) {
  fail('Missing required environment variable: GITHUB_REF_NAME');
}

const remoteBranch = `origin/${expectedBranch}`;
runGit(['fetch', '--no-tags', 'origin', `+refs/heads/${expectedBranch}:refs/remotes/${remoteBranch}`]);

const branchResult = runGit(['rev-parse', '--verify', remoteBranch], { allowFailure: true });
if (branchResult.status !== 0) {
  fail(`Expected remote branch ${remoteBranch} does not exist after fetch.`);
}

const ancestorResult = runGit(['merge-base', '--is-ancestor', sha, remoteBranch], { allowFailure: true });
if (ancestorResult.status === 0) {
  console.log(`Tag ${tagName} (${sha}) is contained in ${remoteBranch}.`);
  process.exit(0);
}

if (ancestorResult.status !== 1) {
  const detail = (ancestorResult.stderr || ancestorResult.stdout || '').trim();
  fail(`Unable to verify whether ${sha} is contained in ${remoteBranch}${detail ? `: ${detail}` : '.'}`);
}

const containsResult = runGit(['branch', '-r', '--contains', sha], { allowFailure: true });
const containingBranches = (containsResult.stdout || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const detail = containingBranches.length > 0
  ? `Remote branches containing ${sha}: ${containingBranches.join(', ')}`
  : `No fetched remote branches contain ${sha}.`;

fail(`Tag ${tagName} points to ${sha}, which is not contained in ${remoteBranch}. ${detail}`);
