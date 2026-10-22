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
