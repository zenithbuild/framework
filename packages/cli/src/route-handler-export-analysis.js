function routeHandlerExportPattern(name, tail) {
    return new RegExp(`\\bexport\\s+const\\s+${name}\\s*=\\s*${tail}`);
}

/**
 * @param {string} source
 * @param {'guard' | 'load' | 'action'} name
 * @returns {{
 *   fnMatch: RegExpMatchArray | null,
 *   constParenMatch: RegExpMatchArray | null,
 *   constSingleArgMatch: RegExpMatchArray | null,
 *   constMiddlewareMatch: RegExpMatchArray | null,
 *   hasExport: boolean,
 *   matchCount: number,
 *   arity: number | null
 * }}
 */
export function readRouteHandlerExport(source, name) {
    const fnMatch = source.match(new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${name}\\s*\\(([^)]*)\\)`));
    const constParenMatch = source.match(routeHandlerExportPattern(name, '(?:async\\s*)?\\(([^)]*)\\)\\s*=>'));
    const constSingleArgMatch = source.match(
        routeHandlerExportPattern(name, '(?:async\\s*)?([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=>')
    );
    const constMiddlewareMatch = source.match(routeHandlerExportPattern(name, 'withMiddleware\\s*\\('));
    const matchCount =
        Number(Boolean(fnMatch)) +
        Number(Boolean(constParenMatch)) +
        Number(Boolean(constSingleArgMatch)) +
        Number(Boolean(constMiddlewareMatch));

    let arity = null;
    if (!constMiddlewareMatch) {
        const singleArg = String(constSingleArgMatch?.[1] || '').trim();
        const paramsText = String((fnMatch || constParenMatch)?.[1] || '').trim();
        arity = singleArg ? 1 : paramsText.length === 0 ? 0 : paramsText.split(',').length;
    }

    return {
        fnMatch,
        constParenMatch,
        constSingleArgMatch,
        constMiddlewareMatch,
        hasExport: matchCount > 0,
        matchCount,
        arity
    };
}
