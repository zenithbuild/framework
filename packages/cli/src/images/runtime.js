import { prependBasePath } from '../base-path.js';
import {
    buildLocalVariantPath,
    buildRemoteVariantPath,
    imageRuntimeGlobalName,
    matchRemotePattern,
    normalizeImageRuntimePayload,
    normalizeImageSource,
    resolveWidthCandidates
} from './shared.js';

function safeString(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return '';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildAttr(name, value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    return ` ${name}="${escapeHtml(value)}"`;
}

function readRuntimePayload() {
    if (typeof globalThis !== 'object' || !globalThis) {
        return null;
    }
    return normalizeImageRuntimePayload(globalThis[imageRuntimeGlobalName()]);
}

function encodeBase64(value) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(value, 'utf8').toString('base64');
    }
    if (typeof btoa === 'function' && typeof TextEncoder === 'function') {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }
    return '';
}

function decodeBase64(value) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(value, 'base64').toString('utf8');
    }
    if (typeof atob === 'function' && typeof TextDecoder === 'function') {
        const binary = atob(value);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }
    return '';
}

function encodeMarkerPayload(value) {
    return encodeBase64(JSON.stringify(value));
}

function decodeMarkerPayload(value) {
    try {
        const json = decodeBase64(String(value || ''));
        const parsed = JSON.parse(json);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function localEntryFor(payload, publicPath) {
    if (!payload || !payload.localImages || typeof payload.localImages !== 'object') {
        return null;
    }
    return payload.localImages[publicPath] || null;
}

function pickNumeric(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function mergeStyle(style, fit, position) {
    const segments = [];
    const incoming = safeString(style);
    if (incoming) {
        segments.push(incoming.replace(/;+\s*$/, ''));
    }
    if (safeString(fit)) {
        segments.push(`object-fit: ${safeString(fit)}`);
    }
    if (safeString(position)) {
        segments.push(`object-position: ${safeString(position)}`);
    }
    return segments.join('; ');
}

function buildSourceTags(sources) {
    return sources.map((entry) => {
        const attrs = [
            buildAttr('type', entry.type),
            buildAttr('srcset', entry.srcset),
            buildAttr('sizes', entry.sizes)
        ].join('');
        return `<source${attrs}>`;
    }).join('');
}

function mimeTypeForFormat(format) {
    switch (String(format || '').toLowerCase()) {
        case 'avif':
            return 'image/avif';
        case 'webp':
            return 'image/webp';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        default:
            return '';
    }
}

function buildLocalImageModel(props, payload, source) {
    const config = payload?.config;
    const manifestEntry = localEntryFor(payload, source.path);
    const width = pickNumeric(props.width, pickNumeric(source.width, pickNumeric(manifestEntry?.width, null)));
    const height = pickNumeric(props.height, pickNumeric(source.height, pickNumeric(manifestEntry?.height, null)));
    const quality = pickNumeric(props.quality, config.quality);
    const sizes = safeString(props.sizes);
    const widths = resolveWidthCandidates(width, sizes, config, manifestEntry);
    const fallbackFormat = safeString(manifestEntry?.originalFormat) || 'jpg';
    const sourceFormats = (config.formats || []).filter((format) => Array.isArray(manifestEntry?.availableFormats)
        ? manifestEntry.availableFormats.includes(format)
        : true);
    const fallbackWidth = widths.length > 0 ? widths[widths.length - 1] : width;
    const imgSrc = props.unoptimized === true
        ? prependBasePath(payload?.basePath || '/', source.path)
        : buildLocalVariantPath(
            source.path,
            fallbackWidth || width || manifestEntry?.width || 0,
            quality,
            fallbackFormat,
            payload?.basePath || '/'
        );

    const sources = props.unoptimized === true
        ? []
        : sourceFormats.map((format) => ({
            type: mimeTypeForFormat(format),
            sizes,
            srcset: widths.map((candidate) => `${buildLocalVariantPath(
                source.path,
                candidate,
                quality,
                format,
                payload?.basePath || '/'
            )} ${candidate}w`).join(', ')
        })).filter((entry) => entry.type && entry.srcset);

    return {
        src: imgSrc,
        width,
        height,
        sizes,
        sources
    };
}

function buildRemoteImageModel(props, payload, source) {
    const config = payload?.config;
    const width = pickNumeric(props.width, pickNumeric(source.width, null));
    const height = pickNumeric(props.height, pickNumeric(source.height, null));
    const quality = pickNumeric(props.quality, config.quality);
    const sizes = safeString(props.sizes);
    const widths = resolveWidthCandidates(width, sizes, config, null);
    const allowed = matchRemotePattern(source.url, config.remotePatterns || []);
    if (!allowed) {
        return null;
    }

    if (payload.mode !== 'endpoint' || props.unoptimized === true || !width) {
        return {
            src: source.url,
            width,
            height,
            sizes,
            sources: []
        };
    }

    const sources = (config.formats || []).map((format) => ({
        type: mimeTypeForFormat(format),
        sizes,
        srcset: widths.map((candidate) => `${buildRemoteVariantPath(
            source.url,
            candidate,
            quality,
            format,
            payload?.basePath || '/'
        )} ${candidate}w`).join(', ')
    })).filter((entry) => entry.type && entry.srcset);

    return {
        src: buildRemoteVariantPath(
            source.url,
            widths[widths.length - 1] || width,
            quality,
            '',
            payload?.basePath || '/'
        ),
        width,
        height,
        sizes,
        sources
    };
}

export function renderImageHtmlWithPayload(rawProps, payload) {
    const props = rawProps && typeof rawProps === 'object' ? rawProps : {};
    const source = normalizeImageSource(props.src);
    if (!source) {
        return '';
    }

    const alt = safeString(props.alt) || safeString(source.alt);
    if (!alt) {
        return '';
    }

    const model = source.kind === 'local'
        ? buildLocalImageModel(props, payload, source)
        : buildRemoteImageModel(props, payload, source);
    if (!model || !model.src) {
        return '';
    }

    const className = safeString(props.class);
    const style = mergeStyle(props.style, props.fit, props.position);
    const loading = props.priority === true ? 'eager' : safeString(props.loading) || 'lazy';
    const decoding = safeString(props.decoding) || 'async';
    const fetchPriority = props.priority === true ? 'high' : '';
    const sourcesHtml = buildSourceTags(model.sources);
    const imgAttrs = [
        buildAttr('src', model.src),
        buildAttr('alt', alt),
        buildAttr('class', className),
        buildAttr('style', style),
        buildAttr('loading', loading),
        buildAttr('decoding', decoding),
        buildAttr('fetchpriority', fetchPriority),
        buildAttr('sizes', model.sizes),
        buildAttr('width', model.width),
        buildAttr('height', model.height)
    ].join('');

    if (sourcesHtml) {
        return `<picture>${sourcesHtml}<img${imgAttrs} /></picture>`;
    }

    return `<img${imgAttrs} />`;
}

export function renderImageHtml(rawProps) {
    const payload = readRuntimePayload();
    if (!payload) {
        return '';
    }
    return renderImageHtmlWithPayload(rawProps, payload);
}

export function serializeImageProps(rawProps) {
    const props = rawProps && typeof rawProps === 'object' ? rawProps : {};
    const source = normalizeImageSource(props.src);
    const alt = safeString(props.alt) || safeString(source?.alt);
    if (!source || !alt) {
        return '';
    }
    return encodeMarkerPayload({
        ...props,
        src: props.src
    });
}

export function replaceImageMarkers(html, payload) {
    if (typeof html !== 'string' || html.length === 0) {
        return html;
    }
    const runtimePayload = normalizeImageRuntimePayload(payload);
    if (!runtimePayload) {
        return html;
    }

    return html.replace(
        /(<span\b[^>]*\bdata-zenith-image=(["'])([^"']+)\2[^>]*>)([\s\S]*?)<\/span>/gi,
        (_match, openTag, _quote, encodedPayload) => {
            const props = decodeMarkerPayload(encodedPayload);
            if (!props) {
                return `${openTag}</span>`;
            }
            return `${openTag}${renderImageHtmlWithPayload(props, runtimePayload)}</span>`;
        }
    );
}
