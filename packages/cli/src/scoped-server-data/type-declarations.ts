import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, resolve, sep } from 'node:path';
import { partitionScriptBlocks } from './parse-owner-server-block.js';
import type { ManifestScopedServerDataEntry } from './types.js';

type TypeScriptApi = typeof import('typescript');

interface RouteManifestEntry {
    scoped_server_data?: ManifestScopedServerDataEntry[];
}

export interface RenderScopedServerDataDtsOptions {
    manifest: RouteManifestEntry[];
    srcDir: string;
}

interface OwnerDeclaration {
    key: string;
    type: string;
}

const PACKAGE_REQUIRE = createRequire(import.meta.url);
let TYPESCRIPT_API: TypeScriptApi | null | undefined;

export function renderScopedServerDataDts(options: RenderScopedServerDataDtsOptions): string {
    const srcDir = resolve(String(options.srcDir || ''));
    const entries = collectScopedEntries(options.manifest);
    const owners = new Map<string, ManifestScopedServerDataEntry>();
    const runtimeKeys = new Map<string, string>();

    for (const entry of entries) {
        if (!entry || typeof entry.ownerKey !== 'string' || entry.ownerKey.length === 0) {
            continue;
        }
        if (!owners.has(entry.ownerKey)) {
            owners.set(entry.ownerKey, entry);
        }
        for (const key of runtimeKeysForEntry(entry)) {
            if (!runtimeKeys.has(key)) {
                runtimeKeys.set(key, entry.ownerKey);
            }
        }
    }

    const ownerDeclarations = [...owners.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => ({
            key,
            type: inferOwnerType(entry, resolveOwnerFilePath(key, srcDir))
        }));

    const runtimeDeclarations = [...runtimeKeys.entries()]
        .sort(([a], [b]) => a.localeCompare(b));

    return renderDts(ownerDeclarations, runtimeDeclarations);
}

function collectScopedEntries(manifest: RouteManifestEntry[]): ManifestScopedServerDataEntry[] {
    const entries: ManifestScopedServerDataEntry[] = [];
    for (const route of Array.isArray(manifest) ? manifest : []) {
        const scoped = Array.isArray(route?.scoped_server_data) ? route.scoped_server_data : [];
        for (const entry of scoped) {
            entries.push(entry);
        }
    }
    return entries;
}

function runtimeKeysForEntry(entry: ManifestScopedServerDataEntry): string[] {
    if (entry.ownerKind === 'layout') {
        return [`layout:${entry.ownerKey}`];
    }
    if (entry.ownerKind === 'component' && entry.instanceStrategy === 'per-instance') {
        return Array.isArray(entry.instances)
            ? entry.instances.map((item) => item.key).filter((key) => typeof key === 'string' && key.length > 0)
            : [];
    }
    if (entry.ownerKind === 'component') {
        return [`component:${entry.ownerKey}`];
    }
    return [];
}

function resolveOwnerFilePath(ownerKey: string, srcDir: string): string | null {
    const raw = String(ownerKey || '').replace(/\\/g, '/');
    if (!raw || isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
        return null;
    }
    const relative = raw.startsWith('src/') ? raw.slice(4) : raw;
    const parts = relative.split('/');
    if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
        return null;
    }
    const resolved = resolve(srcDir, ...parts);
    if (resolved !== srcDir && !resolved.startsWith(`${srcDir}${sep}`)) {
        return null;
    }
    return resolved;
}

function inferOwnerType(entry: ManifestScopedServerDataEntry, ownerPath: string | null): string {
    if (!ownerPath || !existsSync(ownerPath)) {
        return entry.syntax === 'explicit-data' ? 'Record<string, unknown>' : variablesType(entry, new Map());
    }

    const ts = loadTypeScriptApi();
    if (!ts) {
        return entry.syntax === 'explicit-data' ? 'Record<string, unknown>' : variablesType(entry, new Map());
    }

    const source = readFileSync(ownerPath, 'utf8');
    const serverBody = readSingleServerBody(source);
    if (!serverBody) {
        return entry.syntax === 'explicit-data' ? 'Record<string, unknown>' : variablesType(entry, new Map());
    }

    const sourceFile = ts.createSourceFile(ownerPath, serverBody, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (entry.syntax === 'explicit-data') {
        return inferExplicitDataType(sourceFile, ts);
    }

    const variableTypes = inferTopLevelVariableTypes(sourceFile, ts, serverBody);
    return variablesType(entry, variableTypes);
}

function readSingleServerBody(source: string): string {
    const { serverBlocks } = partitionScriptBlocks(source);
    return serverBlocks.length === 1 ? String(serverBlocks[0]?.body || '').trim() : '';
}

function inferTopLevelVariableTypes(
    sourceFile: import('typescript').SourceFile,
    ts: TypeScriptApi,
    source: string
): Map<string, string> {
    const out = new Map<string, string>();
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
                continue;
            }
            const annotated = declaration.type ? safeTypeAnnotation(declaration.type, ts, source) : null;
            const inferred = annotated || (declaration.initializer ? inferExpressionType(declaration.initializer, ts) : null);
            out.set(declaration.name.text, inferred || 'unknown');
        }
    }
    return out;
}

function inferExplicitDataType(sourceFile: import('typescript').SourceFile, ts: TypeScriptApi): string {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        const hasExport = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
        if (!hasExport) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'data') {
                continue;
            }
            const inferred = declaration.initializer ? inferDataInitializerReturn(declaration.initializer, ts) : null;
            return inferred && inferred.startsWith('{') ? inferred : 'Record<string, unknown>';
        }
    }
    return 'Record<string, unknown>';
}

function inferDataInitializerReturn(node: import('typescript').Expression, ts: TypeScriptApi): string | null {
    const target = unwrapExpression(node, ts);
    if (ts.isArrowFunction(target) || ts.isFunctionExpression(target)) {
        if (target.type) {
            const annotated = safeScopedDataReturnAnnotation(target.type, ts, target.getSourceFile().text);
            if (annotated && annotated.startsWith('{')) {
                return annotated;
            }
        }
        if (ts.isBlock(target.body)) {
            const returned = singleReturnExpression(target.body, ts);
            return returned ? inferExpressionType(returned, ts) : null;
        }
        return inferExpressionType(target.body, ts);
    }
    return null;
}

function singleReturnExpression(block: import('typescript').Block, ts: TypeScriptApi): import('typescript').Expression | null {
    const returns = block.statements.filter(ts.isReturnStatement);
    if (returns.length !== 1) {
        return null;
    }
    return returns[0].expression || null;
}

function inferExpressionType(node: import('typescript').Expression, ts: TypeScriptApi): string | null {
    const expr = unwrapExpression(node, ts);
    if (ts.isStringLiteral(expr) || expr.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        return 'string';
    }
    if (ts.isNumericLiteral(expr)) {
        return 'number';
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
        return 'boolean';
    }
    if (expr.kind === ts.SyntaxKind.NullKeyword) {
        return 'null';
    }
    if (
        ts.isPrefixUnaryExpression(expr) &&
        (expr.operator === ts.SyntaxKind.MinusToken || expr.operator === ts.SyntaxKind.PlusToken) &&
        ts.isNumericLiteral(expr.operand)
    ) {
        return 'number';
    }
    if (ts.isObjectLiteralExpression(expr)) {
        return inferObjectType(expr, ts);
    }
    if (ts.isArrayLiteralExpression(expr)) {
        return inferArrayType(expr, ts);
    }
    return null;
}

function inferObjectType(node: import('typescript').ObjectLiteralExpression, ts: TypeScriptApi): string | null {
    const fields: string[] = [];
    for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) {
            return null;
        }
        const name = propertyNameToString(prop.name, ts);
        if (name == null) {
            return null;
        }
        const valueType = inferExpressionType(prop.initializer, ts);
        if (!valueType) {
            return null;
        }
        fields.push(`${safePropertyName(name)}: ${valueType};`);
    }
    return `{ ${fields.join(' ')} }`;
}

function inferArrayType(node: import('typescript').ArrayLiteralExpression, ts: TypeScriptApi): string | null {
    const elementTypes: string[] = [];
    for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
            return null;
        }
        const type = inferExpressionType(element, ts);
        if (!type) {
            return null;
        }
        if (!elementTypes.includes(type)) {
            elementTypes.push(type);
        }
    }
    if (elementTypes.length === 0) {
        return 'unknown[]';
    }
    return elementTypes.length === 1 ? `${elementTypes[0]}[]` : `Array<${elementTypes.join(' | ')}>`;
}

function safeTypeAnnotation(node: import('typescript').TypeNode, ts: TypeScriptApi, source: string): string | null {
    if (
        node.kind === ts.SyntaxKind.StringKeyword ||
        node.kind === ts.SyntaxKind.NumberKeyword ||
        node.kind === ts.SyntaxKind.BooleanKeyword ||
        node.kind === ts.SyntaxKind.UnknownKeyword
    ) {
        return node.getText();
    }
    if (ts.isLiteralTypeNode(node)) {
        return literalTypeText(node, ts);
    }
    if (ts.isArrayTypeNode(node)) {
        const item = safeTypeAnnotation(node.elementType, ts, source);
        return item ? `${item}[]` : null;
    }
    if (ts.isTupleTypeNode(node)) {
        const items = node.elements.map((item) => safeTypeAnnotation(item, ts, source));
        return items.every(Boolean) ? `[${items.join(', ')}]` : null;
    }
    if (ts.isUnionTypeNode(node)) {
        const items = node.types.map((item) => safeTypeAnnotation(item, ts, source));
        return items.every(Boolean) ? items.join(' | ') : null;
    }
    if (ts.isTypeLiteralNode(node)) {
        return safeTypeLiteral(node, ts, source);
    }
    return null;
}

function safeScopedDataReturnAnnotation(
    node: import('typescript').TypeNode,
    ts: TypeScriptApi,
    source: string
): string | null {
    if (ts.isTypeReferenceNode(node) && isPromiseLikeTypeReference(node, ts)) {
        const inner = node.typeArguments?.[0];
        return inner ? safeTypeAnnotation(inner, ts, source) : null;
    }
    return safeTypeAnnotation(node, ts, source);
}

function isPromiseLikeTypeReference(node: import('typescript').TypeReferenceNode, ts: TypeScriptApi): boolean {
    if (!ts.isIdentifier(node.typeName)) {
        return false;
    }
    return node.typeName.text === 'Promise' || node.typeName.text === 'PromiseLike';
}

function safeTypeLiteral(node: import('typescript').TypeLiteralNode, ts: TypeScriptApi, source: string): string | null {
    const fields: string[] = [];
    for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.type || !member.name) {
            return null;
        }
        const name = propertyNameToString(member.name, ts);
        const type = safeTypeAnnotation(member.type, ts, source);
        if (name == null || !type) {
            return null;
        }
        fields.push(`${safePropertyName(name)}${member.questionToken ? '?' : ''}: ${type};`);
    }
    return `{ ${fields.join(' ')} }`;
}

function literalTypeText(node: import('typescript').LiteralTypeNode, ts: TypeScriptApi): string | null {
    const literal = node.literal;
    if (ts.isStringLiteral(literal)) {
        return JSON.stringify(literal.text);
    }
    if (ts.isNumericLiteral(literal)) {
        return literal.text;
    }
    if (literal.kind === ts.SyntaxKind.TrueKeyword) {
        return 'true';
    }
    if (literal.kind === ts.SyntaxKind.FalseKeyword) {
        return 'false';
    }
    if (literal.kind === ts.SyntaxKind.NullKeyword) {
        return 'null';
    }
    if (ts.isPrefixUnaryExpression(literal) && ts.isNumericLiteral(literal.operand)) {
        return literal.getText();
    }
    return null;
}

function variablesType(entry: ManifestScopedServerDataEntry, variableTypes: Map<string, string>): string {
    const names = Array.isArray(entry.serializedVariableNames) ? [...entry.serializedVariableNames].sort() : [];
    if (names.length === 0) {
        return '{}';
    }
    const fields = names.map((name) => `${safePropertyName(name)}: ${variableTypes.get(name) || 'unknown'};`);
    return `{ ${fields.join(' ')} }`;
}

function renderDts(owners: OwnerDeclaration[], runtimeEntries: Array<[string, string]>): string {
    const lines = [
        '// Auto-generated by Zenith CLI. Do not edit manually.',
        'export {};',
        '',
        'declare global {',
        '  namespace Zenith {',
        '    interface ScopedServerDataOwnerMap {'
    ];
    for (const owner of owners) {
        lines.push(`      ${JSON.stringify(owner.key)}: ${owner.type};`);
    }
    lines.push('    }');
    lines.push('');
    lines.push('    interface ScopedServerDataRuntimeMap {');
    for (const [runtimeKey, ownerKey] of runtimeEntries) {
        lines.push(`      ${JSON.stringify(runtimeKey)}: ScopedServerDataOwnerMap[${JSON.stringify(ownerKey)}];`);
    }
    lines.push('    }');
    lines.push('');
    lines.push('    type ScopedServerDataFor<K extends keyof ScopedServerDataOwnerMap> =');
    lines.push('      ScopedServerDataOwnerMap[K];');
    lines.push('');
    lines.push('    type ScopedServerRuntimeDataFor<K extends keyof ScopedServerDataRuntimeMap> =');
    lines.push('      ScopedServerDataRuntimeMap[K];');
    lines.push('  }');
    lines.push('}');
    lines.push('');
    return `${lines.join('\n')}\n`;
}

function unwrapExpression<T extends import('typescript').Expression>(node: T, ts: TypeScriptApi): import('typescript').Expression {
    let current: import('typescript').Expression = node;
    while (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isTypeAssertionExpression(current) ||
        ts.isSatisfiesExpression(current)
    ) {
        current = current.expression;
    }
    return current;
}

function propertyNameToString(name: import('typescript').PropertyName, ts: TypeScriptApi): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return null;
}

function safePropertyName(name: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
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
