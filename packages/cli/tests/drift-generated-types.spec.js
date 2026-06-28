import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { collectFiles, REPO_ROOT, scanFiles } from './helpers/drift-gates-fixtures.js';

describe('drift generated types', () => {
    test('no absolute machine paths leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'apps/smoke-test/.zenith');
        if (existsSync(typesDir)) {
            const files = collectFiles(typesDir, ['.ts']);
            const absoluteHits = scanFiles(files, new RegExp('/Users/|C:\\\\', 'i'));
            expect(absoluteHits).toEqual([]);
        }
    });

    test('no magic globals (data, params, ctx) leak into generated type definitions', () => {
        const typesDir = resolve(REPO_ROOT, 'apps/smoke-test/.zenith');

        expect(existsSync(typesDir)).toBe(true);

        const tmpValid = resolve(typesDir, 'zenith-test-valid.ts');
        writeFileSync(tmpValid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'export const load: Zenith.Load = async (ctx) => {',
            '    const id = ctx.route.id;',
            '    return { ok: true };',
            '};'
        ].join('\n'));

        expect(() => {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpValid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) throw new Error('TypeScript compilation failed for valid syntax');
        }).not.toThrow();
        unlinkSync(tmpValid);

        const tmpInvalid = resolve(typesDir, 'zenith-test-invalid.ts');
        writeFileSync(tmpInvalid, [
            '/// <reference path="./zenith-env.d.ts" />',
            'const d = data;',
            'const p = params;',
            'const c = ctx;'
        ].join('\n'));

        let threw = false;
        try {
            const result = spawnSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', tmpInvalid], {
                stdio: 'ignore',
                shell: process.platform === 'win32'
            });
            if (result.status !== 0) {
                threw = true;
            }
        } catch (err) {
            threw = true;
        }
        unlinkSync(tmpInvalid);
        expect(threw).toBe(true);
    });
});
