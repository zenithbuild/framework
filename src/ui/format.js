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
    if (!filePath.startsWith('/') && !/^[A-Za-z]:\\/.test(filePath)) {
        return line;
    }

    const cwd = process.cwd();
    const cwdWithSep = cwd.endsWith(sep) ? cwd : `${cwd}${sep}`;
    if (filePath === cwd) {
        return `${prefix}.`;
    }
    if (filePath.startsWith(cwdWithSep)) {
        const relativePath = relative(cwd, filePath).replaceAll('\\', '/');
        return `${prefix}${relativePath || '.'}`;
    }

    return line;
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
    const maybe = /** @type {{ code?: unknown, phase?: unknown, kind?: unknown }} */ (normalized);
    const kind = sanitizeErrorMessage(maybe.kind || maybe.code || 'CLI_ERROR');
    const phase = maybe.phase ? sanitizeErrorMessage(maybe.phase) : '';
    const code = maybe.code ? sanitizeErrorMessage(maybe.code) : '';
    const rawMessage = sanitizeErrorMessage(normalized.message || String(normalized));
    const message = normalizeErrorMessagePaths(rawMessage);

    const lines = [];
    lines.push('[zenith] ERROR: Command failed');
    lines.push(`[zenith] Error Kind: ${kind}`);
    if (phase) {
        lines.push(`[zenith] Phase: ${phase}`);
    }
    if (code) {
        lines.push(`[zenith] Code: ${code}`);
    }
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
