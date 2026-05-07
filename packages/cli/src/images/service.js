import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { fetchRemoteImage, isLocalNetworkAddress, validateRemoteTarget } from './remote-fetch.js';
import {
    buildLocalImageKey,
    buildLocalVariantAssetPath,
    normalizeImageConfig,
    normalizeImageFormat
} from './shared.js';

const RASTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const MIME_BY_FORMAT = {
    avif: 'image/avif',
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
};
function mimeTypeForFormat(format) {
    return MIME_BY_FORMAT[normalizeImageFormat(format)] || 'application/octet-stream';
}

function uniqueSortedWidths(config, metadataWidth) {
    const values = new Set([
        ...(config.deviceSizes || []),
        ...(config.imageSizes || [])
    ]);
    if (Number.isInteger(metadataWidth) && metadataWidth > 0) {
        values.add(metadataWidth);
    }
    return [...values]
        .filter((value) => Number.isInteger(value) && value > 0)
        .filter((value) => !metadataWidth || value <= metadataWidth)
        .sort((left, right) => left - right);
}

function resolvePublicRoots(projectRoot) {
    const candidates = [
        resolve(projectRoot, 'src', 'public'),
        resolve(projectRoot, 'public')
    ];
    return candidates.filter((candidate, index) => existsSync(candidate) && candidates.indexOf(candidate) === index);
}

async function walkPublicImages(rootDir) {
    const files = [];
    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            const extension = extname(entry.name).toLowerCase();
            if (RASTER_EXTENSIONS.has(extension)) {
                files.push(fullPath);
            }
        }
    }
    await walk(rootDir);
    return files;
}

async function writeIfStale(sourcePath, targetPath, buffer) {
    const sourceInfo = await stat(sourcePath);
    if (existsSync(targetPath)) {
        const targetInfo = await stat(targetPath);
        if (targetInfo.mtimeMs >= sourceInfo.mtimeMs) {
            return;
        }
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
}

function variantRelativePath(publicPath, width, quality, format) {
    return buildLocalVariantAssetPath(publicPath, width, quality, format).replace(/^\//, '');
}

function createRemoteCacheKey(url, width, quality, format) {
    return buildLocalImageKey(`${url}|${width}|${quality}|${format || 'original'}`);
}

async function transformImageBuffer(buffer, width, quality, format) {
    let pipeline = sharp(buffer, { animated: false }).rotate();
    if (Number.isInteger(width) && width > 0) {
        pipeline = pipeline.resize({ width, withoutEnlargement: true });
    }
    switch (normalizeImageFormat(format)) {
        case 'avif':
            return pipeline.avif({ quality }).toBuffer();
        case 'webp':
            return pipeline.webp({ quality }).toBuffer();
        case 'png':
            return pipeline.png({ quality }).toBuffer();
        case 'jpg':
        case 'jpeg':
            return pipeline.jpeg({ quality }).toBuffer();
        default:
            return pipeline.toBuffer();
    }
}

export async function buildImageArtifacts(options) {
    const {
        projectRoot,
        outDir,
        config: rawConfig
    } = options;
    const config = normalizeImageConfig(rawConfig);
    const manifest = {};
    const publicRoots = resolvePublicRoots(projectRoot);
    if (publicRoots.length === 0) {
        return { manifest };
    }

    for (const publicRoot of publicRoots) {
        const files = await walkPublicImages(publicRoot);
        for (const filePath of files) {
            const publicPath = `/${relative(publicRoot, filePath).replaceAll('\\', '/')}`;
            if (manifest[publicPath]) {
                continue;
            }
            const image = sharp(filePath, { animated: false });
            const metadata = await image.metadata();
            if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || !metadata.format) {
                continue;
            }

            const widths = uniqueSortedWidths(config, metadata.width);
            const originalFormat = normalizeImageFormat(metadata.format);
            const formats = [...new Set([originalFormat, ...config.formats])];
            const quality = config.quality;
            const key = buildLocalImageKey(publicPath);

            manifest[publicPath] = {
                key,
                width: metadata.width,
                height: metadata.height,
                originalFormat,
                availableWidths: widths,
                availableFormats: formats
            };

            const sourceBuffer = await readFile(filePath);
            for (const width of widths) {
                for (const format of formats) {
                    const buffer = await transformImageBuffer(sourceBuffer, width, quality, format);
                    const outputPath = join(outDir, variantRelativePath(publicPath, width, quality, format));
                    await writeIfStale(filePath, outputPath, buffer);
                }
            }
        }
    }

    const manifestPath = join(outDir, '_zenith', 'image', 'manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { manifest };
}

async function readRemoteBuffer(response, maxBytes) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) {
            throw new Error('[Zenith:Image] Remote image exceeds maxRemoteBytes');
        }
        return buffer;
    }

    let total = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > maxBytes) {
            throw new Error('[Zenith:Image] Remote image exceeds maxRemoteBytes');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

function sendBuffer(res, status, contentType, buffer, cacheSeconds) {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${cacheSeconds}`
    });
    res.end(buffer);
}

function remoteCachePaths(cacheDir, cacheKey) {
    return {
        dataPath: join(cacheDir, `${cacheKey}.img`),
        metaPath: join(cacheDir, `${cacheKey}.json`)
    };
}

function createJsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

function createBufferResponse(status, contentType, buffer, cacheSeconds) {
    return new Response(buffer, {
        status,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': `public, max-age=${cacheSeconds}`
        }
    });
}

async function sendResponse(res, response) {
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
}

async function createImageResponse(options) {
    const {
        requestUrl,
        projectRoot,
        config: rawConfig
    } = options;
    const config = normalizeImageConfig(rawConfig);
    const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
    const remoteUrl = url.searchParams.get('url');
    const width = Number.parseInt(url.searchParams.get('w') || '', 10);
    const requestedQuality = Number.parseInt(url.searchParams.get('q') || '', 10);
    const format = normalizeImageFormat(url.searchParams.get('f') || '');
    const quality = Number.isInteger(requestedQuality) && requestedQuality > 0 ? requestedQuality : config.quality;

    if (!remoteUrl) {
        return createJsonResponse(400, { error: 'missing_url' });
    }
    if (!Number.isInteger(width) || width <= 0) {
        return createJsonResponse(400, { error: 'invalid_width' });
    }

    try {
        const remote = await validateRemoteTarget(remoteUrl, config);
        const cacheKey = createRemoteCacheKey(remote.toString(), width, quality, format || 'original');
        const cacheDir = resolve(projectRoot, '.zenith', 'image-cache');
        const { dataPath, metaPath } = remoteCachePaths(cacheDir, cacheKey);
        if (existsSync(dataPath) && existsSync(metaPath)) {
            const [cached, cachedMeta] = await Promise.all([
                readFile(dataPath),
                readFile(metaPath, 'utf8')
            ]);
            const parsedMeta = JSON.parse(cachedMeta);
            const contentType = typeof parsedMeta?.contentType === 'string'
                ? parsedMeta.contentType
                : mimeTypeForFormat(format || 'jpg');
            return createBufferResponse(200, contentType, cached, config.minimumCacheTTL);
        }

        const response = await fetchRemoteImage(remote, config);
        if (!response.ok) {
            throw new Error(`[Zenith:Image] Remote image fetch failed with status ${response.status}`);
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            throw new Error('[Zenith:Image] Remote response was not an image');
        }
        if (contentType.includes('svg') && !config.allowSvg) {
            throw new Error('[Zenith:Image] SVG images are blocked unless images.allowSvg is enabled');
        }

        const buffer = await readRemoteBuffer(response, config.maxRemoteBytes);
        const metadata = await sharp(buffer, { animated: false }).metadata();
        if ((metadata.width || 0) * (metadata.height || 0) > config.maxPixels) {
            throw new Error('[Zenith:Image] Remote image exceeds maxPixels');
        }

        const sourceFormat = normalizeImageFormat(metadata.format);
        const targetFormat = format || (sourceFormat === 'gif' ? 'png' : sourceFormat || 'jpg');
        const output = await transformImageBuffer(buffer, width, quality, targetFormat);
        await mkdir(cacheDir, { recursive: true });
        await Promise.all([
            writeFile(dataPath, output),
            writeFile(metaPath, `${JSON.stringify({
                contentType: mimeTypeForFormat(targetFormat),
                format: targetFormat
            }, null, 2)}\n`, 'utf8')
        ]);
        return createBufferResponse(200, mimeTypeForFormat(targetFormat), output, config.minimumCacheTTL);
    } catch (error) {
        return createJsonResponse(400, {
            error: 'image_request_failed',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * @param {Request | { url?: string } | null | undefined} request
 * @param {{ requestUrl?: URL | string, projectRoot: string, config?: Record<string, unknown> }} options
 * @returns {Promise<Response>}
 */
export async function handleImageFetchRequest(request, options) {
    return createImageResponse({
        ...options,
        requestUrl: request?.url || options?.requestUrl
    });
}

export async function handleImageRequest(_req, res, options) {
    const response = await createImageResponse(options);
    await sendResponse(res, response);
    return true;
}

export const __imageServiceTestHooks = {
    fetchRemoteImage,
    isLocalNetworkAddress,
    validateRemoteTarget
};
