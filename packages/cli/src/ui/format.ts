import pc from 'picocolors';
import { relative, sep } from 'node:path';
import type { UiMode } from './env.js';

type FormatTag = keyof typeof TAG_COLORS | string;

interface SummaryRow {
    label?: unknown;
    value?: unknown;
}

const DEFAULT_PHASE = 'cli';
const DEFAULT_FILE = '.';
const DEFAULT_HINT_BASE = 'https://github.com/zenithbuild/framework/blob/master/packages/cli/CLI_CONTRACT.md';
const PREFIX = '[zenith]';
const TAG_WIDTH = 6;

const TAG_COLORS = {
    DEV: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.cyan(value),
    BUILD: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.blue(value),
    HMR: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.magenta(value),
    ROUTER: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.cyan(value),
    CSS: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.yellow(value),
    OK: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.green(value),
    WARN: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.bold(colors.yellow(value)),
    ERR: (colors: ReturnType<typeof pc.createColors>, value: string) => colors.bold(colors.red(value))
};

function getColors(mode: UiMode): ReturnType<typeof pc.createColors> {
    return pc.createColors(Boolean(mode.color));
}

export function formatPrefix(mode: UiMode): string {
    return mode.color ? getColors(mode).dim(PREFIX) : PREFIX;
}

function colorizeTag(mode: UiMode, tag: FormatTag): string {
    const padded = String(tag || '').padEnd(TAG_WIDTH, ' ');
    if (!mode.color) {
        return padded;
    }
    const colors = getColors(mode);
    const colorizer = TAG_COLORS[tag as keyof typeof TAG_COLORS] || ((_colors: typeof colors, value: string) => colors.white(value));
    return colorizer(colors, padded);
}

function colorizeGlyph(mode: UiMode, glyph: string, tag: FormatTag): string {
    if (!mode.color) {
        return glyph;
    }
    const colors = getColors(mode);
    const colorizer = TAG_COLORS[tag as keyof typeof TAG_COLORS] || ((_colors: typeof colors, value: string) => value);
    return colorizer(colors, glyph);
}

export function formatLine(mode: UiMode, { glyph = '•', tag = 'DEV', text = '' }: { glyph?: string; tag?: FormatTag; text?: unknown }): string {
    return `${formatPrefix(mode)} ${colorizeGlyph(mode, glyph, tag)} ${colorizeTag(mode, tag)} ${String(text || '')}`;
}

export function formatStep(mode: UiMode, text: unknown, tag: FormatTag = 'BUILD'): string {
    return formatLine(mode, { glyph: '•', tag, text });
}

export function formatHint(mode: UiMode, text: unknown): string {
    const body = `          hint: ${String(text || '').trim()}`;
    return mode.color ? getColors(mode).dim(body) : body;
}

export function formatHeading(mode: UiMode, text: unknown): string {
    const label = mode.color ? getColors(mode).bold('Zenith CLI') : 'Zenith CLI';
    return `${label} ${String(text || '').trim()}`.trim();
}

export function formatSummaryTable(mode: UiMode, rows: SummaryRow[], tag: FormatTag = 'BUILD'): string {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '';
    }
    return rows
        .map((row) => formatLine(mode, {
            glyph: '•',
            tag,
            text: `${String(row.label || '')}: ${String(row.value || '')}`
        }))
        .join('\n');
}

export function sanitizeErrorMessage(input: unknown): string {
    return String(input ?? '')
        .replace(/\r/g, '')
        .trim();
}

function normalizeFileLinePath(line: string): string {
    const match = line.match(/^(\s*File:\s+)(.+)$/);
    if (!match) {
        return line;
    }

    const prefix = match[1];
    const filePath = match[2].trim();
    const normalized = normalizePathForDisplay(filePath);
    return `${prefix}${normalized}`;
}

function normalizePathForDisplay(filePath: string): string {
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

function inferPhaseFromArgv(): string {
    const knownPhases = new Set(['build', 'dev', 'preview']);
    for (const arg of process.argv.slice(2)) {
        if (knownPhases.has(arg)) {
            return arg;
        }
    }
    return DEFAULT_PHASE;
}

function extractFileFromMessage(message: string): string {
    const match = String(message || '').match(/\bFile:\s+([^\n]+)/);
    return match ? match[1].trim() : '';
}

function formatHintUrl(code: string): string {
    const slug = String(code || 'CLI_ERROR')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${DEFAULT_HINT_BASE}#${slug || 'cli-error'}`;
}

export function normalizeErrorMessagePaths(message: string): string {
    return String(message || '')
        .split('\n')
        .map((line) => normalizeFileLinePath(line))
        .join('\n');
}

export function normalizeError(err: unknown): Error {
    if (err instanceof Error) {
        return err;
    }
    return new Error(sanitizeErrorMessage(err));
}

function firstMeaningfulLine(text: string): string {
    return String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) || '';
}

export function formatErrorBlock(err: unknown, mode: UiMode): string {
    const normalized = normalizeError(err);
    const maybe = normalized as Error & {
        code?: unknown;
        phase?: unknown;
        kind?: unknown;
        file?: unknown;
        hint?: unknown;
    };
    const phase = maybe.phase ? sanitizeErrorMessage(maybe.phase) : inferPhaseFromArgv();
    const code = maybe.code
        ? sanitizeErrorMessage(maybe.code)
        : `${phase.toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'CLI'}_FAILED`;
    const rawMessage = sanitizeErrorMessage(normalized.message || String(normalized));
    const message = normalizeErrorMessagePaths(rawMessage);
    const compactMessage = firstMeaningfulLine(message) || 'Command failed';
    const file = normalizePathForDisplay(
        sanitizeErrorMessage(maybe.file || extractFileFromMessage(message) || DEFAULT_FILE)
    );
    const hint = sanitizeErrorMessage(maybe.hint || formatHintUrl(code));

    if (mode.logLevel !== 'verbose' && !mode.debug) {
        return [
            formatLine(mode, { glyph: '✖', tag: 'ERR', text: compactMessage }),
            formatHint(mode, hint)
        ].join('\n');
    }

    const lines: string[] = [];
    lines.push(formatLine(mode, { glyph: '✖', tag: 'ERR', text: compactMessage }));
    lines.push(formatHint(mode, hint || formatHintUrl(code)));
    lines.push(`${formatPrefix(mode)}     code: ${code || 'CLI_FAILED'}`);
    lines.push(`${formatPrefix(mode)}     phase: ${phase || DEFAULT_PHASE}`);
    lines.push(`${formatPrefix(mode)}     file: ${file || DEFAULT_FILE}`);
    lines.push(`${formatPrefix(mode)}     detail: ${message}`);

    if (mode.debug && normalized.stack) {
        lines.push(`${formatPrefix(mode)}     stack:`);
        lines.push(...String(normalized.stack).split('\n').slice(0, 20));
    }

    return lines.join('\n');
}

export function containsAnsi(value: unknown): boolean {
    return /\x1b\[[0-9;]*m/.test(String(value || ''));
}
