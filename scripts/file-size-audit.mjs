#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_ALLOWLIST = 'docs/maintainability/file-size-allowlist.json';
const DEFAULT_PRINT_LIMIT = 50;
const SOURCE_EXTENSIONS = new Set([
  '.rs',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.zen',
  '.css'
]);
const EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.zenith-output'
]);
const EXCLUDED_PATH_FRAGMENTS = [
  '/docs/public/',
  '/apps/benchmarks/results/',
  '/apps/benchmarks/.tmp/',
  '/apps/benchmarks/tmp/',
  '/packages/compiler/_legacy_v1/'
];

function parseArgs(argv) {
  const args = {
    allowlist: DEFAULT_ALLOWLIST,
    enforce: false,
    printLimit: DEFAULT_PRINT_LIMIT,
    maxLines: 500,
    includePathPrefixes: [],
    gitDiffBase: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allowlist') {
      args.allowlist = argv[i + 1] || args.allowlist;
      i += 1;
      continue;
    }
    if (arg === '--enforce') {
      args.enforce = true;
      continue;
    }
    if (arg === '--print-limit') {
      const parsed = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.printLimit = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--max-lines') {
      const parsed = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.maxLines = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--include-path-prefix') {
      const prefix = normalizeRel((argv[i + 1] || '').trim());
      if (prefix) {
        args.includePathPrefixes.push(prefix.endsWith('/') ? prefix : `${prefix}/`);
      }
      i += 1;
      continue;
    }
    if (arg === '--git-diff-base') {
      const base = (argv[i + 1] || '').trim();
      if (base) {
        args.gitDiffBase = base;
      }
      i += 1;
      continue;
    }
  }

  return args;
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join('/');
}

function classifyBand(lineCount) {
  if (lineCount <= 500) return '<=500';
  if (lineCount <= 800) return '501-800';
  if (lineCount <= 1200) return '801-1200';
  if (lineCount <= 2000) return '1201-2000';
  return '2001+';
}

function loadChangedFilesFromGit(baseRef) {
  const candidates = [];
  if (baseRef) {
    candidates.push(`${baseRef}...HEAD`);
  }
  candidates.push('HEAD~1..HEAD');

  let lastError = null;
  for (const range of candidates) {
    try {
      const output = execSync(`git diff --name-only --diff-filter=ACMR ${range}`, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const files = output
        .split(/\r?\n/)
        .map((line) => normalizeRel(line.trim()))
        .filter(Boolean);
      return {
        files: new Set(files),
        range
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to determine changed files from git diff (${lastError instanceof Error ? lastError.message : String(lastError)})`
  );
}

async function loadAllowlist(allowlistPath) {
  const absolutePath = path.resolve(ROOT, allowlistPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw);
  const allowlist = new Map();
  for (const entry of parsed.allowlist || []) {
    if (!entry || typeof entry.path !== 'string') continue;
    allowlist.set(entry.path, entry);
  }
  return { parsed, allowlist, absolutePath };
}

async function walk(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = normalizeRel(path.relative(ROOT, fullPath));
    if (EXCLUDED_PATH_FRAGMENTS.some((fragment) => `/${rel}/`.includes(fragment))) {
      continue;
    }
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      await walk(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push({ fullPath, relPath: rel });
  }
}

function countLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { parsed: allowlistDoc, allowlist, absolutePath: allowlistAbsolutePath } =
    await loadAllowlist(args.allowlist);

  const files = [];
  await walk(ROOT, files);

  const scanned = [];
  const bands = {
    '<=500': 0,
    '501-800': 0,
    '801-1200': 0,
    '1201-2000': 0,
    '2001+': 0
  };

  for (const file of files) {
    const source = await fs.readFile(file.fullPath, 'utf8');
    const lineCount = countLines(source);
    const band = classifyBand(lineCount);
    bands[band] += 1;
    scanned.push({
      ...file,
      lineCount,
      band
    });
  }

  scanned.sort((a, b) => b.lineCount - a.lineCount || a.relPath.localeCompare(b.relPath));

  let enforcementCandidates = scanned;
  if (args.includePathPrefixes.length > 0) {
    enforcementCandidates = enforcementCandidates.filter((entry) =>
      args.includePathPrefixes.some((prefix) => entry.relPath.startsWith(prefix))
    );
  }

  let changedFileInfo = null;
  if (args.gitDiffBase) {
    changedFileInfo = loadChangedFilesFromGit(args.gitDiffBase);
    enforcementCandidates = enforcementCandidates.filter((entry) =>
      changedFileInfo.files.has(entry.relPath)
    );
  }

  const overPreferred = scanned.filter((entry) => entry.lineCount > 500);
  const overLimit = enforcementCandidates.filter((entry) => entry.lineCount > args.maxLines);
  const violations = [];
  const allowlistedOverPreferred = [];
  for (const entry of overLimit) {
    const allowEntry = allowlist.get(entry.relPath);
    if (!allowEntry) {
      violations.push({
        ...entry,
        reason: 'not-allowlisted'
      });
      continue;
    }
    if (typeof allowEntry.maxLines === 'number' && entry.lineCount > allowEntry.maxLines) {
      violations.push({
        ...entry,
        reason: `allowlist-max-exceeded (${allowEntry.maxLines})`
      });
      continue;
    }
    allowlistedOverPreferred.push({
      ...entry,
      allowReason: String(allowEntry.reason || '')
    });
  }

  const policy = allowlistDoc.policy || {};
  console.log('[file-size-audit] policy');
  console.log(
    `[file-size-audit] preferred<=${policy.preferredMaxLines ?? 500} warning<=${policy.warningBandMaxLines ?? 800} split-default<=${policy.defaultSplitBandMaxLines ?? 1200} immediate>=${policy.immediateSplitMinLines ?? 1201}`
  );
  console.log(`[file-size-audit] allowlist: ${normalizeRel(path.relative(ROOT, allowlistAbsolutePath))}`);
  console.log(`[file-size-audit] scanned files: ${scanned.length}`);
  console.log(`[file-size-audit] bands <=500=${bands['<=500']} 501-800=${bands['501-800']} 801-1200=${bands['801-1200']} 1201-2000=${bands['1201-2000']} 2001+=${bands['2001+']}`);
  console.log(`[file-size-audit] enforce-threshold>${args.maxLines}`);
  if (args.includePathPrefixes.length > 0) {
    console.log(`[file-size-audit] enforce-prefixes=${args.includePathPrefixes.join(',')}`);
  }
  if (changedFileInfo) {
    console.log(`[file-size-audit] enforce-git-diff-range=${changedFileInfo.range}`);
    console.log(`[file-size-audit] changed-files-considered=${changedFileInfo.files.size}`);
  }
  console.log(
    `[file-size-audit] over-preferred=${overPreferred.length} over-limit=${overLimit.length} allowlisted-over-limit=${allowlistedOverPreferred.length} violations=${violations.length}`
  );

  if (violations.length > 0) {
    console.log(`[file-size-audit] violations (showing up to ${args.printLimit})`);
    for (const violation of violations.slice(0, args.printLimit)) {
      console.log(
        `  - ${violation.relPath} (${violation.lineCount} lines) [${violation.reason}]`
      );
    }
    if (violations.length > args.printLimit) {
      console.log(`  ... ${violations.length - args.printLimit} more`);
    }
  }

  if (!args.enforce) {
    console.log('[file-size-audit] report-only mode (non-blocking)');
    process.exit(0);
  }

  if (violations.length > 0) {
    console.error('[file-size-audit] enforcement failed: file-size policy violations found');
    process.exit(1);
  }

  console.log('[file-size-audit] enforcement passed');
}

main().catch((error) => {
  console.error(`[file-size-audit] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
