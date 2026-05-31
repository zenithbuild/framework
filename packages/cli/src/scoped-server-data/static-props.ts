import { createRequire } from 'node:module';
import {
    createScopedServerDiagnostic,
    SCOPED_SERVER_DIAGNOSTIC
} from './diagnostics.js';
import type {
    ScopedServerDiagnostic,
    ScopedServerStaticProps,
    ScopedServerStaticPropValue
} from './types.js';

type TypeScriptApi = typeof import('typescript');

interface AttrToken {
    name: string;
    valueKind: 'bare' | 'quoted' | 'expression';
    value?: string;
    quote?: string;
}

export interface ParseScopedComponentStaticPropsOptions {
    attrs: string;
    ownerKey: string;
    contextFile: string;
    occurrenceId?: string;
}

export interface ParseScopedComponentStaticPropsResult {
    props: ScopedServerStaticProps;
    diagnostics: ScopedServerDiagnostic[];
}

const PACKAGE_REQUIRE = createRequire(import.meta.url);
let TYPESCRIPT_API: TypeScriptApi | null | undefined;

export function parseScopedComponentStaticProps(
    options: ParseScopedComponentStaticPropsOptions
): ParseScopedComponentStaticPropsResult {
    const props: ScopedServerStaticProps = {};
    const diagnostics: ScopedServerDiagnostic[] = [];
    const attrs = String(options.attrs || '').trim();
    if (!attrs) {
        return { props, diagnostics };
    }

    let tokens: AttrToken[];
    try {
        tokens = tokenizeAttrs(attrs);
    } catch (error) {
        diagnostics.push(createUnsupportedPropDiagnostic(
            options,
            null,
            error instanceof Error ? error.message : 'attribute syntax is unsupported'
        ));
        return { props, diagnostics };
    }

    for (const token of tokens) {
        if (isEventLikeProp(token.name)) {
            diagnostics.push(createUnsupportedPropDiagnostic(
                options,
                token.name,
                'event/function props require runtime evaluation'
            ));
            continue;
        }

        if (token.valueKind === 'bare') {
            props[token.name] = true;
            continue;
        }
        if (token.valueKind === 'quoted') {
            props[token.name] = parseQuotedAttrValue(token.value || '', token.quote || '"');
            continue;
        }

        const parsed = parseLiteralExpression(token.value || '');
        if (parsed.ok) {
            props[token.name] = parsed.value;
            continue;
        }
        diagnostics.push(createUnsupportedPropDiagnostic(options, token.name, parsed.reason));
    }

    return { props, diagnostics };
}

function tokenizeAttrs(attrs: string): AttrToken[] {
    const tokens: AttrToken[] = [];
    let index = 0;
    while (index < attrs.length) {
        index = skipWhitespace(attrs, index);
        if (index >= attrs.length) {
            break;
        }

        if (attrs[index] === '{' && attrs.slice(index + 1).trimStart().startsWith('...')) {
            throw new Error('spread props are unsupported');
        }

        const nameStart = index;
        while (index < attrs.length && /[A-Za-z0-9_$:-]/.test(attrs[index])) {
            index += 1;
        }
        const name = attrs.slice(nameStart, index);
        if (!/^[A-Za-z_$][A-Za-z0-9_$:-]*$/.test(name)) {
            throw new Error(`unsupported prop name near "${attrs.slice(nameStart, nameStart + 16).trim()}"`);
        }

        index = skipWhitespace(attrs, index);
        if (attrs[index] !== '=') {
            tokens.push({ name, valueKind: 'bare' });
            continue;
        }
        index += 1;
        index = skipWhitespace(attrs, index);

        const quote = attrs[index];
        if (quote === '"' || quote === "'") {
            const parsed = readQuoted(attrs, index, quote);
            tokens.push({ name, valueKind: 'quoted', value: parsed.value, quote });
            index = parsed.nextIndex;
            continue;
        }

        if (attrs[index] === '{') {
            const parsed = readBraced(attrs, index);
            tokens.push({ name, valueKind: 'expression', value: parsed.value });
            index = parsed.nextIndex;
            continue;
        }

        throw new Error(`unsupported value syntax for prop "${name}"`);
    }
    return tokens;
}

function readQuoted(source: string, start: number, quote: string): { value: string; nextIndex: number } {
    let index = start + 1;
    let value = '';
    while (index < source.length) {
        const ch = source[index];
        if (ch === '\\') {
            const next = source[index + 1];
            if (next === undefined) {
                throw new Error('unterminated quoted prop value');
            }
            value += ch + next;
            index += 2;
            continue;
        }
        if (ch === quote) {
            return { value, nextIndex: index + 1 };
        }
        value += ch;
        index += 1;
    }
    throw new Error('unterminated quoted prop value');
}

function readBraced(source: string, start: number): { value: string; nextIndex: number } {
    let index = start + 1;
    let depth = 1;
    let mode: 'code' | 'single' | 'double' | 'template' = 'code';
    let escaped = false;
    while (index < source.length) {
        const ch = source[index];
        if (mode !== 'code') {
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
            if (
                (mode === 'single' && ch === "'") ||
                (mode === 'double' && ch === '"') ||
                (mode === 'template' && ch === '`')
            ) {
                mode = 'code';
            }
            index += 1;
            continue;
        }

        if (ch === "'") {
            mode = 'single';
            index += 1;
            continue;
        }
        if (ch === '"') {
            mode = 'double';
            index += 1;
            continue;
        }
        if (ch === '`') {
            mode = 'template';
            index += 1;
            continue;
        }
        if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return { value: source.slice(start + 1, index), nextIndex: index + 1 };
            }
        }
        index += 1;
    }
    throw new Error('unterminated braced prop expression');
}

function parseQuotedAttrValue(value: string, quote: string): string {
    let out = '';
    let index = 0;
    while (index < value.length) {
        const ch = value[index];
        if (ch === '\\' && value[index + 1] === quote) {
            out += quote;
            index += 2;
            continue;
        }
        out += ch;
        index += 1;
    }
    return out;
}

function parseLiteralExpression(expr: string):
    | { ok: true; value: ScopedServerStaticPropValue }
    | { ok: false; reason: string } {
    const ts = loadTypeScriptApi();
    if (!ts) {
        return { ok: false, reason: 'TypeScript parser is unavailable' };
    }

    const source = `const __zenith_static_prop__ = (${String(expr || '').trim()});`;
    const sourceFile = ts.createSourceFile('zenith-scoped-static-prop.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const parseDiagnostics = (sourceFile as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics || [];
    if (parseDiagnostics.length > 0) {
        return { ok: false, reason: 'expression syntax is unsupported' };
    }
    const statement = sourceFile.statements[0];
    if (!statement || !ts.isVariableStatement(statement)) {
        return { ok: false, reason: 'expression syntax is unsupported' };
    }
    const initializer = statement.declarationList.declarations[0]?.initializer;
    const root = initializer && ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
    if (!root) {
        return { ok: false, reason: 'expression syntax is unsupported' };
    }
    return literalValueFromNode(root, ts);
}

function literalValueFromNode(node: import('typescript').Expression, ts: TypeScriptApi):
    | { ok: true; value: ScopedServerStaticPropValue }
    | { ok: false; reason: string } {
    if (ts.isParenthesizedExpression(node)) {
        return literalValueFromNode(node.expression, ts);
    }
    if (ts.isStringLiteral(node)) {
        return { ok: true, value: node.text };
    }
    if (ts.isNumericLiteral(node)) {
        return { ok: true, value: Number(node.text) };
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
        return { ok: true, value: true };
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
        return { ok: true, value: false };
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) {
        return { ok: true, value: null };
    }
    if (
        ts.isPrefixUnaryExpression(node) &&
        (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
        ts.isNumericLiteral(node.operand)
    ) {
        const value = Number(node.operand.text);
        return { ok: true, value: node.operator === ts.SyntaxKind.MinusToken ? -value : value };
    }
    if (ts.isArrayLiteralExpression(node)) {
        const out: ScopedServerStaticPropValue[] = [];
        for (const element of node.elements) {
            if (ts.isSpreadElement(element)) {
                return { ok: false, reason: 'array spreads require runtime evaluation' };
            }
            const parsed = literalValueFromNode(element, ts);
            if (!parsed.ok) {
                return parsed;
            }
            out.push(parsed.value);
        }
        return { ok: true, value: out };
    }
    if (ts.isObjectLiteralExpression(node)) {
        const out: { [key: string]: ScopedServerStaticPropValue } = {};
        for (const prop of node.properties) {
            if (!ts.isPropertyAssignment(prop)) {
                return { ok: false, reason: 'object shorthand, methods, and spreads require runtime evaluation' };
            }
            const key = propertyNameToString(prop.name, ts);
            if (key == null) {
                return { ok: false, reason: 'computed object keys require runtime evaluation' };
            }
            const parsed = literalValueFromNode(prop.initializer, ts);
            if (!parsed.ok) {
                return parsed;
            }
            out[key] = parsed.value;
        }
        return { ok: true, value: out };
    }

    return { ok: false, reason: unsupportedExpressionReason(node, ts) };
}

function propertyNameToString(name: import('typescript').PropertyName, ts: TypeScriptApi): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return null;
}

function unsupportedExpressionReason(node: import('typescript').Node, ts: TypeScriptApi): string {
    if (ts.isIdentifier(node)) {
        return 'identifiers require runtime evaluation';
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        return 'member expressions require runtime evaluation';
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        return 'function calls require runtime evaluation';
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return 'function values are unsupported';
    }
    if (ts.isTemplateExpression(node) || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        return 'template literals are unsupported for scoped component props';
    }
    return 'expression requires runtime evaluation';
}

function createUnsupportedPropDiagnostic(
    options: ParseScopedComponentStaticPropsOptions,
    propName: string | null,
    reason: string
): ScopedServerDiagnostic {
    const occurrence = options.occurrenceId ? ` occurrence "${options.occurrenceId}"` : '';
    const prop = propName ? ` prop "${propName}"` : ' prop expression';
    return createScopedServerDiagnostic(
        SCOPED_SERVER_DIAGNOSTIC.UNSUPPORTED_COMPONENT_PROP,
        'error',
        `Unsupported scoped component prop expression for "${options.ownerKey}"${occurrence}${prop}: ${reason}.`,
        options.contextFile
    );
}

function isEventLikeProp(name: string): boolean {
    return name.startsWith('on:') || /^on[A-Z]/.test(name);
}

function skipWhitespace(source: string, index: number): number {
    let cursor = index;
    while (cursor < source.length && /\s/.test(source[cursor])) {
        cursor += 1;
    }
    return cursor;
}

function loadTypeScriptApi(): TypeScriptApi | null {
    if (TYPESCRIPT_API !== undefined) {
        return TYPESCRIPT_API;
    }
    try {
        TYPESCRIPT_API = PACKAGE_REQUIRE('typescript') as TypeScriptApi;
    } catch {
        TYPESCRIPT_API = null;
    }
    return TYPESCRIPT_API;
}
