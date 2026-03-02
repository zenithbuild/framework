import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (typeof window !== "undefined") {
    throw new Error("src/server/cms-config.ts is server-only and cannot run in the browser.");
}

export interface DocsFieldMap {
    section: string;
    slug: string;
    title: string;
    order: string;
    summary: string;
    updatedAt: string;
    bodyMd: string;
    bodyMdx: string;
    bodyHtml: string;
}

export interface BlogFieldMap {
    slug: string;
    title: string;
    summary: string;
    image: string;
    publishedAt: string;
    updatedAt: string;
    bodyMd: string;
    bodyMdx: string;
    bodyHtml: string;
}

export interface DirectusCmsConfig {
    url: string;
    token: string;
    enableMdx: boolean;
    docs: {
        collection: string;
        fields: DocsFieldMap;
    };
    blog: {
        collection: string;
        fields: BlogFieldMap;
    };
}

export interface CmsConfig {
    directus: DirectusCmsConfig;
}

const CMS_CONFIG_FILENAME = ".zenithrc.json";
const CMS_CONFIG_PATH = resolve(process.cwd(), CMS_CONFIG_FILENAME);

// Canonical defaults are aligned with zenith-cms template collections/fields.
const DEFAULT_CONFIG: CmsConfig = {
    directus: {
        url: "http://localhost:8055",
        token: "",
        enableMdx: true,
        docs: {
            collection: "docs_pages",
            fields: {
                section: "section_id",
                slug: "id",
                title: "title",
                order: "order",
                summary: "description",
                updatedAt: "updated_at",
                bodyMd: "body_md",
                bodyMdx: "mdx",
                bodyHtml: "body_html"
            }
        },
        blog: {
            collection: "posts",
            fields: {
                slug: "slug",
                title: "title",
                summary: "description",
                image: "image",
                publishedAt: "published_at",
                updatedAt: "updated_at",
                bodyMd: "body_md",
                bodyMdx: "mdx",
                bodyHtml: "content"
            }
        }
    }
};

let cachedConfig: CmsConfig | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string): string {
    if (typeof value !== "string") {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function getRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function mergeDocsFields(input: unknown): DocsFieldMap {
    const raw = getRecord(input);
    const fallback = DEFAULT_CONFIG.directus.docs.fields;
    return {
        section: pickString(raw.section, fallback.section),
        slug: pickString(raw.slug, fallback.slug),
        title: pickString(raw.title, fallback.title),
        order: pickString(raw.order, fallback.order),
        summary: pickString(raw.summary, fallback.summary),
        updatedAt: pickString(raw.updatedAt, fallback.updatedAt),
        bodyMd: pickString(raw.bodyMd, fallback.bodyMd),
        bodyMdx: pickString(raw.bodyMdx, fallback.bodyMdx),
        bodyHtml: pickString(raw.bodyHtml, fallback.bodyHtml)
    };
}

function mergeBlogFields(input: unknown): BlogFieldMap {
    const raw = getRecord(input);
    const fallback = DEFAULT_CONFIG.directus.blog.fields;
    return {
        slug: pickString(raw.slug, fallback.slug),
        title: pickString(raw.title, fallback.title),
        summary: pickString(raw.summary, fallback.summary),
        image: pickString(raw.image, fallback.image),
        publishedAt: pickString(raw.publishedAt, fallback.publishedAt),
        updatedAt: pickString(raw.updatedAt, fallback.updatedAt),
        bodyMd: pickString(raw.bodyMd, fallback.bodyMd),
        bodyMdx: pickString(raw.bodyMdx, fallback.bodyMdx),
        bodyHtml: pickString(raw.bodyHtml, fallback.bodyHtml)
    };
}

function readUserConfig(): Record<string, unknown> {
    if (!existsSync(CMS_CONFIG_PATH)) {
        return {};
    }
    const raw = readFileSync(CMS_CONFIG_PATH, "utf8");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`[CMS Config] Failed to parse ${CMS_CONFIG_FILENAME}: ${reason}`);
    }
    if (!isRecord(parsed)) {
        throw new Error(`[CMS Config] ${CMS_CONFIG_FILENAME} must contain a JSON object at the root.`);
    }
    return parsed;
}

export function getCmsConfig(): CmsConfig {
    if (cachedConfig) {
        return cachedConfig;
    }

    const userConfig = readUserConfig();
    const directus = getRecord(userConfig.directus);
    const docs = getRecord(directus.docs);
    const blog = getRecord(directus.blog);
    const defaults = DEFAULT_CONFIG.directus;

    const resolved: CmsConfig = {
        directus: {
            url: pickString(directus.url, defaults.url).replace(/\/+$/, ""),
            token: pickString(directus.token, defaults.token),
            enableMdx: pickBoolean(directus.enableMdx, defaults.enableMdx),
            docs: {
                collection: pickString(docs.collection, defaults.docs.collection),
                fields: mergeDocsFields(docs.fields)
            },
            blog: {
                collection: pickString(blog.collection, defaults.blog.collection),
                fields: mergeBlogFields(blog.fields)
            }
        }
    };

    if (!resolved.directus.url) {
        throw new Error(`[CMS Config] directus.url is required in ${CMS_CONFIG_FILENAME}.`);
    }

    cachedConfig = resolved;
    return resolved;
}
