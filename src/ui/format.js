/**
 * Deterministic text formatters for CLI UX.
 */

import { relative, sep } from 'node:path';

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m'
};
const DEFAULT_PHASE = 'cli';
const DEFAULT_FILE = '.';
const DEFAULT_HINT_BASE = 'https://github.com/zenithbuild/zenith/blob/main/zenith-cli/CLI_CONTRACT.md';

function colorize(mode, token, text) {
    if (!mode.color) {
        return text;
    }
    return `${ANSI[token]}${text}${ANSI.reset}`;
}

export function formatHeading(mode, text) {
    const label = mode.plain ? 'ZENITH CLI' : colorize(mode, 'bold', 'Zenith CLI');
    return `${label} ${text}`.trim();
}

export function formatStep(mode, text) {
    if (mode.plain) {
        return `[zenith] INFO: ${text}`;
    }
    const bullet = colorize(mode, 'cyan', '•');
    return `[zenith] ${bullet} ${text}`;
}

export function formatSummaryTable(mode, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '';
    }
    const maxLabel = rows.reduce((acc, row) => Math.max(acc, String(row.label || '').length), 0);
    return rows
        .map((row) => {
            const label = String(row.label || '').padEnd(maxLabel, ' ');
            const value = String(row.value || '');
            return `[zenith] ${label} : ${value}`;
        })
        .join('\n');
}

export function sanitizeErrorMessage(input) {
    return String(input ?? '')
        .replace(/\r/g, '')
        .trim();
}

function normalizeFileLinePath(line) {
    const match = line.match(/^(\s*File:\s+)(.+)$/);
    if (!match) {
        return line;
    }

    const prefix = match[1];
    const filePath = match[2].trim();
    const normalized = normalizePathForDisplay(filePath);
    return `${prefix}${normalized}`;
}

function normalizePathForDisplay(filePath) {
    const value = String(filePath || '').trim();
    if (!value) {
        return DEFAULT_FILE;
    }
    if (!value.startsWith('/') && !/^[A-Za-z]:\\/.test(value)) {
        return value;
    }

    const cwd = process.cwd();
    const cwdWithSep = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;
    if (value === cwd) {
        return DEFAULT_FILE;
    }
    if (value.startsWith(cwdWithSep)) {
        const relativePath = relative(cwd, value).replaceAll('\\', '/');
        return relativePath || DEFAULT_FILE;
    }

    return value;
}

function inferPhaseFromArgv() {
    const knownPhases = new Set(['build', 'dev', 'preview']);
    for (const arg of process.argv.slice(2)) {
        if (knownPhases.has(arg)) {
            return arg;
        }
    }
    return DEFAULT_PHASE;
}

function extractFileFromMessage(message) {
    const match = String(message || '').match(/\bFile:\s+([^\n]+)/);
    return match ? match[1].trim() : '';
}

function formatHintUrl(code) {
    const slug = String(code || 'CLI_ERROR')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${DEFAULT_HINT_BASE}#${slug || 'cli-error'}`;
}

export function normalizeErrorMessagePaths(message) {
    return String(message || '')
        .split('\n')
        .map((line) => normalizeFileLinePath(line))
        .join('\n');
}

/**
 * @param {unknown} err
 */
export function normalizeError(err) {
    if (err instanceof Error) {
        return err;
    }
    return new Error(sanitizeErrorMessage(err));
}

/**
 * @param {unknown} err
 * @param {{ plain: boolean, color: boolean, debug: boolean }} mode
 */
export function formatErrorBlock(err, mode) {
    const normalized = normalizeError(err);
    const maybe = /** @type {{ code?: unknown, phase?: unknown, kind?: unknown, file?: unknown, hint?: unknown }} */ (normalized);
    const kind = sanitizeErrorMessage(maybe.kind || maybe.code || 'CLI_ERROR');
    const phase = maybe.phase ? sanitizeErrorMessage(maybe.phase) : inferPhaseFromArgv();
    const code = maybe.code
        ? sanitizeErrorMessage(maybe.code)
        : `${phase.toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'CLI'}_FAILED`;
    const rawMessage = sanitizeErrorMessage(normalized.message || String(normalized));
    const message = normalizeErrorMessagePaths(rawMessage);
    const file = normalizePathForDisplay(
        sanitizeErrorMessage(maybe.file || extractFileFromMessage(message) || DEFAULT_FILE)
    );
    const hint = sanitizeErrorMessage(maybe.hint || formatHintUrl(code));

    const lines = [];
    lines.push('[zenith] ERROR: Command failed');
    lines.push(`[zenith] Error Kind: ${kind}`);
    lines.push(`[zenith] Phase: ${phase || DEFAULT_PHASE}`);
    lines.push(`[zenith] Code: ${code || 'CLI_FAILED'}`);
    lines.push(`[zenith] File: ${file || DEFAULT_FILE}`);
    lines.push(`[zenith] Hint: ${hint || formatHintUrl(code)}`);
    lines.push(`[zenith] Message: ${message}`);

    if (mode.debug && normalized.stack) {
        lines.push('[zenith] Stack:');
        lines.push(...String(normalized.stack).split('\n').slice(0, 20));
    }

    return lines.join('\n');
}

export function containsAnsi(value) {
    return /\x1b\[[0-9;]*m/.test(String(value || ''));
}
