import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    readCliPackageVersion,
    readInstalledPackageVersion,
    readWorkspacePackageVersion,
    resolveBundlerBin
} from './toolchain-paths.js';

type PackageKey = 'core' | 'compiler' | 'runtime' | 'router' | 'bundlerPackage';
type CompatibilityStatus = 'ok' | 'warn';
type DifferenceKind = 'unknown' | 'exact' | 'hard' | 'soft';

interface ParsedVersion {
    raw: string;
    major: number;
    minor: number;
    patch: number;
    prerelease: string;
    prereleaseParts: string[];
}

interface ProjectManifest {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface BundlerVersionResult {
    version: string | null;
    path: string;
    rawOutput: string;
    ok: boolean;
}

interface VersionIssue {
    code: string;
    summary: string;
    message: string;
    hint: string;
    fixCommand: string;
}

export type ZenithVersions = Record<PackageKey, string | null> & {
    cli: string;
    projectCli: string | null;
    bundlerBinary: string | null;
    bundlerBinPath: string;
    bundlerBinRawOutput: string;
    targetVersion: string | null;
    projectRoot?: string | null;
};

interface CompatibilityResult {
    status: CompatibilityStatus;
    issues: VersionIssue[];
    details: {
        targetVersion: string;
        versions: Record<string, unknown>;
        summary: string;
    };
}

interface VersionCheckLogger {
    warn: (message: string, options?: { onceKey?: string; hint?: string }) => void;
    verbose: (tag: string, message: string) => void;
}

const PACKAGE_KEYS: ReadonlyArray<readonly [PackageKey, string]> = [
    ['core', '@zenithbuild/core'],
    ['compiler', '@zenithbuild/compiler'],
    ['runtime', '@zenithbuild/runtime'],
    ['router', '@zenithbuild/router'],
    ['bundlerPackage', '@zenithbuild/bundler']
];

function parseVersion(version: string | null | undefined): ParsedVersion | null {
    const raw = String(version || '').trim();
    const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!match) {
        return null;
    }
    return {
        raw,
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4] || '',
        prereleaseParts: match[4] ? match[4].split('.') : []
    };
}

function compareIdentifiers(left: string, right: string): number {
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
        return Number(left) - Number(right);
    }
    if (leftNumeric) {
        return -1;
    }
    if (rightNumeric) {
        return 1;
    }
    return left.localeCompare(right);
}

export function compareVersions(leftVersion: string | null | undefined, rightVersion: string | null | undefined): number {
    const left = parseVersion(leftVersion);
    const right = parseVersion(rightVersion);
    if (!left && !right) return 0;
    if (!left) return -1;
    if (!right) return 1;

    const numberDelta = (
        (left.major - right.major)
        || (left.minor - right.minor)
        || (left.patch - right.patch)
    );
    if (numberDelta !== 0) {
        return numberDelta;
    }

    if (!left.prerelease && !right.prerelease) {
        return 0;
    }
    if (!left.prerelease) {
        return 1;
    }
    if (!right.prerelease) {
        return -1;
    }

    const len = Math.max(left.prereleaseParts.length, right.prereleaseParts.length);
    for (let index = 0; index < len; index += 1) {
        const leftPart = left.prereleaseParts[index];
        const rightPart = right.prereleaseParts[index];
        if (leftPart === undefined) {
            return -1;
        }
        if (rightPart === undefined) {
            return 1;
        }
        const delta = compareIdentifiers(leftPart, rightPart);
        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
}

function prereleaseChannel(parsed: ParsedVersion | null): string {
    if (!parsed || !parsed.prerelease) {
        return 'stable';
    }
    const [label = 'prerelease', train] = parsed.prereleaseParts;
    if (train && /^\d+$/.test(train)) {
        return `${label}.${train}`;
    }
    return label;
}

function classifyDifference(expectedVersion: string | null | undefined, actualVersion: string | null | undefined): DifferenceKind {
    if (!expectedVersion || !actualVersion) {
        return 'unknown';
    }
    if (expectedVersion === actualVersion) {
        return 'exact';
    }
    const expected = parseVersion(expectedVersion);
    const actual = parseVersion(actualVersion);
    if (!expected || !actual) {
        return 'unknown';
    }
    if (expected.major !== actual.major || expected.minor !== actual.minor) {
        return 'hard';
    }
    if (prereleaseChannel(expected) !== prereleaseChannel(actual)) {
        return 'hard';
    }
    return 'soft';
}

function readProjectPackage(projectRoot: string | null | undefined): ProjectManifest | null {
    if (!projectRoot) {
        return null;
    }
    try {
        const manifestPath = resolve(projectRoot, 'package.json');
        if (!existsSync(manifestPath)) {
            return null;
        }
        return JSON.parse(readFileSync(manifestPath, 'utf8')) as ProjectManifest;
    } catch {
        return null;
    }
}

function buildFixCommand(projectRoot: string | null | undefined, targetVersion: string): string {
    const manifest = readProjectPackage(projectRoot);
    const dependencyNames = [
        '@zenithbuild/core',
        '@zenithbuild/cli',
        '@zenithbuild/compiler',
        '@zenithbuild/runtime',
        '@zenithbuild/router',
        '@zenithbuild/bundler'
    ];

    const deps: string[] = [];
    const devDeps: string[] = [];
    for (const name of dependencyNames) {
        if (manifest?.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, name)) {
            deps.push(`${name}@${targetVersion}`);
            continue;
        }
        devDeps.push(`${name}@${targetVersion}`);
    }

    const commands: string[] = [];
    if (deps.length > 0) {
        commands.push(`npm i ${deps.join(' ')}`);
    }
    if (devDeps.length > 0) {
        commands.push(`npm i -D ${devDeps.join(' ')}`);
    }
    if (commands.length === 0) {
        commands.push(`npm i -D ${dependencyNames.map((name) => `${name}@${targetVersion}`).join(' ')}`);
    }
    return commands.join(' && ');
}

function describeVersions(versions: Partial<ZenithVersions>): string {
    const entries: Array<[string, string | null | undefined]> = [
        ['cli', versions.cli],
        ['project cli', versions.projectCli],
        ['core', versions.core],
        ['compiler', versions.compiler],
        ['runtime', versions.runtime],
        ['router', versions.router],
        ['bundler pkg', versions.bundlerPackage],
        ['bundler bin', versions.bundlerBinary]
    ];
    return entries
        .filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0)
        .map(([label, version]) => `${label}=${version}`)
        .join(' ');
}

function summarizeIssues(issues: VersionIssue[]): string {
    const preview = issues.slice(0, 3).map((issue) => issue.summary);
    const suffix = issues.length > 3 ? ` +${issues.length - 3} more` : '';
    return `${preview.join('; ')}${suffix}`;
}

function determineTargetVersion(versions: Partial<ZenithVersions>): string {
    const candidates = [
        versions.projectCli,
        versions.core,
        versions.compiler,
        versions.runtime,
        versions.router,
        versions.bundlerPackage,
        versions.cli
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (candidates.length === 0) {
        return '0.0.0';
    }

    let highest = candidates[0];
    for (const candidate of candidates.slice(1)) {
        if (compareVersions(candidate, highest) > 0) {
            highest = candidate;
        }
    }
    return highest;
}

export function getBundlerVersion(bundlerBinPath: string | null | undefined): BundlerVersionResult {
    const path = String(bundlerBinPath || '').trim();
    if (!path) {
        return { version: null, path: '', rawOutput: '', ok: false };
    }
    const result = spawnSync(path, ['--version'], { encoding: 'utf8' });
    if (result.error) {
        return {
            version: null,
            path,
            rawOutput: result.error.message,
            ok: false
        };
    }

    const rawOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const versionMatch = rawOutput.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
    return {
        version: versionMatch ? versionMatch[1] : null,
        path,
        rawOutput,
        ok: result.status === 0 && Boolean(versionMatch)
    };
}

export function getLocalZenithVersions(
    {
        projectRoot,
        bundlerBinPath,
        preferWorkspacePackageVersions = false
    }: {
        projectRoot?: string | null;
        bundlerBinPath?: string | null;
        preferWorkspacePackageVersions?: boolean;
    } = {}
): ZenithVersions {
    const resolvedBundlerBin = bundlerBinPath || resolveBundlerBin(projectRoot ?? null);
    const bundlerVersion = getBundlerVersion(resolvedBundlerBin);
    const readPackageVersion = (packageName: string): string | null => {
        if (preferWorkspacePackageVersions) {
            return readWorkspacePackageVersion(packageName) || readInstalledPackageVersion(packageName, projectRoot ?? null);
        }
        return readInstalledPackageVersion(packageName, projectRoot ?? null);
    };
    const versions: ZenithVersions = {
        cli: readCliPackageVersion(),
        projectCli: readPackageVersion('@zenithbuild/cli'),
        core: null,
        compiler: null,
        runtime: null,
        router: null,
        bundlerPackage: null,
        bundlerBinary: bundlerVersion.version,
        bundlerBinPath: bundlerVersion.path,
        bundlerBinRawOutput: bundlerVersion.rawOutput,
        targetVersion: null
    };

    for (const [key, packageName] of PACKAGE_KEYS) {
        versions[key] = readPackageVersion(packageName);
    }

    versions.targetVersion = determineTargetVersion(versions);
    return versions;
}

export function checkCompatibility(versions: Partial<ZenithVersions>): CompatibilityResult {
    const targetVersion = versions.targetVersion || determineTargetVersion(versions);
    const issues: VersionIssue[] = [];
    const fixCommand = buildFixCommand(versions.projectRoot, targetVersion);

    const addIssue = (code: string, summary: string, message: string): void => {
        issues.push({
            code,
            summary,
            message,
            hint: `${fixCommand}  (suppress with ZENITH_SKIP_VERSION_CHECK=1)`,
            fixCommand
        });
    };

    if (versions.projectCli && versions.cli && versions.projectCli !== versions.cli) {
        const severity = classifyDifference(versions.projectCli, versions.cli);
        addIssue(
            severity === 'hard' ? 'CLI_TRAIN_MISMATCH' : 'CLI_OUTDATED',
            `cli ${versions.cli} != project ${versions.projectCli}`,
            `Version mismatch detected (may break HMR/refs): executing CLI ${versions.cli} does not match project CLI ${versions.projectCli}.`
        );
    }

    for (const [key, label] of [
        ['core', 'core'],
        ['compiler', 'compiler'],
        ['runtime', 'runtime'],
        ['router', 'router'],
        ['bundlerPackage', 'bundler package']
    ] as const) {
        const actual = versions[key] ?? null;
        const difference = classifyDifference(targetVersion, actual);
        if (difference === 'hard') {
            addIssue(
                'VERSION_TRAIN_MISMATCH',
                `${label} ${actual} != ${targetVersion}`,
                `Version mismatch detected (may break HMR/refs): ${label} ${actual} is on a different Zenith train than ${targetVersion}.`
            );
        } else if (difference === 'soft') {
            addIssue(
                'VERSION_OUTDATED',
                `${label} ${actual} != ${targetVersion}`,
                `Version mismatch detected (may break HMR/refs): ${label} ${actual} is not aligned with ${targetVersion}.`
            );
        }
    }

    const bundlerExpected = versions.bundlerPackage || targetVersion;
    const bundlerDifference = classifyDifference(bundlerExpected, versions.bundlerBinary);
    if (bundlerDifference === 'hard') {
        addIssue(
            'BUNDLER_BINARY_MISMATCH',
            `bundler bin ${versions.bundlerBinary || 'missing'} != ${bundlerExpected}`,
            `Version mismatch detected (may break build/IR contracts): bundler binary ${versions.bundlerBinary || 'missing'} does not match ${bundlerExpected}.`
        );
    } else if (bundlerDifference === 'soft') {
        addIssue(
            'BUNDLER_BINARY_OUTDATED',
            `bundler bin ${versions.bundlerBinary} != ${bundlerExpected}`,
            `Version mismatch detected (may break build/IR contracts): bundler binary ${versions.bundlerBinary} is not aligned with ${bundlerExpected}.`
        );
    }

    return {
        status: issues.length === 0 ? 'ok' : 'warn',
        issues,
        details: {
            targetVersion,
            versions: {
                ...versions
            },
            summary: describeVersions(versions)
        }
    };
}

export async function maybeWarnAboutZenithVersionMismatch(
    {
        projectRoot,
        logger,
        command = 'build',
        bundlerBinPath = null
    }: {
        projectRoot?: string | null;
        logger?: VersionCheckLogger | null;
        command?: string;
        bundlerBinPath?: string | null;
    } = {}
): Promise<CompatibilityResult> {
    if (!logger || process.env.ZENITH_SKIP_VERSION_CHECK === '1') {
        return { status: 'ok', issues: [], details: { targetVersion: '0.0.0', versions: {}, summary: '' } };
    }

    const preferWorkspacePackageVersions = process.env.ZENITH_PREFER_WORKSPACE_PACKAGES === '1';
    const versions = getLocalZenithVersions({ projectRoot, bundlerBinPath, preferWorkspacePackageVersions });
    versions.projectRoot = projectRoot ?? null;
    const result = checkCompatibility(versions);
    const onceKey = `zenith-version-check:${describeVersions(versions)}:${result.status}`;
    const verboseTag = command === 'dev' ? 'DEV' : 'BUILD';

    if (result.status === 'ok') {
        logger.verbose(verboseTag, `toolchain versions ok ${result.details.summary}`);
        return result;
    }

    const primary = result.issues[0];
    logger.warn(
        `${primary.message} ${summarizeIssues(result.issues)}`,
        {
            onceKey,
            hint: primary.hint
        }
    );
    logger.verbose(verboseTag, `toolchain versions ${result.details.summary}`);
    if (versions.bundlerBinPath) {
        logger.verbose(verboseTag, `bundler bin path=${versions.bundlerBinPath}`);
    }
    return result;
}
