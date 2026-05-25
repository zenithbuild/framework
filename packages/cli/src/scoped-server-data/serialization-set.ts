const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

export function collectTemplateRootBindingRefs(template: string): Set<string> {
    const refs = new Set<string>();
    const source = String(template || '');
    let cursor = 0;

    while (cursor < source.length) {
        const open = source.indexOf('{', cursor);
        if (open < 0) {
            break;
        }
        const close = source.indexOf('}', open + 1);
        if (close < 0) {
            break;
        }
        const expr = source.slice(open + 1, close).trim();
        const root = readExpressionRoot(expr);
        if (root) {
            refs.add(root);
        }
        cursor = close + 1;
    }

    return refs;
}

function readExpressionRoot(expr: string): string | null {
    if (!expr || expr.startsWith('//')) {
        return null;
    }
    let i = 0;
    while (i < expr.length && /\s/.test(expr[i] ?? '')) {
        i += 1;
    }
    if (!IDENT_START.test(expr[i] ?? '')) {
        return null;
    }
    let end = i + 1;
    while (end < expr.length && IDENT_PART.test(expr[end] ?? '')) {
        end += 1;
    }
    return expr.slice(i, end);
}

export function computeSerializationSet(declaredNames: string[], template: string): string[] {
    const refs = collectTemplateRootBindingRefs(template);
    const declared = new Set(declaredNames);
    const serialized: string[] = [];
    for (const name of refs) {
        if (declared.has(name)) {
            serialized.push(name);
        }
    }
    return serialized.sort();
}
