import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('publish surface matrix coverage normalizes Windows-style manifest candidate paths', () => {
    const matrix = [
        {
            dir: 'packages/compiler-win32-x64',
            name: '@zenithbuild/compiler-win32-x64',
            stage: 'platform',
            requiredPackFiles: ['bin/zenith-compiler.exe']
        }
    ];

    assert.doesNotThrow(() =>
        assertPublishSurfaceMatrixCoverage({
            matrix,
            manifestEntries: [
                {
                    dir: 'packages\\compiler-win32-x64',
                    name: '@zenithbuild/compiler-win32-x64'
                }
            ]
        })
    );
});

test('framework and scaffolder selections resolve from one matrix', () => {
    const framework = selectPublishMatrixEntries({ selection: 'framework' });
    const scaffolder = selectPublishMatrixEntries({ selection: 'scaffolder' });

    assert.equal(framework.length, 15);
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

test('framework release selection excludes standalone-owned editor packages', () => {
    const releaseDirs = selectPublishMatrixEntries({ selection: 'release' }).map((entry) => entry.dir);
    const frameworkDirs = selectPublishMatrixEntries({ selection: 'framework' }).map((entry) => entry.dir);
    const allDirs = selectPublishMatrixEntries({ selection: 'all' }).map((entry) => entry.dir);
    const languagePackage = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/language/package.json'), 'utf8'));
    const languageServerPackage = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/language-server/package.json'), 'utf8'));

    assert.deepEqual(releaseDirs, [
        'packages/bundler',
        'packages/compiler',
        'packages/runtime',
        'packages/router',
        'packages/core',
        'packages/cli',
        'packages/zenithbuild'
    ]);
    assert.equal(languagePackage.private, true);
    assert.equal(languageServerPackage.private, true);
    assert.equal(frameworkDirs.includes('packages/language-server'), false);
    assert.equal(frameworkDirs.includes('packages/language'), false);
    assert.equal(allDirs.includes('packages/language-server'), false);
    assert.equal(allDirs.includes('packages/language'), false);
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

test('verifyPublishSurface reports npm pack failures even when stdio is omitted', () => {
    const root = makeTempRoot('zenith-publish-surface-pack-fail-');
    const matrix = [
        {
            dir: 'packages/windows-only',
            name: '@acme/windows-only',
            stage: 'platform',
            requiredPackFiles: ['bin/example.exe']
        }
    ];

    try {
        createPackage(
            root,
            'packages/windows-only',
            {
                name: '@acme/windows-only',
                version: '1.0.0',
                files: ['bin', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'bin/example.exe': 'not-a-real-binary\n'
            }
        );

        assert.throws(
            () =>
                verifyPublishSurface({
                    root,
                    matrix,
                    selection: 'platform',
                    spawn: () => ({
                        status: 1,
                        stdout: undefined,
                        stderr: undefined,
                        error: new Error('spawn failed')
                    })
                }),
            /npm pack --dry-run failed for packages\/windows-only[\s\S]*error:\nspawn failed[\s\S]*stdout:\n[\s\S]*stderr:\n/
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('verifyPublishSurface uses shell mode for npm pack on win32', () => {
    const root = makeTempRoot('zenith-publish-surface-win-shell-');
    const matrix = [
        {
            dir: 'packages/windows-shell',
            name: '@acme/windows-shell',
            stage: 'platform',
            requiredPackFiles: ['bin/example.exe']
        }
    ];
    let observedShell = null;

    try {
        createPackage(
            root,
            'packages/windows-shell',
            {
                name: '@acme/windows-shell',
                version: '1.0.0',
                files: ['bin', 'package.json'],
                repository: {
                    type: 'git',
                    url: 'https://github.com/zenithbuild/framework'
                }
            },
            {
                'bin/example.exe': 'not-a-real-binary\n'
            }
        );

        verifyPublishSurface({
            root,
            matrix,
            selection: 'platform',
            npmBin: 'npm.cmd',
            platform: 'win32',
            spawn: (_command, _args, options) => {
                observedShell = options.shell;
                return {
                    status: 0,
                    stdout: JSON.stringify([
                        {
                            files: [
                                { path: 'package.json' },
                                { path: 'bin/example.exe' }
                            ]
                        }
                    ]),
                    stderr: ''
                };
            }
        });

        assert.equal(observedShell, true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('matrix stays aligned with expected publish targets', () => {
    assert.equal(PUBLISH_SURFACE_MATRIX.length, 16);
});
