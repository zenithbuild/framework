import { readFile } from 'node:fs/promises';

const BOOLEAN_ATTRIBUTES = new Set(['disabled', 'checked', 'selected', 'readonly', 'multiple', 'hidden', 'autofocus', 'required', 'open']);
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderText(value) {
    if (value == null || typeof value === 'boolean') return '';
    if (Array.isArray(value)) return value.map(renderText).join('');
    if (typeof value === 'object' || typeof value === 'function') {
        throw new Error('[Zenith:SSR] Data-only text expressions must return renderable values.');
    }
    return escapeHtml(value);
}

function applyMarker(html, marker, value) {
    if (marker.kind === 'text' && marker.selector.startsWith('comment:')) {
        const anchor = marker.selector.slice('comment:'.length);
        const open = `<!--${anchor}-->`;
        const close = `<!--/ ${anchor}-->`;
        return html.replace(open, () => `${open}${renderText(value)}${close}`);
    }
    const selector = marker.selector.match(/^\[([\w-]+)(~?)=["']([^"']+)["']\]$/);
    if (!selector) throw new Error('[Zenith:SSR] Unsupported compiler marker selector.');
    const [, name, tokenMatch, token] = selector;
    if (marker.kind === 'text') {
        const elementPattern = new RegExp(`<([A-Za-z][\\w:-]*)([^<>]*\\s${escapeRegex(name)}=(["'])([^"']*)\\3[^<>]*)>[\\s\\S]*?</\\1>`, 'g');
        return html.replace(elementPattern, (element, tagName, attrs, _quote, tokens) => {
            if (tokenMatch ? !tokens.split(/\s+/).includes(token) : tokens !== token) return element;
            return `<${tagName}${attrs}>${renderText(value)}</${tagName}>`;
        });
    }
    const tagPattern = new RegExp(`<([A-Za-z][\\w:-]*)([^<>]*\\s${escapeRegex(name)}=(["'])([^"']*)\\3[^<>]*)>`, 'g');
    return html.replace(tagPattern, (tag, tagName, attrs, _quote, tokens) => {
        if (tokenMatch ? !tokens.split(/\s+/).includes(token) : tokens !== token) return tag;
        if (marker.kind !== 'attr') return tag;
        const attr = marker.attr === 'className' ? 'class' : marker.attr;
        if (!/^[A-Za-z_:][\w:.-]*$/.test(attr) || /^on/i.test(attr)) throw new Error('[Zenith:SSR] Invalid compiler attribute marker.');
        const pattern = new RegExp(`\\s${escapeRegex(attr)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?(?=\\s|$)`, 'gi');
        let next = attrs.replace(pattern, '');
        if (BOOLEAN_ATTRIBUTES.has(attr)) {
            if (value) next += ` ${attr}`;
        } else if (value != null && value !== false && value !== '') {
            next += ` ${attr}="${escapeHtml(value)}"`;
        }
        return `<${tagName}${next}>`;
    });
}

export async function materializeSsrBindings({ html, planPath, routePath, payload, params = {} }) {
    let plans;
    try {
        plans = JSON.parse(await readFile(planPath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return html; // Older artifacts have no plan.
        throw error;
    }
    const routeData = payload?.route && payload?.scoped ? payload.route : payload;
    for (const { marker, expression, scopedDataKey } of plans[routePath] || []) {
        const data = scopedDataKey ? payload?.scoped?.[scopedDataKey] || {} : routeData;
        // Only compiler-authored expressions become code. Request values remain
        // function arguments, exactly as in the client expression evaluator.
        const evaluate = new Function('data', 'ssr', 'ssr_data', 'params', '__ctx', `"use strict"; return (${expression});`);
        const value = evaluate(data, data, data, params, { ssrData: data, params });
        html = applyMarker(html, marker, value);
    }
    return html;
}
