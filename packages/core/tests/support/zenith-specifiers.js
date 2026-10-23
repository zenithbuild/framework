// Finds @zenithbuild module references in a JS/TS module by parsing it with
// the TypeScript compiler, so comments never match and every module-loading
// form is covered: static import/export-from, import =, import types, dynamic
// import() with string or template literals, require(), require.resolve(),
// createRequire(...)(...) and createRequire(...).resolve(), and
// import.meta.resolve(). Any other string or template literal that starts
// with "@zenithbuild/" is reported too, so a specifier held in a variable
// cannot slip through.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const ZENITH_PREFIX = '@zenithbuild/';

function scriptKindFor(fileName) {
    if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (/\.[cm]?ts$/.test(fileName)) return ts.ScriptKind.TS;
    return ts.ScriptKind.JS;
}

// Text a specifier argument starts with, or null when it isn't a literal.
function literalPrefix(node) {
    if (!node) return null;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text;
    if (ts.isParenthesizedExpression(node)) return literalPrefix(node.expression);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = literalPrefix(node.left);
        if (left === null) return null;
        const right = literalPrefix(node.right);
        return right === null ? left : left + right;
    }
    return null;
}

function callKind(call) {
    const callee = call.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return 'dynamic-import';
    if (ts.isIdentifier(callee) && callee.text === 'require') return 'require';
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'resolve') {
        const target = callee.expression;
        if (ts.isMetaProperty(target)) return 'import.meta.resolve';
        if (ts.isIdentifier(target) && target.text === 'require') return 'require.resolve';
        if (ts.isCallExpression(target)) return 'createRequire().resolve';
        return 'resolve';
    }
    if (ts.isCallExpression(callee)) return 'createRequire()()';
    return null;
}

/**
 * @param {string} source
 * @param {string} fileName
 * @returns {{ kind: string, specifier: string, line: number }[]}
 */
export function findZenithSpecifiers(source, fileName) {
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
    const found = [];
    const claimed = new Set();
    const report = (kind, node, text) => {
        if (text === null || !text.startsWith(ZENITH_PREFIX) || claimed.has(node)) return;
        claimed.add(node);
        found.push({ kind, specifier: text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    };
    const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
            report(ts.isImportDeclaration(node) ? 'import' : 'export-from', node.moduleSpecifier, literalPrefix(node.moduleSpecifier));
        } else if (ts.isExternalModuleReference(node)) {
            report('import-equals', node.expression, literalPrefix(node.expression));
        } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
            report('import-type', node.argument.literal, literalPrefix(node.argument.literal));
        } else if (ts.isCallExpression(node)) {
            const kind = callKind(node);
            const arg = node.arguments[0];
            if (kind && arg) report(kind, arg, literalPrefix(arg));
        }
        ts.forEachChild(node, visit);
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
            report('string-literal', node, literalPrefix(node));
        }
    };
    visit(sf);
    return found;
}

function listModules(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { recursive: true })
        .map((f) => String(f).split(path.sep).join('/'))
        .filter((f) => MODULE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .filter((f) => fs.statSync(path.join(dir, f)).isFile())
        .sort();
}

/**
 * Every module under dir, with its @zenithbuild references.
 * @param {string} dir
 */
export function scanZenithSpecifiers(dir) {
    const files = listModules(dir);
    const violations = [];
    for (const file of files) {
        for (const hit of findZenithSpecifiers(fs.readFileSync(path.join(dir, file), 'utf8'), file)) {
            violations.push(`${file}:${hit.line} ${hit.kind} ${hit.specifier}`);
        }
    }
    return { files, violations };
}
