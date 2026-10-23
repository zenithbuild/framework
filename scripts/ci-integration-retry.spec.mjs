import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'reusable-ci.yml');

function integrationRetryBody() {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    const jobStart = workflow.indexOf('      - name: Run Integration Shard');
    const nextJob = workflow.indexOf('\n  smoke:', jobStart);
    assert.notEqual(jobStart, -1, 'integration retry step must exist');
    assert.notEqual(nextJob, -1, 'integration retry step must end before smoke job');

    const step = workflow.slice(jobStart, nextJob);
    const bodyMarker = '        run: |\n';
    const bodyStart = step.indexOf(bodyMarker);
    assert.notEqual(bodyStart, -1, 'integration retry step must use a shell body');

    return step
        .slice(bodyStart + bodyMarker.length)
        .split('\n')
        .map((line) => line.startsWith('          ') ? line.slice(10) : line)
        .join('\n')
        .replaceAll(
            'bash ./scripts/ci-integration.sh',
            'bash "${ZENITH_TEST_INTEGRATION_SCRIPT}"'
        );
}

function runScenario(exitCodes) {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'zenith-ci-retry-'));
    try {
        const bodyPath = path.join(fixtureRoot, 'retry.sh');
        const integrationPath = path.join(fixtureRoot, 'integration.sh');
        writeFileSync(bodyPath, integrationRetryBody(), 'utf8');
        writeFileSync(
            integrationPath,
            [
                '#!/usr/bin/env bash',
                'set -euo pipefail',
                `case "${'${ZENITH_CI_RETRY_ATTEMPT}'}" in`,
                `  1) exit ${exitCodes[0]} ;;`,
                `  2) exit ${exitCodes[1]} ;;`,
                '  *) exit 99 ;;',
                'esac',
                ''
            ].join('\n'),
            'utf8'
        );

        return spawnSync('bash', [bodyPath], {
            cwd: ROOT,
            encoding: 'utf8',
            env: {
                ...process.env,
                ZENITH_CI_SHARD_INDEX: '1',
                ZENITH_CI_SHARD_TOTAL: '6',
                ZENITH_TEST_INTEGRATION_SCRIPT: integrationPath
            }
        });
    } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
    }
}

test('integration retry exits zero when the first attempt passes', () => {
    const result = runScenario([0, 23]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /attempt=1 event=end exit=0/);
    assert.doesNotMatch(result.stdout, /attempt=2 event=start/);
});

test('integration retry exits zero when only the retry passes', () => {
    const result = runScenario([23, 0]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /attempt=1 event=end exit=23/);
    assert.match(result.stdout, /attempt=2 event=end exit=0/);
});

test('integration retry preserves the second failure status', () => {
    const result = runScenario([23, 42]);
    assert.equal(result.status, 42, result.stderr);
    assert.match(result.stdout, /attempt=1 event=end exit=23/);
    assert.match(result.stdout, /attempt=2 event=end exit=42/);
});
