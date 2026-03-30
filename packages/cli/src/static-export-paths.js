import { resolveRequestRoute } from './server/resolve-request-route.js';

function skipWhitespace(source, start) {
    let index = start;
    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        if (source.startsWith('//', index)) {
            const nextLine = source.indexOf('\n', index + 2);
            return nextLine === -1 ? source.length : skipWhitespace(source, nextLine + 1);
        }
        if (source.startsWith('/*', index)) {
            const close = source.indexOf('*/', index + 2);
            if (close === -1) {
                throw new Error('[Zenith] Unterminated block comment in exportPaths literal.');
            }
            index = close + 2;
            continue;
        }
        break;
    }
    return index;
}

function parseQuotedStringLiteral(source, start, sourceFile) {
    const quote = source[start];
    if (quote !== '"' && quote !== '\'') {
        throw new Error(
            `[Zenith] ${sourceFile}: exportPaths must be a literal array of string paths.`
        );
    }

    let index = start + 1;
    let value = '';
    while (index < source.length) {
        const char = source[index];
        if (char === '\\') {
            const next = source[index + 1];
            if (next === undefined) {
                throw new Error(`[Zenith] ${sourceFile}: exportPaths contains an invalid escape sequence.`);
            }
            value += char + next;
            index += 2;
            continue;
        }
        if (char === quote) {
            try {
                return {
                    value: JSON.parse(`"${value.replace(/"/g, '\\"')}"`),
                    nextIndex: index + 1
                };
            } catch {
                throw new Error(`[Zenith] ${sourceFile}: exportPaths contains an invalid string literal.`);
            }
        }
        if (char === '\n' || char === '\r') {
            throw new Error(`[Zenith] ${sourceFile}: exportPaths string literals must stay on one line.`);
        }
        value += char;
        index += 1;
    }

    throw new Error(`[Zenith] ${sourceFile}: exportPaths contains an unterminated string literal.`);
}

function parseStringArrayLiteral(source, start, sourceFile) {
    if (source[start] !== '[') {
        throw new Error(
            `[Zenith] ${sourceFile}: exportPaths must be assigned a literal array of string paths.`
        );
    }

    const values = [];
    let index = start + 1;
    while (index < source.length) {
        index = skipWhitespace(source, index);
        if (source[index] === ']') {
            return { values, nextIndex: index + 1 };
        }

        const parsed = parseQuotedStringLiteral(source, index, sourceFile);
        values.push(parsed.value);
        index = skipWhitespace(source, parsed.nextIndex);

        if (source[index] === ',') {
            index += 1;
            continue;
        }
        if (source[index] === ']') {
            return { values, nextIndex: index + 1 };
        }

        throw new Error(
            `[Zenith] ${sourceFile}: exportPaths must be a comma-delimited literal array of string paths.`
        );
    }

    throw new Error(`[Zenith] ${sourceFile}: exportPaths array is missing a closing "]".`);
}

function normalizeConcretePath(value, sourceFile) {
    if (typeof value !== 'string') {
        throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must be strings.`);
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) {
        throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must start with "/".`);
    }
    if (trimmed.includes('://') || trimmed.startsWith('//')) {
        throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must be same-origin pathnames.`);
    }
    if (trimmed.includes('?') || trimmed.includes('#') || /[\r\n]/.test(trimmed)) {
        throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must be pathnames without query or hash.`);
    }

    const segments = trimmed
        .split('/')
        .filter(Boolean)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    for (const segment of segments) {
        if (segment === '.' || segment === '..') {
            throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must not contain path traversal segments.`);
        }
        if (segment.startsWith(':') || segment.startsWith('*')) {
            throw new Error(`[Zenith] ${sourceFile}: exportPaths entries must be concrete public URLs.`);
        }
    }

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function extractStaticExportPaths(source, sourceFile) {
    const match = /\bexport\s+const\s+exportPaths\b/.exec(String(source || ''));
    if (!match) {
        return null;
    }

    const equalsIndex = String(source || '').indexOf('=', match.index + match[0].length);
    if (equalsIndex === -1) {
        throw new Error(`[Zenith] ${sourceFile}: exportPaths must use the form export const exportPaths = [...].`);
    }

    const valueStart = skipWhitespace(String(source || ''), equalsIndex + 1);
    const { values } = parseStringArrayLiteral(String(source || ''), valueStart, sourceFile);
    return values.map((value) => normalizeConcretePath(value, sourceFile));
}

export function validateStaticExportPaths(routePath, exportPaths, sourceFile) {
    if (!Array.isArray(exportPaths)) {
        return [];
    }

    const deduped = [];
    const seen = new Set();
    for (const rawPath of exportPaths) {
        const concretePath = normalizeConcretePath(rawPath, sourceFile);
        if (seen.has(concretePath)) {
            throw new Error(`[Zenith] ${sourceFile}: exportPaths contains a duplicate path "${concretePath}".`);
        }
        seen.add(concretePath);
        const resolved = resolveRequestRoute(new URL(concretePath, 'http://localhost'), [{ path: routePath }]);
        if (!resolved.matched || resolved.route?.path !== routePath) {
            throw new Error(
                `[Zenith] ${sourceFile}: exportPaths entry "${concretePath}" does not match route "${routePath}".`
            );
        }
        deduped.push(concretePath);
    }
    return deduped;
}

export function toStaticHtmlFilePath(pathname) {
    const normalized = normalizeConcretePath(pathname, 'static-export');
    if (normalized === '/') {
        return 'index.html';
    }
    const relativePath = normalized.replace(/^\//, '');
    if (/\.[a-zA-Z0-9]+$/.test(relativePath)) {
        return relativePath;
    }
    return `${relativePath}/index.html`;
}
