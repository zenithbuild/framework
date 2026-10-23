#!/usr/bin/env node
// Audits root and site dependencies. Exit codes (see AUDIT_EXIT):
// 0 clean, 1 active advisory findings, 2 the audit could not run.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_EXIT, auditExitCode, parseAuditResult, WITHDRAWN_ADVISORIES } from './dependency-audit-report.mjs';

process.on('uncaughtException', (error) => {
    console.error(`[dependency-audit] ERROR (audit could not run, not an advisory finding): ${error.stack || error}`);
    process.exit(AUDIT_EXIT.AUDIT_ERROR);
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let findings = 0;
let errors = 0;
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
        findings += report.active.length;
    } catch (error) {
        errors += 1;
        console.error(`[dependency-audit] ERROR (audit could not run, not an advisory finding): ${error.message}`);
    }
}
for (const [id, advisory] of WITHDRAWN_ADVISORIES) {
    console.log(`[dependency-audit] ${id} withdrawn ${advisory.withdrawnAt}: ${advisory.reason} ${advisory.url}`);
}
const code = auditExitCode({ findings, errors });
if (code === AUDIT_EXIT.AUDIT_ERROR) {
    console.error(`[dependency-audit] Exit 2: the audit could not run in ${errors} scope(s); results are incomplete. Treat this as an infrastructure or tooling fault, not a clean pass.`);
} else if (code === AUDIT_EXIT.FINDINGS) {
    console.error(`[dependency-audit] Exit 1: ${findings} active finding(s) remain unresolved. No exception or risk acceptance is implied; disposition belongs to JUD-21.`);
}
process.exitCode = code;
