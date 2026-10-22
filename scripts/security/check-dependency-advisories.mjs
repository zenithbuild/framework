#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAuditResult, WITHDRAWN_ADVISORIES } from './dependency-audit-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let failed = false;
for (const scope of ['root', 'site']) {
    try {
        const result = spawnSync('bun', ['audit', '--json'], {
            cwd: scope === 'root' ? root : resolve(root, 'site'),
            encoding: 'utf8',
            timeout: 120_000,
            maxBuffer: 16 * 1024 * 1024
        });
        const report = parseAuditResult(result, scope);
        console.log(`[dependency-audit] ${scope}: ${report.active.length} active, ${report.withdrawn.length} withdrawn`);
        for (const finding of report.active) {
            console.error(`[dependency-audit] ${scope} ${finding.severity} ${finding.package}: ${finding.title} (${finding.url})`);
        }
        for (const finding of report.withdrawn) {
            console.log(`[dependency-audit] withdrawn, not an active finding: ${finding.url}`);
        }
        failed ||= report.active.length > 0;
    } catch (error) {
        failed = true;
        console.error(`[dependency-audit] ERROR: ${error.message}`);
    }
}
for (const [id, advisory] of WITHDRAWN_ADVISORIES) {
    console.log(`[dependency-audit] ${id} withdrawn ${advisory.withdrawnAt}: ${advisory.reason} ${advisory.url}`);
}
if (failed) {
    console.error('[dependency-audit] Active findings or audit errors remain unresolved. No exception or risk acceptance is implied; disposition belongs to JUD-21.');
    process.exitCode = 1;
}
