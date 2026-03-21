import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ImagePayload = {
  mode: string;
  config: Record<string, unknown>;
  localImages: Record<string, unknown>;
};

type RouteManifestEntry = {
  output?: string;
  page_asset?: string;
  path?: string;
  server_script?: string | null;
  prerender?: boolean;
};

type PageModuleNamespace = {
  __zenith_markers?: Array<{
    index: number;
    kind: string;
    selector?: string;
    attr?: string;
  }>;
  __zenith_expression_bindings?: Array<{
    marker_index?: number;
    fn_index?: number;
  }>;
  __zenith_expr_fns?: Array<(ctx: Record<string, unknown>) => unknown>;
};

const RUNTIME_EXPORTS = {
  hydrate: () => () => {},
  signal: (value: unknown) => value,
  state: (value: unknown) => value,
  ref: () => ({ current: null }),
  zeneffect: () => () => {},
  zenEffect: () => () => {},
  zenMount: () => {},
  zenWindow: () => undefined,
  zenDocument: () => undefined,
  zenOn: () => () => {},
  zenResize: () => () => {},
  collectRefs: (...refs: unknown[]) => refs.filter(Boolean)
};

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseMarkerSelector(selector: string): { attrName: string; attrValue: string } | null {
  const match = selector.match(/^\[([^\]=]+)=["']([^"']+)["']\]$/);
  if (!match) return null;
  return {
    attrName: match[1],
    attrValue: match[2]
  };
}

function upsertAttributeMarkup(attributes: string, attrName: string, value: unknown): string {
  const trimmedName = String(attrName || '').trim();
  if (!trimmedName) return attributes;
  const attrPattern = new RegExp(`(\\s${escapeRegex(trimmedName)}=)(["']).*?\\2`, 'i');
  if (value === null || value === undefined || value === false || value === '') {
    return attributes.replace(attrPattern, '');
  }
  const serialized = ` ${trimmedName}="${escapeHtml(value)}"`;
  if (attrPattern.test(attributes)) {
    return attributes.replace(attrPattern, serialized);
  }
  return `${attributes}${serialized}`;
}

function applyAttributeMarker(html: string, selector: string, attrName: string, value: unknown): string {
  const parsed = parseMarkerSelector(selector);
  if (!parsed) return html;
  const markerRe = new RegExp(
    `<([A-Za-z][\\w:-]*)([^>]*\\s${escapeRegex(parsed.attrName)}=(["'])${escapeRegex(parsed.attrValue)}\\3[^>]*)>`,
    'g'
  );
  return html.replace(markerRe, (match, tagName, attrs) => {
    const nextAttrs = upsertAttributeMarkup(String(attrs || ''), attrName, value);
    return `<${tagName}${nextAttrs}>`;
  });
}

function applyInnerHtmlMarker(html: string, selector: string, value: unknown): string {
  const parsed = parseMarkerSelector(selector);
  if (!parsed) return html;
  const markerRe = new RegExp(
    `<([A-Za-z][\\w:-]*)([^>]*\\s${escapeRegex(parsed.attrName)}=(["'])${escapeRegex(parsed.attrValue)}\\3[^>]*)>([\\s\\S]*?)</\\1>`,
    'g'
  );
  const replacement = value === null || value === undefined || value === false ? '' : String(value);
  return html.replace(markerRe, (_match, tagName, attrs) => `<${tagName}${attrs}>${replacement}</${tagName}>`);
}

function stripModuleSyntax(source: string): string {
  let next = source.replace(/^import\s+[^;]+;\s*$/gm, '');
  if (/(^|\n)\s*import\s+/m.test(next)) {
    throw new Error('[Zenith:Image] Cannot materialize page asset with unresolved imports');
  }
  next = next.replace(/^export\s+default\s+function\s+/gm, 'function ');
  next = next.replace(/^export\s+function\s+/gm, 'function ');
  next = next.replace(/^export\s+const\s+/gm, 'const ');
  next = next.replace(/^export\s+let\s+/gm, 'let ');
  next = next.replace(/^export\s+var\s+/gm, 'var ');
  next = next.replace(/\bexport\s*\{[^}]*\};?/g, '');
  return next;
}

async function evaluatePageModule(
  assetPath: string,
  payload: ImagePayload,
  ssrData: Record<string, unknown> | null,
  routePathname: string
): Promise<PageModuleNamespace | null> {
  const source = stripModuleSyntax(await readFile(assetPath, 'utf8'));
  const runtimeNames = Object.keys(RUNTIME_EXPORTS);
  const evaluator = new Function(
    'runtime',
    'payload',
    'ssrData',
    'routePathname',
    [
      '"use strict";',
      `const { ${runtimeNames.join(', ')} } = runtime;`,
      'const document = {};',
      'const location = { pathname: routePathname || "/" };',
      'const Document = class ZenithServerDocument {};',
      'const globalThis = {',
      '  __zenith_image_runtime: payload,',
      '  document,',
      '  location,',
      '  Document',
      '};',
      'if (ssrData && typeof ssrData === "object" && !Array.isArray(ssrData)) {',
      '  globalThis.__zenith_ssr_data = ssrData;',
      '}',
      'globalThis.globalThis = globalThis;',
      'globalThis.window = globalThis;',
      'globalThis.self = globalThis;',
      source,
      'return {',
      '  __zenith_markers: typeof __zenith_markers !== "undefined" ? __zenith_markers : [],',
      '  __zenith_expression_bindings: typeof __zenith_expression_bindings !== "undefined" ? __zenith_expression_bindings : [],',
      '  __zenith_expr_fns: typeof __zenith_expr_fns !== "undefined" ? __zenith_expr_fns : []',
      '};'
    ].join('\n')
  );
  return evaluator(RUNTIME_EXPORTS, payload, ssrData, routePathname) as PageModuleNamespace;
}

function buildExpressionContext(ssrData: Record<string, unknown> | null): Record<string, unknown> {
  return {
    signalMap: new Map(),
    params: {},
    props: {},
    ssrData: ssrData || {},
    componentBindings: {},
    zenhtml: null,
    fragment: null
  };
}

export async function materializeImageMarkup(options: {
  html: string;
  pageAssetPath?: string | null;
  payload: ImagePayload;
  ssrData?: Record<string, unknown> | null;
  routePathname?: string;
}): Promise<string> {
  const {
    html,
    pageAssetPath,
    payload,
    ssrData = null,
    routePathname = '/'
  } = options;
  if (!pageAssetPath || !html.includes('data-zx-data-zenith-image')) {
    return html;
  }

  const namespace = await evaluatePageModule(pageAssetPath, payload, ssrData, routePathname);
  if (!namespace) {
    return html;
  }

  const markers = Array.isArray(namespace.__zenith_markers) ? namespace.__zenith_markers : [];
  const bindings = Array.isArray(namespace.__zenith_expression_bindings) ? namespace.__zenith_expression_bindings : [];
  const exprFns = Array.isArray(namespace.__zenith_expr_fns) ? namespace.__zenith_expr_fns : [];
  if (markers.length === 0 || bindings.length === 0 || exprFns.length === 0) {
    return html;
  }

  const markerByIndex = new Map(markers.map((marker) => [marker.index, marker]));
  let nextHtml = html;
  const context = buildExpressionContext(ssrData);

  for (const binding of bindings) {
    const marker = markerByIndex.get(Number(binding.marker_index));
    const exprFn = Number.isInteger(binding.fn_index) ? exprFns[binding.fn_index!] : null;
    if (
      !marker ||
      typeof exprFn !== 'function' ||
      marker.kind !== 'attr' ||
      typeof marker.selector !== 'string' ||
      marker.selector.includes('data-zx-data-zenith-image') === false &&
      marker.selector.includes('data-zx-innerHTML') === false
    ) {
      continue;
    }
    const value = exprFn(context);
    if (marker.attr === 'innerHTML') {
      nextHtml = applyInnerHtmlMarker(nextHtml, marker.selector, value);
      continue;
    }
    nextHtml = applyAttributeMarker(nextHtml, marker.selector, marker.attr || '', value);
  }

  return nextHtml;
}

async function loadRouteManifest(distDir: string): Promise<RouteManifestEntry[]> {
  try {
    const manifestRaw = await readFile(join(distDir, 'assets', 'router-manifest.json'), 'utf8');
    const parsed = JSON.parse(manifestRaw);
    return Array.isArray(parsed?.routes) ? parsed.routes : [];
  } catch {
    return [];
  }
}

export async function materializeImageMarkupInHtmlFiles(options: {
  distDir: string;
  payload: ImagePayload;
}): Promise<void> {
  const { distDir, payload } = options;
  const routes = await loadRouteManifest(distDir);
  for (const route of routes) {
    if (route.server_script && route.prerender !== true) {
      continue;
    }
    const outputPath = typeof route.output === 'string' ? route.output.replace(/^\//, '') : '';
    const assetPath = typeof route.page_asset === 'string' ? route.page_asset.replace(/^\//, '') : '';
    if (!outputPath || !assetPath) continue;

    const fullHtmlPath = join(distDir, outputPath);
    const fullAssetPath = join(distDir, assetPath);
    let html = '';
    try {
      html = await readFile(fullHtmlPath, 'utf8');
    } catch {
      continue;
    }
    const nextHtml = await materializeImageMarkup({
      html,
      pageAssetPath: fullAssetPath,
      payload,
      routePathname: typeof route.path === 'string' ? route.path : '/'
    });
    if (nextHtml !== html) {
      await writeFile(fullHtmlPath, nextHtml, 'utf8');
    }
  }
}
