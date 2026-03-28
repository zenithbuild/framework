import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  renderImageHtmlWithPayload,
  replaceImageMarkers,
  serializeImageProps
} from './runtime.js';

type ImagePayload = {
  mode: string;
  config: Record<string, unknown>;
  localImages: Record<string, unknown>;
};

type ImageMaterializationEntry = {
  selector?: string;
  props?: Record<string, unknown> | null;
};

type RouteManifestEntry = {
  output?: string;
  path?: string;
  server_script?: string | null;
  prerender?: boolean;
  image_materialization?: ImageMaterializationEntry[];
};

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
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
  const serialized = ` ${trimmedName}="${String(value)}"`;
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
  return html.replace(markerRe, (_match, tagName, attrs) => {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasUnmaterializedImageMarkers(html: string): boolean {
  const matches = html.match(/<span\b[^>]*\bdata-zx-(?:data-zenith-image|unsafeHTML)=(["'])[^"']+\1[^>]*>/gi) || [];
  return matches.some((tag) => /\sdata-zenith-image=/.test(tag) === false);
}

export async function materializeImageMarkup(options: {
  html: string;
  payload: ImagePayload;
  imageMaterialization?: ImageMaterializationEntry[] | null;
}): Promise<string> {
  const {
    html,
    payload,
    imageMaterialization = []
  } = options;
  const entries = Array.isArray(imageMaterialization) ? imageMaterialization : [];

  if (typeof html !== 'string' || html.length === 0) {
    return html;
  }

  let nextHtml = html;
  for (const entry of entries) {
    if (!entry || typeof entry.selector !== 'string' || !isPlainObject(entry.props)) {
      continue;
    }
    const encodedProps = serializeImageProps(entry.props);
    const renderedHtml = renderImageHtmlWithPayload(entry.props, payload);
    nextHtml = applyAttributeMarker(nextHtml, entry.selector, 'data-zenith-image', encodedProps);
    nextHtml = applyInnerHtmlMarker(nextHtml, entry.selector, renderedHtml);
  }

  nextHtml = replaceImageMarkers(nextHtml, payload);
  if (hasUnmaterializedImageMarkers(nextHtml)) {
    throw new Error(
      '[Zenith:Image] Unresolved Image markers require a compiler-owned image materialization artifact. ' +
      'Dynamic image props are currently unsupported.'
    );
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
    if (!outputPath) continue;

    const fullHtmlPath = join(distDir, outputPath);
    let html = '';
    try {
      html = await readFile(fullHtmlPath, 'utf8');
    } catch {
      continue;
    }
    const nextHtml = await materializeImageMarkup({
      html,
      payload,
      imageMaterialization: Array.isArray(route.image_materialization) ? route.image_materialization : []
    });
    if (nextHtml !== html) {
      await writeFile(fullHtmlPath, nextHtml, 'utf8');
    }
  }
}
