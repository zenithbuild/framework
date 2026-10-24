export const DOWNLOAD_PAYLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
export const DOWNLOAD_DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const CONTROL_CHAR_RE = /[\0-\x1F\x7F]/;
const PATH_SEPARATOR_RE = /[\\/]/;

function formatWhere(where = 'download(...)') {
    return String(where || 'download(...)');
}

function normalizeFilename(filename, where = 'download(...)') {
    const label = formatWhere(where);
    const value = String(filename ?? '').trim();
    if (!value) {
        throw new Error(`[Zenith] ${label}: download filename is required.`);
    }
    if (CONTROL_CHAR_RE.test(value) || PATH_SEPARATOR_RE.test(value)) {
        throw new Error(`[Zenith] ${label}: download filename must not contain path separators or control characters.`);
    }
    return value;
}

function normalizeContentType(contentType, where = 'download(...)') {
    const label = formatWhere(where);
    if (contentType === undefined || contentType === null) {
        return DOWNLOAD_DEFAULT_CONTENT_TYPE;
    }
    const value = String(contentType).trim();
    if (!value) {
        throw new Error(`[Zenith] ${label}: download contentType must be a non-empty string when provided.`);
    }
    if (CONTROL_CHAR_RE.test(value)) {
        throw new Error(`[Zenith] ${label}: download contentType must not contain control characters.`);
    }
    return value;
}

function isBlobLike(value) {
    return (typeof Blob !== 'undefined' && value instanceof Blob)
        || (typeof File !== 'undefined' && value instanceof File);
}

function encodeBuffer(buffer, encoding) {
    return encoding === 'utf8'
        ? buffer.toString('utf8')
        : buffer.toString('base64');
}

function decodeBody(body, bodyEncoding, where = 'download(...)') {
    const label = formatWhere(where);
    if (typeof body !== 'string') {
        throw new Error(`[Zenith] ${label}: download body must be a string after normalization.`);
    }
    if (bodyEncoding === 'utf8') {
        return Buffer.from(body, 'utf8');
    }
    if (bodyEncoding === 'base64') {
        return Buffer.from(body, 'base64');
    }
    throw new Error(`[Zenith] ${label}: download bodyEncoding must be "utf8" or "base64".`);
}

function normalizeBody(body, where = 'download(...)') {
    const label = formatWhere(where);
    if (isBlobLike(body)) {
        throw new Error(`[Zenith] ${label}: download body must be string, Uint8Array, ArrayBuffer, or Buffer-compatible bytes.`);
    }

    if (typeof body === 'string') {
        const size = Buffer.byteLength(body, 'utf8');
        if (size > DOWNLOAD_PAYLOAD_LIMIT_BYTES) {
            throw new Error(`[Zenith] ${label}: download payload exceeds ${DOWNLOAD_PAYLOAD_LIMIT_BYTES} bytes.`);
        }
        return {
            body: body,
            bodyEncoding: 'utf8',
            bodySize: size
        };
    }

    if (body instanceof ArrayBuffer) {
        const buffer = Buffer.from(body);
        if (buffer.byteLength > DOWNLOAD_PAYLOAD_LIMIT_BYTES) {
            throw new Error(`[Zenith] ${label}: download payload exceeds ${DOWNLOAD_PAYLOAD_LIMIT_BYTES} bytes.`);
        }
        return {
            body: encodeBuffer(buffer, 'base64'),
            bodyEncoding: 'base64',
            bodySize: buffer.byteLength
        };
    }

    if (ArrayBuffer.isView(body)) {
        const buffer = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
        if (buffer.byteLength > DOWNLOAD_PAYLOAD_LIMIT_BYTES) {
            throw new Error(`[Zenith] ${label}: download payload exceeds ${DOWNLOAD_PAYLOAD_LIMIT_BYTES} bytes.`);
        }
        return {
            body: encodeBuffer(buffer, 'base64'),
            bodyEncoding: 'base64',
            bodySize: buffer.byteLength
        };
    }

    throw new Error(`[Zenith] ${label}: download body must be string, Uint8Array, ArrayBuffer, or Buffer-compatible bytes.`);
}

function buildAsciiFilename(filename) {
    const replaced = Array.from(String(filename || '')).map((char) => {
        const code = char.charCodeAt(0);
        if (code < 0x20 || code > 0x7E || char === '"' || char === '\\') {
            return '_';
        }
        return char;
    }).join('');
    return replaced || 'download';
}

export function buildAttachmentContentDisposition(filename) {
    const safeFilename = normalizeFilename(filename, 'download result');
    const asciiFilename = buildAsciiFilename(safeFilename);
    const encodedFilename = encodeURIComponent(safeFilename)
        .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, '%2A');
    return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

export function createDownloadResult(body, options = {}) {
    const filename = normalizeFilename(options?.filename, 'download(...)');
    const contentType = normalizeContentType(options?.contentType, 'download(...)');
    const normalized = normalizeBody(body, 'download(...)');
    return {
        kind: 'download',
        body: normalized.body,
        bodyEncoding: normalized.bodyEncoding,
        bodySize: normalized.bodySize,
        filename,
        contentType,
        status: 200
    };
}

export function assertValidDownloadResult(value, where = 'download result') {
    const label = formatWhere(where);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[Zenith] ${label}: download result must be an object.`);
    }

    normalizeFilename(value.filename, label);
    normalizeContentType(value.contentType, label);

    if (value.status !== 200) {
        throw new Error(`[Zenith] ${label}: download status is fixed to 200 in this milestone.`);
    }

    if (!Number.isInteger(value.bodySize) || value.bodySize < 0 || value.bodySize > DOWNLOAD_PAYLOAD_LIMIT_BYTES) {
        throw new Error(`[Zenith] ${label}: download bodySize must be an integer between 0 and ${DOWNLOAD_PAYLOAD_LIMIT_BYTES}.`);
    }

    const buffer = decodeBody(value.body, value.bodyEncoding, label);
    if (buffer.byteLength !== value.bodySize) {
        throw new Error(`[Zenith] ${label}: download bodySize does not match the normalized body.`);
    }
}

export function decodeDownloadResultBody(result, where = 'download result') {
    assertValidDownloadResult(result, where);
    return decodeBody(result.body, result.bodyEncoding, where);
}
