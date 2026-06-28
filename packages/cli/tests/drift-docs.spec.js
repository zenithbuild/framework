import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './helpers/drift-gates-fixtures.js';

describe('drift docs', () => {
    test('route-protection docs use data.* instead of params.* for load(ctx) payloads', () => {
        const routeProtectionDoc = resolve(REPO_ROOT, 'docs/documentation/routing/route-protection.md');
        if (existsSync(routeProtectionDoc)) {
            const content = readFileSync(routeProtectionDoc, 'utf8');
            expect(content).not.toMatch(/\{params\.user\.name\}/);
            expect(content).not.toMatch(/\{params\.metrics/);
            expect(content).toMatch(/\{data\.user\.name\}/);
            expect(content).toMatch(/\{data\.metrics/);
        }
    });
});
