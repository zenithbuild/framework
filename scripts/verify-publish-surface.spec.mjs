import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    PUBLISH_SURFACE_MATRIX,
    REPO_ROOT,
    assertPublishSurfaceMatrixCoverage,
    selectPublishMatrixEntries,
    verifyPublishSurface
} from './publish-surface-lib.mjs';

function makeTempRoot(prefix) {
    return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeFile(root, filePath, contents) {
    const absolutePath = path.join(root, filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
}

function createPackage(root, dir, pkg, files) {
    writeFile(root, path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    for (const [filePath, contents] of Object.entries(files)) {
        writeFile(root, path.join(dir, filePath), contents);
    }
}

test('publish surface matrix covers every top-level publishable package', () => {
    assert.doesNotThrow(() => assertPublishSurfaceMatrixCoverage({ root: REPO_ROOT }));
});

test('framework and scaffolder selections resolve from one matrix', () => {
    const framework = selectPublishMatrixEntries({ selection: 'framework' });
    const scaffolder = selectPublishMatrixEntries({ selection: 'scaffolder' });

    assert.equal(framework.length, 16);
    assert.equal(scaffolder.length, 1);
    assert.equal(scaffolder[0].dir, 'packages/create-zenith');
    assert.equal(framework.some((entry) => entry.dir === 'packages/create-zenith'), false);
    assert.deepEqual(
        selectPublishMatrixEntries({
            selection: 'framework',
            filter: 'packages/runtime,@zenithbuild/router'
        }).map((entry) => entry.dir),
        ['packages/runtime', 'packages/router']
    );
});

test('verifyPublishSurface passes for a valid package surface', () => {
    const root = makeTempRoot('zenith-publish-surface-pass-');
    const matrix = [
        {
            dir: 'packages/example',
            name: '@acme/example',
            stage: 'release',
            requiredPackFiles: ['dist/index.js', 'bin/example.js']
        }
    ];

    try {
        createPackage(
            root,
            'packages/example',
            {
                name: '@acme/example',
                version: '1.0.0',
                type: 'module',
                main: './dist/index.js',
                types: './dist/index.d.ts',
                exports: {
                    '.': './dist/index.js'
                },
                bin: {
                    example: 'bin/example.js'
                },
                files: ['dist', 'bin', 'README.md', 'LICENSE', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'dist/index.js': 'export const value = 1;\n',
                'dist/index.d.ts': 'export declare const value: number;\n',
                'bin/example.js': '#!/usr/bin/env node\nconsole.log("ok");\n',
                'README.md': '# example\n',
                'LICENSE': 'MIT\n'
            }
        );

        const results = verifyPublishSurface({
            root,
            matrix,
            selection: 'release'
        });

        assert.equal(results.length, 1);
        assert.equal(results[0].dir, 'packages/example');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('verifyPublishSurface fails when a publishable package is missing from the matrix', () => {
    const root = makeTempRoot('zenith-publish-surface-missing-');
    const matrix = [
        {
            dir: 'packages/covered',
            name: '@acme/covered',
            stage: 'release',
            requiredPackFiles: ['dist/index.js']
        }
    ];

    try {
        createPackage(
            root,
            'packages/covered',
            {
                name: '@acme/covered',
                version: '1.0.0',
                files: ['dist', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'dist/index.js': 'export {}\n'
            }
        );
        createPackage(
            root,
            'packages/untracked',
            {
                name: '@acme/untracked',
                version: '1.0.0',
                files: ['dist', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'dist/index.js': 'export {}\n'
            }
        );

        assert.throws(
            () => assertPublishSurfaceMatrixCoverage({ root, matrix }),
            /missing matrix entries: packages\/untracked \(@acme\/untracked\)/
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('verifyPublishSurface fails when manifest targets are not packed', () => {
    const root = makeTempRoot('zenith-publish-surface-target-');
    const matrix = [
        {
            dir: 'packages/broken',
            name: '@acme/broken',
            stage: 'release',
            requiredPackFiles: ['dist/index.js']
        }
    ];

    try {
        createPackage(
            root,
            'packages/broken',
            {
                name: '@acme/broken',
                version: '1.0.0',
                type: 'module',
                main: './dist/index.js',
                exports: {
                    '.': './dist/missing.js'
                },
                files: ['dist', 'README.md', 'LICENSE', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'dist/index.js': 'export const value = 1;\n',
                'README.md': '# broken\n',
                'LICENSE': 'MIT\n'
            }
        );

        assert.throws(
            () => verifyPublishSurface({ root, matrix, selection: 'release' }),
            /manifest target exports\.\. -> dist\/missing\.js missing from npm pack output/
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('matrix stays aligned with expected publish targets', () => {
    assert.equal(PUBLISH_SURFACE_MATRIX.length, 17);
});
