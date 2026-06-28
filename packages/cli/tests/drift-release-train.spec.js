import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INTERNAL_DEP_FIELDS, INTERNAL_PACKAGE_NAMES, REPO_ROOT, TRAIN_MANIFESTS } from './helpers/drift-gates-fixtures.js';

describe('drift release train', () => {
    test('release train: internal dependency versions match @zenithbuild/core exactly', () => {
        const coreManifest = JSON.parse(
            readFileSync(resolve(REPO_ROOT, 'packages/core/package.json'), 'utf8')
        );
        const coreVersion = String(coreManifest.version || '');
        expect(coreVersion).toMatch(/^0\.\d+\.\d+$/);

        const mismatches = [];
        for (const manifestRel of TRAIN_MANIFESTS) {
            const manifestPath = resolve(REPO_ROOT, manifestRel);
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));

            for (const field of INTERNAL_DEP_FIELDS) {
                const deps = pkg[field] && typeof pkg[field] === 'object' ? pkg[field] : {};
                for (const [name, version] of Object.entries(deps)) {
                    if (!name.startsWith('@zenithbuild/')) {
                        continue;
                    }
                    if (version !== coreVersion) {
                        mismatches.push(`${manifestRel} :: ${field} :: ${name}@${version} (expected ${coreVersion})`);
                    }
                }
            }
        }

        expect(mismatches).toEqual([]);
    });

    test('release train: scoped package manifests have no duplicate internal package versions', () => {
        const versionsByPackage = new Map();
        for (const manifestRel of TRAIN_MANIFESTS) {
            const manifestPath = resolve(REPO_ROOT, manifestRel);
            const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (!pkg || typeof pkg.name !== 'string' || !INTERNAL_PACKAGE_NAMES.includes(pkg.name)) {
                continue;
            }
            if (!versionsByPackage.has(pkg.name)) {
                versionsByPackage.set(pkg.name, new Set());
            }
            versionsByPackage.get(pkg.name).add(String(pkg.version || ''));
        }
        const duplicates = [];

        for (const name of INTERNAL_PACKAGE_NAMES) {
            const versions = [...(versionsByPackage.get(name) || new Set())];
            if (versions.length > 1) {
                duplicates.push(`${name}: ${versions.join(', ')}`);
            }
        }

        expect(duplicates).toEqual([]);
    });
});
