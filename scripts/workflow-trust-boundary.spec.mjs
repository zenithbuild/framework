import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
const WORKFLOW_FILES = readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml'))
    .sort();

const APPROVED_ACTIONS = new Map([
    ['actions/cache@v4', 'GitHub-maintained cache action, major tag allowlisted.'],
    ['actions/checkout@v4', 'GitHub-maintained checkout action, major tag allowlisted.'],
    ['actions/setup-node@v4', 'GitHub-maintained Node setup action, major tag allowlisted.'],
    ['actions/upload-artifact@v4', 'GitHub-maintained artifact action, major tag allowlisted.'],
    ['dtolnay/rust-toolchain@stable', 'Rust toolchain setup action, stable selector allowlisted.'],
    ['oven-sh/setup-bun@v2', 'Bun setup action, major tag allowlisted.'],
    ['softprops/action-gh-release@v2', 'GitHub release action, major tag allowlisted.']
]);

function readWorkflow(fileName) {
    return readFileSync(path.join(WORKFLOW_DIR, fileName), 'utf8');
}

function getTopLevelBlock(source, blockName) {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => line === `${blockName}:`);
    if (start === -1) {
        return '';
    }

    const block = [lines[start]];
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(line)) {
            break;
        }
        block.push(line);
    }

    return block.join('\n');
}

function getJobsBlock(source) {
    return getTopLevelBlock(source, 'jobs');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getJobBlock(source, jobName) {
    const jobs = getJobsBlock(source);
    const lines = jobs.split('\n');
    const start = lines.findIndex((line) => line === `  ${jobName}:`);
    if (start === -1) {
        return '';
    }

    const block = [lines[start]];
    const jobHeader = /^  [A-Za-z0-9_-]+:/;
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (jobHeader.test(line)) {
            break;
        }
        block.push(line);
    }

    return block.join('\n');
}

function listJobNames(source) {
    const jobs = getJobsBlock(source);
    return [...jobs.matchAll(/^  ([A-Za-z0-9_-]+):/gm)].map((match) => match[1]);
}

function listOidcJobs(source) {
    return listJobNames(source).filter((jobName) => /id-token:\s*write/.test(getJobBlock(source, jobName)));
}

function topLevelPermissions(source) {
    return getTopLevelBlock(source, 'permissions');
}

function usesEntries(source) {
    return [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
}

test('workflows do not use pull_request_target', () => {
    for (const fileName of WORKFLOW_FILES) {
        assert.doesNotMatch(readWorkflow(fileName), /^\s*pull_request_target:/m, fileName);
    }
});

test('CI workflows run with read-only repository permissions', () => {
    for (const fileName of ['ci.yml', 'reusable-ci.yml']) {
        const permissions = topLevelPermissions(readWorkflow(fileName));
        assert.match(permissions, /contents:\s*read/, `${fileName} should grant read-only contents`);
        assert.doesNotMatch(permissions, /contents:\s*write/, `${fileName} must not grant contents write`);
        assert.doesNotMatch(permissions, /id-token:\s*write/, `${fileName} must not grant OIDC`);
    }
});

test('OIDC token permission is limited to npm publish jobs', () => {
    const expectedOidcJobsByWorkflow = new Map([
        ['publish.yml', ['publish_platforms', 'publish_release']],
        ['publish-create-zenith.yml', ['publish_scaffolder']]
    ]);

    for (const fileName of WORKFLOW_FILES) {
        const source = readWorkflow(fileName);
        const topLevel = topLevelPermissions(source);
        assert.doesNotMatch(topLevel, /id-token:\s*write/, `${fileName} must not grant workflow-wide OIDC`);

        const expected = expectedOidcJobsByWorkflow.get(fileName) || [];
        assert.deepEqual(listOidcJobs(source), expected, `${fileName} has unexpected OIDC job scope`);

        for (const jobName of expected) {
            const job = getJobBlock(source, jobName);
            assert.match(job, /environment:\s*npm-release/, `${fileName}:${jobName} should use npm-release`);
            assert.match(job, /Assert OIDC-only publish auth/, `${fileName}:${jobName} should reject token auth`);
        }
    }
});

test('release and publish jobs fail closed before downstream release steps', () => {
    const publish = readWorkflow('publish.yml');
    assert.match(publish, /platform_stage:[\s\S]*needs:\s*\[preflight, publish_platforms\]/);
    assert.match(publish, /PLATFORM_RESULT:[\s\S]*needs\.publish_platforms\.result/);
    assert.match(publish, /\$\{PLATFORM_RESULT\}" != "success"/);
    assert.match(publish, /publish_release:[\s\S]*needs:\s*\[preflight, platform_stage\]/);
    assert.match(publish, /publish_release:[\s\S]*if:\s*needs\.platform_stage\.result == 'success'/);
    assert.match(publish, /verify_registry:[\s\S]*needs:\s*\[preflight, publish_release\]/);
    assert.match(publish, /release_metadata:[\s\S]*needs:\s*\[preflight, verify_registry\]/);

    const scaffolder = readWorkflow('publish-create-zenith.yml');
    assert.match(scaffolder, /publish_scaffolder:[\s\S]*needs:\s*\[detect, ci\]/);
    assert.match(scaffolder, /publish_scaffolder:[\s\S]*needs\.ci\.result == 'success'/);
    assert.match(scaffolder, /verify_registry:[\s\S]*needs:\s*\[detect, publish_scaffolder\]/);
    assert.match(scaffolder, /release_create_zenith:[\s\S]*needs:\s*\[detect, verify_registry\]/);
    assert.match(scaffolder, /release_create_zenith:[\s\S]*needs\.verify_registry\.result == 'success'/);
});

test('release-sensitive workflows do not mask required command failures', () => {
    for (const fileName of ['publish.yml', 'release.yml', 'bootstrap-platform-packages.yml']) {
        assert.doesNotMatch(readWorkflow(fileName), /\|\|\s*true/, `${fileName} must not mask failures`);
    }

    const scaffolderMaskedLines = readWorkflow('publish-create-zenith.yml')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /\|\|\s*true/.test(line));

    assert.deepEqual(scaffolderMaskedLines, [
        'previous_version="$(read_package_version_at_revision "$BEFORE_SHA" || true)"',
        'current_version="$(read_package_version_at_revision "$CURRENT_SHA" || true)"'
    ]);
});

test('third-party workflow actions stay explicitly allowlisted', () => {
    for (const fileName of WORKFLOW_FILES) {
        const source = readWorkflow(fileName);
        for (const uses of usesEntries(source)) {
            if (uses.startsWith('./')) {
                continue;
            }
            assert.ok(
                APPROVED_ACTIONS.has(uses),
                `${fileName} uses ${uses}; add it to the workflow policy allowlist with rationale`
            );
        }
    }
});

test('GitHub release consumes only verified publish workflow artifacts', () => {
    const allWorkflowText = WORKFLOW_FILES.map(readWorkflow).join('\n');
    const release = readWorkflow('release.yml');

    assert.match(release, /workflow_run:[\s\S]*workflows:[\s\S]*- Publish \(npm\)/);
    assert.match(release, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(release, /framework-release-metadata/);
    assert.match(release, /framework-release-verification/);
    assert.match(release, /payload\.verified === true/);
    assert.doesNotMatch(allWorkflowText, /actions\/download-artifact@/);
});

test('standard publish workflows keep token-auth fallback out of publish paths', () => {
    for (const fileName of ['publish.yml', 'publish-create-zenith.yml']) {
        const source = readWorkflow(fileName);
        assert.match(source, /Assert OIDC-only publish auth/);
        assert.doesNotMatch(source, /\.npmrc/, `${fileName} should not write npm token auth`);
    }

    const bootstrap = readWorkflow('bootstrap-platform-packages.yml');
    assert.match(bootstrap, /workflow_dispatch:/);
    assert.match(bootstrap, /NPM_BOOTSTRAP_TOKEN/);

    for (const jobName of ['publish_platforms', 'publish_release']) {
        const job = getJobBlock(readWorkflow('publish.yml'), jobName);
        assert.match(job, /NPM_CONFIG_PROVENANCE:\s*"true"/, `publish.yml:${jobName}`);
    }
    assert.match(getJobBlock(readWorkflow('publish-create-zenith.yml'), 'publish_scaffolder'), /NPM_CONFIG_PROVENANCE:\s*"true"/);
});

