import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditResult } from './dependency-audit-report.mjs';

const withdrawn = { title: 'Misidentified esbuild advisory', severity: 'high', url: 'https://github.com/advisories/GHSA-gv7w-rqvm-qjhr' };
const active = { title: 'Active esbuild advisory', severity: 'moderate', url: 'https://github.com/advisories/GHSA-67mh-4wv8-2f99' };
const result = (data, status = 1) => ({ status, stdout: JSON.stringify(data), stderr: '' });

test('only the verified withdrawn advisory is excluded, preserving active findings on the same package', () => {
    const report = parseAuditResult(result({ esbuild: [withdrawn, active] }), 'site');
    assert.deepEqual(report.active.map(item => item.url), [active.url]);
    assert.deepEqual(report.withdrawn.map(item => item.url), [withdrawn.url]);
});

test('active findings from all packages and severities remain visible', () => {
    for (const severity of ['low', 'moderate', 'high', 'critical']) {
        const report = parseAuditResult(result({ dependency: [{ ...active, severity }] }), 'root');
        assert.equal(report.active[0].severity, severity);
        assert.equal(report.active[0].scope, 'root');
    }
});

test('clean audits and withdrawn-only reports are distinguished', () => {
    assert.equal(parseAuditResult(result({}, 0), 'root').active.length, 0);
    assert.equal(parseAuditResult(result({ esbuild: [withdrawn] }), 'site').withdrawn.length, 1);
});

test('command errors, missing findings, malformed JSON and unsupported schemas cannot look clean', () => {
    for (const bad of [
        { status: null, error: new Error('network failure') },
        { status: 2, stdout: '{}' },
        { status: 1, stdout: '{}' },
        { status: 0, stdout: 'not JSON' },
        result([], 0), result({ error: 'registry unavailable' }, 0),
        result({ dependency: [{ ...active, severity: 'unknown' }] })
    ]) assert.throws(() => parseAuditResult(bad, 'root'));
});
