import { loadTypeScriptApi } from './compiler-runtime.js';

const SAFE_ATTRS = new Set(['alt', 'aria-label', 'content', 'datetime', 'href', 'rel', 'title']);
const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const identifier = /^[A-Za-z_$][\w$]*$/;

function member(owner, name) {
    if (!owner || blocked.has(name)) return null;
    return owner instanceof Map ? owner.get(name) : [...owner, name];
}

function projection(ts, node, scope) {
    if (!node) return null;
    if (ts.isParenthesizedExpression(node)) return projection(ts, node.expression, scope);
    if (ts.isIdentifier(node)) return scope.get(node.text);
    if (ts.isPropertyAccessExpression(node)) return member(projection(ts, node.expression, scope), node.name.text);
    if (ts.isElementAccessExpression(node) && ts.isNumericLiteral(node.argumentExpression)) {
        return member(projection(ts, node.expression, scope), node.argumentExpression.text);
    }
    if (!ts.isObjectLiteralExpression(node)) return null;
    const fields = new Map();
    for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return null;
        fields.set(property.name.text, projection(ts, property.initializer, scope));
    }
    return fields;
}

// The compiler scopes each component instance separately. Only its emitted,
// immutable aliases can carry a request-data projection into another instance.
export function collectInteractiveDataBindings(ir) {
    if (ir.has_scoped_server_data) return [];
    const ts = loadTypeScriptApi();
    if (!ts) return [];
    const immutable = new Set((ir.hoisted?.declarations || [])
        .map((text) => /^const\s+([\w$]+)\s*[:=]/.exec(text.trim())?.[1]).filter(Boolean));
    const names = new Map([['data', []]]);
    const duplicates = new Set();
    for (const source of ir.hoisted?.code || []) {
        const block = ts.createSourceFile('setup.js', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
        if (block.parseDiagnostics.length) continue;
        const scope = new Map(names);
        for (const statement of block.statements) {
            if (!ts.isVariableStatement(statement)) continue;
            for (const variable of statement.declarationList.declarations) {
                if (!ts.isIdentifier(variable.name)) continue;
                const name = variable.name.text;
                const scopedConst = name.startsWith('__') && immutable.has(name);
                const propsMap = name === 'props' && variable.initializer && ts.isObjectLiteralExpression(variable.initializer);
                const value = scopedConst || propsMap ? projection(ts, variable.initializer, scope) : null;
                scope.set(name, value);
                if (!scopedConst) continue;
                if (names.has(name)) duplicates.add(name);
                names.set(name, value);
            }
        }
    }
    for (const name of duplicates) names.delete(name);
    const rows = [];
    const bindings = new Map((ir.expression_bindings || []).map((binding) => [binding.marker_index, binding]));
    for (const marker of ir.marker_bindings || []) {
        if (marker.kind !== 'text' && !(marker.kind === 'attr' && SAFE_ATTRS.has(marker.attr))) continue;
        const binding = bindings.get(marker.index);
        if (!binding || binding.signal_index != null || binding.scoped_data_key || binding.component_instance != null) continue;
        let expr = String(binding.compiled_expr || binding.literal || '').trim();
        if (expr.startsWith('(') && expr.endsWith(')')) expr = expr.slice(1, -1).trim();
        const parts = expr.replace(/\[(\d+)\]/g, '.$1').split('.');
        if (!identifier.test(parts[0]) || !parts.slice(1).every((part) => identifier.test(part) || /^\d+$/.test(part))) continue;
        let path = names.get(parts[0]);
        for (const part of parts.slice(1)) path = member(path, part);
        if (Array.isArray(path) && path.length) {
            const { kind, attr, selector } = marker;
            rows.push({ marker: { kind, attr, selector }, path });
        }
    }
    return rows;
}
