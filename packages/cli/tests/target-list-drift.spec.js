import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_TARGETS } from '../dist/adapters/adapter-types.js';
import { runCommand as runAdapterCommand } from '../dist/commands/adapter/index.js';
import { createZenithLogger } from '../dist/ui/logger.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const CANONICAL_SOURCE = 'packages/core/src/config/config-targets.ts';

// Public enumerations. The deployment matrix body and create-zenith README
// list text stay on JUD-95; this gate locks the CLI lists and the canonical
// docs target list so a later edit cannot omit or invent a name.
const LIST_HEADINGS = [
    'Supported deployment targets:',
    'Today the supported target names are:'
];
const LIST_ROOTS = [
    'packages/cli',
    'docs/documentation'
];
const REQUIRED_LISTS = [
    'docs/documentation/cli-contract.md',
    'packages/cli/CLI_CONTRACT.md',
    'packages/cli/README.md'
];

function readRepo(rel) {
    return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function readCanonicalTargets() {
    const source = readRepo(CANONICAL_SOURCE);
    const match = source.match(/export const ZENITH_TARGETS = \[([\s\S]*?)\] as const;/);
    if (!match) {
        throw new Error(`${CANONICAL_SOURCE} is missing the ZENITH_TARGETS array`);
    }
    return [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((entry) => entry[1]);
}

function collectMarkdown(dir) {
    const files = [];
    const stack = [resolve(REPO_ROOT, dir)];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '_legacy_v1') {
                    continue;
                }
                stack.push(full);
                continue;
            }
            if (entry.name.endsWith('.md')) {
                files.push(full);
            }
        }
    }
    return files.sort();
}

function extractHeadingList(markdown, heading) {
    const lines = markdown.split(/\r?\n/);
    const names = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].trim() !== heading) {
            continue;
        }
        const list = [];
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
            const line = lines[cursor].trim();
            if (line === '') {
                if (list.length === 0) {
                    continue;
                }
                break;
            }
            const match = line.match(/^- `([a-z0-9-]+)`$/);
            if (!match) {
                break;
            }
            list.push(match[1]);
        }
        names.push(list);
    }
    return names;
}

function publicTargetLists() {
    const found = [];
    for (const root of LIST_ROOTS) {
        for (const file of collectMarkdown(root)) {
            const rel = relative(REPO_ROOT, file);
            const markdown = readFileSync(file, 'utf8');
            for (const heading of LIST_HEADINGS) {
                for (const names of extractHeadingList(markdown, heading)) {
                    found.push({ file: rel, heading, names });
                }
            }
        }
    }
    return found;
}

async function captureAdapterList() {
    const lines = [];
    const logger = createZenithLogger({
        stdout: { isTTY: false, write: (chunk) => lines.push(String(chunk)) },
        stderr: { isTTY: false, write: (chunk) => lines.push(String(chunk)) }
    });
    const code = await runAdapterCommand(['list'], { projectRoot: REPO_ROOT, logger });
    return { code, output: lines.join('') };
}

function extractBuiltInTargets(output) {
    const lines = output.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === 'Built-in targets:');
    if (start < 0) {
        throw new Error('zenith adapter list is missing the Built-in targets header');
    }
    const names = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === '') {
            break;
        }
        const match = line.match(/^ {2}([a-z0-9-]+)$/);
        if (!match) {
            throw new Error(`unexpected built-in target line: ${line}`);
        }
        names.push(match[1]);
    }
    return names;
}

describe('public target list drift', () => {
    const canonical = readCanonicalTargets();

    test('canonical ZENITH_TARGETS is a non-empty unique list', () => {
        expect(canonical.length).toBeGreaterThan(0);
        expect(new Set(canonical).size).toBe(canonical.length);
    });

    test('CLI KNOWN_TARGETS is the canonical ZENITH_TARGETS list', () => {
        const adapterTypes = readRepo('packages/cli/src/adapters/adapter-types.ts');
        expect(adapterTypes).toContain('export const KNOWN_TARGETS: readonly string[] = ZENITH_TARGETS;');
        expect([...KNOWN_TARGETS]).toEqual(canonical);
    });

    test('documented public target lists match ZENITH_TARGETS exactly', () => {
        const lists = publicTargetLists();
        const files = lists.map((entry) => entry.file);

        for (const required of REQUIRED_LISTS) {
            expect(files).toContain(required);
        }
        expect(lists.length).toBeGreaterThan(0);
        for (const list of lists) {
            expect(list.names).toEqual(canonical);
        }
    });

    test('zenith adapter list prints the canonical targets and does not call placeholders installable', async () => {
        const { code, output } = await captureAdapterList();
        expect(code).toBe(0);
        expect(output).toContain('Host targets (built-in):');
        expect(output).not.toContain('Official adapters');
        expect(extractBuiltInTargets(output)).toEqual(canonical);

        const lines = output.split(/\r?\n/);
        const start = lines.findIndex((line) => line.trim() === 'Host targets (built-in):');
        const placeholders = [];
        for (let index = start + 1; index < lines.length; index += 1) {
            if (lines[index].trim() === '') {
                break;
            }
            placeholders.push(lines[index]);
        }
        expect(placeholders.length).toBeGreaterThan(0);
        for (const line of placeholders) {
            expect(line).toContain('[not-installable');
            expect(line).not.toContain('[installable');
        }
    });
});
