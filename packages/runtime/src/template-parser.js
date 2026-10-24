export function _rewriteMarkupLiterals(expression) {
    let out = '';
    let index = 0;
    let quote = null;
    let escaped = false;

    while (index < expression.length) {
        const ch = expression[index];

        if (quote) {
            out += ch;
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            out += ch;
            index += 1;
            continue;
        }

        if (ch === '<') {
            const markup = _readMarkupLiteral(expression, index);
            if (markup) {
                out += `__zenith_fragment${_markupLiteralToTemplate(markup.value)}`;
                index = markup.end;
                continue;
            }
        }

        out += ch;
        index += 1;
    }

    return out;
}

function _readMarkupLiteral(source, start) {
    if (source[start] !== '<') {
        return null;
    }

    const firstTag = _readTagToken(source, start);
    if (!firstTag || firstTag.isClosing) {
        return null;
    }
    if (firstTag.selfClosing) {
        return {
            value: source.slice(start, firstTag.end),
            end: firstTag.end
        };
    }

    const stack = [firstTag.name];
    let cursor = firstTag.end;

    while (cursor < source.length) {
        const nextLt = source.indexOf('<', cursor);
        if (nextLt < 0) {
            return null;
        }
        const token = _readTagToken(source, nextLt);
        if (!token) {
            cursor = nextLt + 1;
            continue;
        }
        cursor = token.end;

        if (token.selfClosing) {
            continue;
        }

        if (token.isClosing) {
            const expected = stack[stack.length - 1];
            if (token.name !== expected) {
                return null;
            }
            stack.pop();
            if (stack.length === 0) {
                return {
                    value: source.slice(start, token.end),
                    end: token.end
                };
            }
            continue;
        }

        stack.push(token.name);
    }

    return null;
}

function _readTagToken(source, start) {
    if (source[start] !== '<') {
        return null;
    }
    let index = start + 1;
    let isClosing = false;

    if (index < source.length && source[index] === '/') {
        isClosing = true;
        index += 1;
    }

    if (index >= source.length || !/[A-Za-z_]/.test(source[index])) {
        return null;
    }

    const nameStart = index;
    while (index < source.length && /[A-Za-z0-9:_-]/.test(source[index])) {
        index += 1;
    }
    if (index === nameStart) {
        return null;
    }
    const name = source.slice(nameStart, index);

    let quote = null;
    let escaped = false;
    let braceDepth = 0;
    while (index < source.length) {
        const ch = source[index];
        if (quote) {
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            index += 1;
            continue;
        }
        if (ch === '{') {
            braceDepth += 1;
            index += 1;
            continue;
        }
        if (ch === '}') {
            braceDepth = Math.max(0, braceDepth - 1);
            index += 1;
            continue;
        }
        if (ch === '>' && braceDepth === 0) {
            const segment = source.slice(start, index + 1);
            const selfClosing = !isClosing && /\/\s*>$/.test(segment);
            return { name, isClosing, selfClosing, end: index + 1 };
        }
        index += 1;
    }

    return null;
}

function _markupLiteralToTemplate(markup) {
    let out = '`';
    let index = 0;
    while (index < markup.length) {
        const ch = markup[index];
        if (ch === '{') {
            const segment = _readBalancedBraces(markup, index);
            if (segment) {
                if (_isAttributeExpressionStart(markup, index)) {
                    out += '"${' + segment.content + '}"';
                } else {
                    out += '${' + segment.content + '}';
                }
                index = segment.end;
                continue;
            }
        }
        if (ch === '`') {
            out += '\\`';
            index += 1;
            continue;
        }
        if (ch === '\\') {
            out += '\\\\';
            index += 1;
            continue;
        }
        if (ch === '$' && markup[index + 1] === '{') {
            out += '\\${';
            index += 2;
            continue;
        }
        out += ch;
        index += 1;
    }
    out += '`';
    return out;
}

function _isAttributeExpressionStart(markup, start) {
    let cursor = start - 1;
    while (cursor >= 0) {
        const ch = markup[cursor];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            cursor -= 1;
            continue;
        }
        return ch === '=';
    }
    return false;
}

function _readBalancedBraces(source, start) {
    if (source[start] !== '{') {
        return null;
    }
    let depth = 1;
    let index = start + 1;
    let quote = null;
    let escaped = false;
    let content = '';

    while (index < source.length) {
        const ch = source[index];
        if (quote) {
            content += ch;
            if (escaped) {
                escaped = false;
                index += 1;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                index += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
            }
            index += 1;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            content += ch;
            index += 1;
            continue;
        }
        if (ch === '{') {
            depth += 1;
            content += ch;
            index += 1;
            continue;
        }
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return {
                    content,
                    end: index + 1
                };
            }
            content += ch;
            index += 1;
            continue;
        }
        content += ch;
        index += 1;
    }

    return null;
}
