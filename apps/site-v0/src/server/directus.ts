import {
    createDirectus,
    customEndpoint,
    readItems,
    rest,
    staticToken
} from "@directus/sdk";
import { getCmsConfig } from "./cms-config";
import { compileCmsBody } from "./content-render";
import type { CmsDirectusSchema, DocsPages, Posts } from "./directus-schema";

if (typeof window !== "undefined") {
    throw new Error("src/server/directus.ts is server-only and cannot run in the browser.");
}

const cmsConfig = getCmsConfig();
const directusConfig = cmsConfig.directus;

const DOCS_COLLECTION = directusConfig.docs.collection;
const DOCS_FIELDS = directusConfig.docs.fields;

const BLOG_COLLECTION = directusConfig.blog.collection;
const BLOG_FIELDS = directusConfig.blog.fields;
const BLOG_IMAGE_FIELD = BLOG_FIELDS.image;
type CmsCollection = string;

const directus = createServerClient();
const schemaCache = new Map<CmsCollection, Set<string> | null>();
const schemaErrorCache = new Map<CmsCollection, string>();

export interface CmsDoc {
    section: string;
    slug: string;
    path: string;
    title: string;
    summary: string;
    updatedAt: string;
    html: string;
}

export interface CmsPost {
    slug: string;
    title: string;
    excerpt: string;
    publishedAt: string;
    updatedAt: string;
    imageUrl: string;
    html: string;
}

function createServerClient() {
    let client: any = createDirectus<CmsDirectusSchema>(directusConfig.url).with(rest());
    if (directusConfig.token.length > 0) {
        client = client.with(staticToken(directusConfig.token));
    }
    return client;
}

function asString(value: unknown): string {
    if (typeof value === "string") {
        return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return "";
}

function asRelationKey(value: unknown): string {
    const direct = asString(value);
    if (direct) {
        return direct;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return (
            asString(record.id) ||
            asString(record.slug) ||
            asString(record.permalink) ||
            asString(record.key)
        );
    }
    return "";
}

function asFileId(value: unknown): string {
    const direct = asString(value);
    if (direct) {
        return direct;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return asString(record.id);
    }
    return "";
}

function uniqueFields(fields: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const field of fields) {
        const next = String(field || "").trim();
        if (!next || seen.has(next)) {
            continue;
        }
        seen.add(next);
        out.push(next);
    }
    return out;
}

function ensureBodyFieldConfigured(fields: Set<string>, candidates: string[], collection: string): void {
    const available = candidates.some((field) => fields.has(field));
    if (!available) {
        throw new Error(
            `[Directus] ${collection} is missing body fields. Configure one of: ${candidates.join(", ")}`
        );
    }
}

function normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        const directusErrors = Array.isArray(record.errors) ? record.errors : [];
        if (directusErrors.length > 0) {
            const first = directusErrors[0];
            if (first && typeof first === "object") {
                const message = asString((first as Record<string, unknown>).message);
                const reason = asString(
                    ((first as Record<string, unknown>).extensions as Record<string, unknown> | undefined)
                        ?.reason
                );
                if (message && reason) {
                    return `${message} (${reason})`;
                }
                if (message) {
                    return message;
                }
            }
        }
        try {
            return JSON.stringify(record);
        } catch {
            return String(error);
        }
    }
    return String(error);
}

function sanitizeHtml(input: string): string {
    return String(input || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');
}

function toDirectusAssetUrl(assetId: string): string {
    const id = String(assetId || "").trim();
    if (!id) {
        return "";
    }
    return `${directusConfig.url}/assets/${encodeURIComponent(id)}`;
}

function normalizeCmsImageSources(html: string): string {
    const directusUrl = directusConfig.url.replace(/\/+$/, "");
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return html.replace(/\ssrc\s*=\s*(['"])([^'"]+)\1/gi, (full, quote: string, raw: string) => {
        const value = String(raw || "").trim();
        if (!value) {
            return full;
        }
        if (/^(https?:|data:|blob:)/i.test(value)) {
            return ` src=${quote}${value}${quote}`;
        }
        if (value.startsWith("/assets/")) {
            return ` src=${quote}${directusUrl}${value}${quote}`;
        }
        if (value.startsWith("assets/")) {
            return ` src=${quote}${directusUrl}/${value}${quote}`;
        }
        if (uuidRe.test(value)) {
            return ` src=${quote}${directusUrl}/assets/${encodeURIComponent(value)}${quote}`;
        }
        return full;
    });
}

function ensureRecordHasBodyField(
    record: Record<string, unknown>,
    candidates: string[],
    collection: string
): void {
    const found = candidates.some((field) => Object.prototype.hasOwnProperty.call(record, field));
    if (!found) {
        throw new Error(
            `[Directus] ${collection} response does not include any configured body field (${candidates.join(
                ", "
            )}).`
        );
    }
}

function buildContentHtml(
    record: Record<string, unknown>,
    mdField: string,
    mdxField: string,
    htmlField: string
): string {
    const compiled = compileCmsBody(
        {
            body_md: record[mdField],
            body_mdx: record[mdxField],
            body_html: record[htmlField],
            mdx: record[mdxField]
        },
        { mdxEnabled: directusConfig.enableMdx }
    );
    return normalizeCmsImageSources(sanitizeHtml(compiled));
}

async function readSchemaFields(collection: CmsCollection): Promise<Set<string> | null> {
    if (schemaCache.has(collection)) {
        return schemaCache.get(collection)!;
    }

    try {
        const response = await directus.request(
            customEndpoint<Record<string, unknown>[]>({
                path: `/fields/${collection}`,
                method: "GET"
            })
        );

        const rows = Array.isArray(response) ? response : [];
        const names = new Set<string>();
        for (const row of rows) {
            const fieldName = asString((row as Record<string, unknown>).field);
            if (fieldName) {
                names.add(fieldName);
            }
        }

        schemaCache.set(collection, names);
        return names;
    } catch (error) {
        const message = normalizeErrorMessage(error);
        schemaErrorCache.set(collection, message);
        schemaCache.set(collection, null);
        return null;
    }
}

async function ensureCollectionReadable(
    collection: CmsCollection,
    requiredFields: string[]
): Promise<Set<string> | null> {
    const schemaFields = await readSchemaFields(collection);
    const required = uniqueFields(requiredFields);

    if (schemaFields) {
        const missing = required.filter((field) => !schemaFields.has(field));
        if (missing.length > 0) {
            throw new Error(
                `[Directus] Collection "${collection}" is missing required fields: ${missing.join(", ")}`
            );
        }
        return schemaFields;
    }

    const probeFields = required.length > 0 ? required : ["*"];
    try {
        await directus.request(
            readItems(collection as never, {
                fields: probeFields,
                limit: 1
            } as never)
        );
    } catch (itemsError) {
        const schemaError = schemaErrorCache.get(collection) || "Unknown schema endpoint error";
        throw new Error(
            `[Directus] Schema validation failed for "${collection}". ` +
                `Fields endpoint error: ${schemaError}. ` +
                `Items probe error: ${normalizeErrorMessage(itemsError)}`
        );
    }

    return null;
}

export async function validateSchemaFields(
    collection: CmsCollection,
    requiredFields: string[]
): Promise<void> {
    await ensureCollectionReadable(collection, requiredFields);
}

function buildQueryFields(schemaFields: Set<string> | null, preferredFields: string[]): string[] {
    if (!schemaFields) {
        return ["*"];
    }

    const filtered = uniqueFields(preferredFields).filter((field) => schemaFields.has(field));
    return filtered.length > 0 ? filtered : ["*"];
}

function buildSortFields(schemaFields: Set<string> | null, preferredSort: string[]): string[] {
    if (!schemaFields) {
        return [];
    }
    return uniqueFields(preferredSort).filter((field) => schemaFields.has(field));
}

function normalizeDocRecord(record: Record<string, unknown>): CmsDoc {
    const section = asRelationKey(record[DOCS_FIELDS.section]);
    const slug = asString(record[DOCS_FIELDS.slug]);
    const title = asString(record[DOCS_FIELDS.title]);

    if (!section || !slug || !title) {
        throw new Error(
            `[Directus] docs record is missing required values (${DOCS_FIELDS.section}, ${DOCS_FIELDS.slug}, ${DOCS_FIELDS.title}).`
        );
    }

    ensureRecordHasBodyField(
        record,
        [DOCS_FIELDS.bodyMd, DOCS_FIELDS.bodyMdx, DOCS_FIELDS.bodyHtml],
        DOCS_COLLECTION
    );

    const path = `${section}/${slug}`.replace(/^\/+|\/+$/g, "");
    return {
        section,
        slug,
        path,
        title,
        summary: asString(record[DOCS_FIELDS.summary]),
        updatedAt: asString(record[DOCS_FIELDS.updatedAt]),
        html: buildContentHtml(record, DOCS_FIELDS.bodyMd, DOCS_FIELDS.bodyMdx, DOCS_FIELDS.bodyHtml)
    };
}

function normalizePostRecord(record: Record<string, unknown>): CmsPost {
    const slug = asString(record[BLOG_FIELDS.slug]);
    const title = asString(record[BLOG_FIELDS.title]);

    if (!slug || !title) {
        throw new Error(
            `[Directus] blog record is missing required values (${BLOG_FIELDS.slug}, ${BLOG_FIELDS.title}).`
        );
    }

    ensureRecordHasBodyField(
        record,
        [BLOG_FIELDS.bodyMd, BLOG_FIELDS.bodyMdx, BLOG_FIELDS.bodyHtml],
        BLOG_COLLECTION
    );

    return {
        slug,
        title,
        excerpt: asString(record[BLOG_FIELDS.summary]),
        publishedAt: asString(record[BLOG_FIELDS.publishedAt]),
        updatedAt: asString(record[BLOG_FIELDS.updatedAt]),
        imageUrl: toDirectusAssetUrl(asFileId(record[BLOG_IMAGE_FIELD])),
        html: buildContentHtml(record, BLOG_FIELDS.bodyMd, BLOG_FIELDS.bodyMdx, BLOG_FIELDS.bodyHtml)
    };
}

export async function fetchDocsList(): Promise<CmsDoc[]> {
    const schemaFields = await ensureCollectionReadable(DOCS_COLLECTION, [
        DOCS_FIELDS.section,
        DOCS_FIELDS.slug,
        DOCS_FIELDS.title
    ]);

    if (schemaFields) {
        ensureBodyFieldConfigured(
            schemaFields,
            [DOCS_FIELDS.bodyMd, DOCS_FIELDS.bodyMdx, DOCS_FIELDS.bodyHtml],
            DOCS_COLLECTION
        );
    }

    const query: Record<string, unknown> = {
        fields: buildQueryFields(schemaFields, [
            DOCS_FIELDS.section,
            DOCS_FIELDS.slug,
            DOCS_FIELDS.title,
            DOCS_FIELDS.order,
            DOCS_FIELDS.summary,
            DOCS_FIELDS.updatedAt,
            DOCS_FIELDS.bodyMd,
            DOCS_FIELDS.bodyMdx,
            DOCS_FIELDS.bodyHtml
        ]),
        limit: 1000
    };

    const sort = buildSortFields(schemaFields, [DOCS_FIELDS.section, DOCS_FIELDS.order, DOCS_FIELDS.slug]);
    if (sort.length > 0) {
        query.sort = sort;
    }

    let rows: unknown;
    try {
        rows = await directus.request(readItems(DOCS_COLLECTION as never, query as never));
    } catch (error) {
        throw new Error(`[Directus] Failed to read docs list: ${normalizeErrorMessage(error)}`);
    }

    const list = Array.isArray(rows) ? (rows as Array<DocsPages & Record<string, unknown>>) : [];
    return list
        .map((row) => normalizeDocRecord(row))
        .sort((a, b) => a.path.localeCompare(b.path));
}

export async function fetchDocByRoute(section: string, slug: string): Promise<CmsDoc | null> {
    const schemaFields = await ensureCollectionReadable(DOCS_COLLECTION, [
        DOCS_FIELDS.section,
        DOCS_FIELDS.slug,
        DOCS_FIELDS.title
    ]);

    if (schemaFields) {
        ensureBodyFieldConfigured(
            schemaFields,
            [DOCS_FIELDS.bodyMd, DOCS_FIELDS.bodyMdx, DOCS_FIELDS.bodyHtml],
            DOCS_COLLECTION
        );
    }

    const query: Record<string, unknown> = {
        fields: buildQueryFields(schemaFields, [
            DOCS_FIELDS.section,
            DOCS_FIELDS.slug,
            DOCS_FIELDS.title,
            DOCS_FIELDS.summary,
            DOCS_FIELDS.updatedAt,
            DOCS_FIELDS.bodyMd,
            DOCS_FIELDS.bodyMdx,
            DOCS_FIELDS.bodyHtml
        ]),
        filter: {
            _and: [
                { [DOCS_FIELDS.section]: { _eq: section } },
                { [DOCS_FIELDS.slug]: { _eq: slug } }
            ]
        },
        limit: 1
    };

    let rows: unknown;
    try {
        rows = await directus.request(readItems(DOCS_COLLECTION as never, query as never));
    } catch (error) {
        throw new Error(`[Directus] Failed to read doc "${section}/${slug}": ${normalizeErrorMessage(error)}`);
    }

    const record = Array.isArray(rows) ? (rows[0] as (DocsPages & Record<string, unknown>) | undefined) : null;
    if (!record) {
        return null;
    }
    return normalizeDocRecord(record);
}

export async function fetchBlogList(): Promise<CmsPost[]> {
    const schemaFields = await ensureCollectionReadable(BLOG_COLLECTION, [
        BLOG_FIELDS.slug,
        BLOG_FIELDS.title
    ]);

    if (schemaFields) {
        ensureBodyFieldConfigured(
            schemaFields,
            [BLOG_FIELDS.bodyMd, BLOG_FIELDS.bodyMdx, BLOG_FIELDS.bodyHtml],
            BLOG_COLLECTION
        );
    }

    const query: Record<string, unknown> = {
        fields: buildQueryFields(schemaFields, [
            BLOG_FIELDS.slug,
            BLOG_FIELDS.title,
            BLOG_FIELDS.summary,
            BLOG_FIELDS.publishedAt,
            BLOG_FIELDS.updatedAt,
            BLOG_IMAGE_FIELD,
            BLOG_FIELDS.bodyMd,
            BLOG_FIELDS.bodyMdx,
            BLOG_FIELDS.bodyHtml
        ]),
        limit: 1000
    };

    const sort = buildSortFields(schemaFields, [BLOG_FIELDS.publishedAt, BLOG_FIELDS.updatedAt]);
    if (sort.length > 0) {
        query.sort = sort;
    }

    let rows: unknown;
    try {
        rows = await directus.request(readItems(BLOG_COLLECTION as never, query as never));
    } catch (error) {
        throw new Error(`[Directus] Failed to read blog list: ${normalizeErrorMessage(error)}`);
    }

    const list = Array.isArray(rows) ? (rows as Array<Posts & Record<string, unknown>>) : [];
    return list
        .map((row) => normalizePostRecord(row))
        .sort((a, b) => {
            const left = a.publishedAt || a.updatedAt;
            const right = b.publishedAt || b.updatedAt;
            return right.localeCompare(left);
        });
}

export async function fetchBlogPostBySlug(slug: string): Promise<CmsPost | null> {
    const schemaFields = await ensureCollectionReadable(BLOG_COLLECTION, [
        BLOG_FIELDS.slug,
        BLOG_FIELDS.title
    ]);

    if (schemaFields) {
        ensureBodyFieldConfigured(
            schemaFields,
            [BLOG_FIELDS.bodyMd, BLOG_FIELDS.bodyMdx, BLOG_FIELDS.bodyHtml],
            BLOG_COLLECTION
        );
    }

    const query: Record<string, unknown> = {
        fields: buildQueryFields(schemaFields, [
            BLOG_FIELDS.slug,
            BLOG_FIELDS.title,
            BLOG_FIELDS.summary,
            BLOG_FIELDS.publishedAt,
            BLOG_FIELDS.updatedAt,
            BLOG_IMAGE_FIELD,
            BLOG_FIELDS.bodyMd,
            BLOG_FIELDS.bodyMdx,
            BLOG_FIELDS.bodyHtml
        ]),
        filter: {
            [BLOG_FIELDS.slug]: { _eq: slug }
        },
        limit: 1
    };

    let rows: unknown;
    try {
        rows = await directus.request(readItems(BLOG_COLLECTION as never, query as never));
    } catch (error) {
        throw new Error(`[Directus] Failed to read blog post "${slug}": ${normalizeErrorMessage(error)}`);
    }

    const record = Array.isArray(rows) ? (rows[0] as (Posts & Record<string, unknown>) | undefined) : null;
    if (!record) {
        return null;
    }
    return normalizePostRecord(record);
}

export async function getDocBySlug(slugPath: string): Promise<CmsDoc | null> {
    const parts = String(slugPath || "")
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean);
    if (parts.length < 2) {
        return null;
    }
    const slug = parts[parts.length - 1];
    const section = parts.slice(0, -1).join("/");
    return fetchDocByRoute(section, slug);
}

export async function getAllDocsForNav(): Promise<CmsDoc[]> {
    return fetchDocsList();
}

export async function getPostBySlug(slug: string): Promise<CmsPost | null> {
    return fetchBlogPostBySlug(slug);
}

export async function getAllPosts(): Promise<CmsPost[]> {
    return fetchBlogList();
}
