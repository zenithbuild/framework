function isNameStart(ch) {
    return /[A-Z]/.test(ch);
}

function isNameChar(ch) {
    return /[a-zA-Z0-9]/.test(ch);
}

export function isInsideExpressionScope(source, index) {
    let depth = 0;
    let mode = 'code';
    let escaped = false;
    const lower = source.toLowerCase();

    for (let i = 0; i < index; i++) {
        if (mode === 'code') {
            if (lower.startsWith('<script', i)) {
                const close = lower.indexOf('</script>', i + 7);
                if (close < 0 || close >= index) {
                    return false;
                }
                i = close + '</script>'.length - 1;
                continue;
            }
            if (lower.startsWith('<style', i)) {
                const close = lower.indexOf('</style>', i + 6);
                if (close < 0 || close >= index) {
                    return false;
                }
                i = close + '</style>'.length - 1;
                continue;
            }
        }

        const ch = source[i];
        const next = i + 1 < index ? source[i + 1] : '';

        if (mode === 'line-comment') {
            if (ch === '\n') {
                mode = 'code';
            }
            continue;
        }
        if (mode === 'block-comment') {
            if (ch === '*' && next === '/') {
                mode = 'code';
                i += 1;
            }
            continue;
        }
        if (mode === 'single-quote' || mode === 'double-quote' || mode === 'template') {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (
                (mode === 'single-quote' && ch === "'") ||
                (mode === 'double-quote' && ch === '"') ||
                (mode === 'template' && ch === '`')
            ) {
                mode = 'code';
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            mode = 'line-comment';
            i += 1;
            continue;
        }
        if (ch === '/' && next === '*') {
            mode = 'block-comment';
            i += 1;
            continue;
        }
        if (ch === "'") {
            mode = 'single-quote';
            continue;
        }
        if (ch === '"') {
            mode = 'double-quote';
            continue;
        }
        if (ch === '`') {
            mode = 'template';
            continue;
        }
        if (ch === '{') {
            depth += 1;
            continue;
        }
        if (ch === '}') {
            depth = Math.max(0, depth - 1);
        }
    }

    return depth > 0;
}

function parseComponentTagAt(source, index) {
    if (source[index] !== '<') {
        return null;
    }

    let cursor = index + 1;
    let isClose = false;
    if (source[cursor] === '/') {
        isClose = true;
        cursor += 1;
    }

    const nameStart = cursor;
    if (!isNameStart(source[cursor] || '')) {
        return null;
    }
    cursor += 1;
    while (isNameChar(source[cursor] || '')) {
        cursor += 1;
    }

    const name = source.slice(nameStart, cursor);
    const attrStart = cursor;
    let mode = 'code';
    let escaped = false;
    let exprDepth = 0;

    for (; cursor < source.length; cursor += 1) {
        const ch = source[cursor];
        const next = source[cursor + 1] || '';

        if (mode === 'line-comment') {
            if (ch === '\n') {
                mode = 'code';
            }
            continue;
        }
        if (mode === 'block-comment') {
            if (ch === '*' && next === '/') {
                mode = 'code';
                cursor += 1;
            }
            continue;
        }
        if (mode === 'single-quote' || mode === 'double-quote' || mode === 'template') {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (
                (mode === 'single-quote' && ch === "'") ||
                (mode === 'double-quote' && ch === '"') ||
                (mode === 'template' && ch === '`')
            ) {
                mode = 'code';
            }
            continue;
        }

        if (exprDepth > 0 && ch === '/' && next === '/') {
            mode = 'line-comment';
            cursor += 1;
            continue;
        }
        if (exprDepth > 0 && ch === '/' && next === '*') {
            mode = 'block-comment';
            cursor += 1;
            continue;
        }
        if (ch === "'") {
            mode = 'single-quote';
            continue;
        }
        if (ch === '"') {
            mode = 'double-quote';
            continue;
        }
        if (ch === '`') {
            mode = 'template';
            continue;
        }
        if (ch === '{') {
            exprDepth += 1;
            continue;
        }
        if (ch === '}') {
            exprDepth = Math.max(0, exprDepth - 1);
            continue;
        }
        if (exprDepth === 0 && ch === '>') {
            const rawAttrs = source.slice(attrStart, cursor);
            const trimmed = rawAttrs.trimEnd();
            const selfClosing = !isClose && trimmed.endsWith('/');
            const attrs = selfClosing ? trimmed.slice(0, -1) : rawAttrs;
            return {
                name,
                attrs,
                start: index,
                end: cursor + 1,
                isClose,
                selfClosing
            };
        }
    }

    return null;
}

export function findNextKnownComponentTag(source, registry, startIndex = 0) {
    for (let index = startIndex; index < source.length; index += 1) {
        if (source[index] !== '<') {
            continue;
        }
        const tag = parseComponentTagAt(source, index);
        if (!tag || tag.isClose || !registry.has(tag.name)) {
            continue;
        }
        if (isInsideExpressionScope(source, index)) {
            continue;
        }
        return tag;
    }
    return null;
}

export function findMatchingComponentClose(source, tagName, startAfterOpen) {
    let depth = 1;

    for (let index = startAfterOpen; index < source.length; index += 1) {
        if (source[index] !== '<') {
            continue;
        }
        const tag = parseComponentTagAt(source, index);
        if (!tag || tag.name !== tagName) {
            continue;
        }
        if (isInsideExpressionScope(source, index)) {
            continue;
        }
        if (tag.isClose) {
            depth -= 1;
            if (depth === 0) {
                return {
                    contentEnd: index,
                    tagEnd: tag.end
                };
            }
            continue;
        }
        if (!tag.selfClosing) {
            depth += 1;
        }
    }

    return null;
}
