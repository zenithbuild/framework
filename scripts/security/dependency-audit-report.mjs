// Exit codes for scripts/security/check-dependency-advisories.mjs:
//   0  every scope audited cleanly (withdrawn-only findings count as clean)
//   1  the audit ran and reported active advisory findings
//   2  the audit could not run in at least one scope (missing tool, registry or
//      network failure, timeout, invalid JSON or unsupported schema). The results
//      are incomplete, so this takes precedence over findings in other scopes.
export const AUDIT_EXIT = Object.freeze({ CLEAN: 0, FINDINGS: 1, AUDIT_ERROR: 2 });

export function auditExitCode({ findings, errors }) {
    if (errors > 0) return AUDIT_EXIT.AUDIT_ERROR;
    if (findings > 0) return AUDIT_EXIT.FINDINGS;
    return AUDIT_EXIT.CLEAN;
}

export const WITHDRAWN_ADVISORIES = new Map([
    ['GHSA-gv7w-rqvm-qjhr', {
        withdrawnAt: '2026-06-17',
        reason: 'The affected package was incorrectly identified.',
        url: 'https://github.com/advisories/GHSA-gv7w-rqvm-qjhr'
    }]
]);

export function parseAuditResult(result, scope) {
    if (result.error || ![0, 1].includes(result.status)) {
        throw new Error(`${scope}: audit command failed (${result.status ?? 'no exit status'}): ${result.error?.message || result.stderr || ''}`);
    }
    let payload;
    try {
        payload = JSON.parse(result.stdout);
    } catch {
        throw new Error(`${scope}: audit did not return valid JSON: ${result.stderr || result.stdout}`);
    }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error(`${scope}: audit payload must be a package-to-advisories object`);
    }
    const active = [];
    const withdrawn = [];
    for (const [name, advisories] of Object.entries(payload)) {
        if (!Array.isArray(advisories)) throw new Error(`${scope}: invalid advisory list for ${name}`);
        for (const advisory of advisories) {
            if (!advisory || typeof advisory.url !== 'string' || typeof advisory.title !== 'string'
                || !['low', 'moderate', 'high', 'critical'].includes(advisory.severity)) {
                throw new Error(`${scope}: malformed advisory for ${name}`);
            }
            const id = /^https:\/\/github\.com\/advisories\/(GHSA-[\w-]+)$/.exec(advisory.url)?.[1];
            const entry = { scope, package: name, ...advisory };
            if (WITHDRAWN_ADVISORIES.has(id)) withdrawn.push(entry);
            else active.push(entry);
        }
    }
    if (result.status === 1 && active.length + withdrawn.length === 0) {
        throw new Error(`${scope}: audit failed without returning advisory findings`);
    }
    return { scope, active, withdrawn };
}
