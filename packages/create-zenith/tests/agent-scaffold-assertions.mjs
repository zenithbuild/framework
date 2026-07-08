import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(TEST_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const AGENT_TEMPLATE_ROOT = join(PACKAGE_ROOT, 'templates', 'features', 'agents');
const AGENT_TEMPLATE_SKILL_ROOT = join(AGENT_TEMPLATE_ROOT, '.agents', 'skills', 'zenith');
const CANONICAL_SKILL_ROOT = join(WORKSPACE_ROOT, 'skills', 'zenithbuild');

const PROJECT_AGENTS_MD = `# Zenith Project Agent Instructions
This is a Zenith framework project.
Before writing or editing code, read:
- \`.agents/skills/zenith/SKILL.md\`
- \`.agents/skills/zenith/rules/zenith-agent-contract.md\`
Do not use React, Vue, Svelte, Astro, or generic framework patterns unless explicitly requested.
Use Zenith syntax, Zenith primitives, and Zenith route protection rules.
`;

const REQUIRED_AGENT_SKILL_FILES = [
    'SKILL.md',
    'rules/zenith-agent-contract.md',
    'rules/zenith-dom-rules.md',
    'rules/zenith-routing-rules.md',
    'rules/zenith-tailwind-rules.md',
    'examples/component.zen',
    'examples/interactive-menu.zen',
    'examples/protected-route.zen'
];

const FORBIDDEN_EXAMPLE_PATTERNS = [
    ['onClick=', /onClick=/],
    ['onclick=', /onclick=/],
    ['@click=', /@click=/],
    ['{#if}', /\{#if\}/],
    ['{#each}', /\{#each\}/],
    ['document.querySelector', /document\.querySelector/],
    ['querySelector(', /querySelector\(/],
    ['addEventListener(', /addEventListener\(/],
    ['export async function guard', /export\s+async\s+function\s+guard\b/],
    ['export async function load', /export\s+async\s+function\s+load\b/]
];

function repoRelative(file) {
    return relative(WORKSPACE_ROOT, file);
}

function read(file) {
    return readFileSync(file, 'utf8');
}

function assertFile(root, relPath) {
    const file = join(root, relPath);
    assert.equal(existsSync(file), true, `missing ${repoRelative(file)}`);
    return file;
}

function assertLineLimit(file) {
    const lines = read(file).split(/\r?\n/).length;
    assert.ok(lines <= 500, `${repoRelative(file)} exceeds 500 lines (${lines})`);
}

function assertRoutingContract(skillRoot) {
    for (const relPath of ['rules/zenith-routing-rules.md', 'examples/protected-route.zen']) {
        const file = assertFile(skillRoot, relPath);
        const content = read(file);
        assert.match(content, /export const guard = async \(ctx\) =>/, `${repoRelative(file)} must use const guard export`);
        assert.match(content, /export const load = async \(ctx\) =>/, `${repoRelative(file)} must use const load export`);
        assert.doesNotMatch(content, /export\s+async\s+function\s+guard\b/, `${repoRelative(file)} must not use function guard export`);
        assert.doesNotMatch(content, /export\s+async\s+function\s+load\b/, `${repoRelative(file)} must not use function load export`);
    }
}

function assertExampleContracts(skillRoot) {
    const examplesRoot = join(skillRoot, 'examples');
    for (const entry of readdirSync(examplesRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.zen')) {
            continue;
        }
        const file = join(examplesRoot, entry.name);
        const content = read(file);
        for (const [label, pattern] of FORBIDDEN_EXAMPLE_PATTERNS) {
            assert.doesNotMatch(content, pattern, `${repoRelative(file)} contains forbidden pattern: ${label}`);
        }
    }
}

function assertSkillFiles(skillRoot) {
    for (const relPath of REQUIRED_AGENT_SKILL_FILES) {
        assertLineLimit(assertFile(skillRoot, relPath));
    }
    assertRoutingContract(skillRoot);
    assertExampleContracts(skillRoot);
}

export function assertAgentScaffold(projectDir) {
    const projectAgentsFile = assertFile(projectDir, 'AGENTS.md');
    assert.equal(read(projectAgentsFile), PROJECT_AGENTS_MD, `${repoRelative(projectAgentsFile)} must match project agent instructions`);
    assertLineLimit(projectAgentsFile);
    assertSkillFiles(join(projectDir, '.agents', 'skills', 'zenith'));
}

export function assertAgentTemplateContracts() {
    const templateAgentsFile = assertFile(AGENT_TEMPLATE_ROOT, 'AGENTS.md');
    assert.equal(read(templateAgentsFile), PROJECT_AGENTS_MD, `${repoRelative(templateAgentsFile)} must match project agent instructions`);
    assertLineLimit(templateAgentsFile);
    assertSkillFiles(AGENT_TEMPLATE_SKILL_ROOT);
}

export function assertAgentTemplateMirrorsCanonicalSkill() {
    for (const relPath of REQUIRED_AGENT_SKILL_FILES) {
        const templateFile = assertFile(AGENT_TEMPLATE_SKILL_ROOT, relPath);
        const canonicalFile = assertFile(CANONICAL_SKILL_ROOT, relPath);
        assert.equal(read(templateFile), read(canonicalFile), `${repoRelative(templateFile)} must match ${repoRelative(canonicalFile)}`);
    }
}
