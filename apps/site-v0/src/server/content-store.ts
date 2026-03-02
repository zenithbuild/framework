import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCmsBody } from "./content-render";

if (typeof window !== "undefined") {
    throw new Error("src/server/content-store.ts is server-only and cannot run in the browser.");
}

type ManifestItem = {
    kind?: unknown;
    slug?: unknown;
    title?: unknown;
    status?: unknown;
    source_path?: unknown;
    url?: unknown;
    category?: unknown;
    category_title?: unknown;
    category_order?: unknown;
    doc_order?: unknown;
};

type DocsNavJson = {
    categories?: unknown;
};

type DocsDemoRegistryJson = {
    version?: unknown;
    demos?: unknown;
};

type ParsedFrontmatter = {
    meta: Record<string, unknown>;
    body: string;
};

type ParsedSource = {
    meta: Record<string, unknown>;
    body: string;
    extension: string;
};

type ContentRef = {
    slug: string;
    title: string;
    status: ContentStatus;
    sourcePath: string;
    url: string;
    category: string;
    categoryTitle: string;
    categoryOrder: number | null;
    docOrder: number | null;
};

export type DocStatus = "canonical" | "draft" | "deprecated" | "internal" | "archived";
type ContentStatus = DocStatus | "published";

export type DocsNavDoc = {
    path: string;
    title: string;
    category: string;
    categoryTitle: string;
    order: number | null;
};

export type DocsNavCategory = {
    slug: string;
    title: string;
    summary: string;
    order: number;
    docs: DocsNavDoc[];
};

export type DocsNavTreeItem = {
    title: string;
    path: string;
    slug: string;
    href: string;
    order: number;
};

export type DocsNavTreeGroup = {
    id: string;
    title: string;
    order: number;
    summary: string;
    items: DocsNavTreeItem[];
};

export type DocsPageEntry = {
    path: string;
    title: string;
    html: string;
};

export type BlogListEntry = {
    slug: string;
    title: string;
    excerpt: string;
    publishedAt: string;
    updatedAt: string;
};

export type BlogPostEntry = {
    slug: string;
    title: string;
    html: string;
    publishedAt: string;
    updatedAt: string;
};

const CONTENT_STORE_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const STORAGE_ROOT = resolve(CONTENT_STORE_DIR, "..", "..", "..", "..", "packages", "docs");
const DOCS_ROOT = resolve(STORAGE_ROOT, "documentation");
const BLOG_ROOT = resolve(STORAGE_ROOT, "blog");
const DEMOS_ROOT = resolve(STORAGE_ROOT, "demos");
const MANIFEST_PATH = resolve(STORAGE_ROOT, "public", "ai", "docs.manifest.json");
const DOCS_NAV_PATH = resolve(STORAGE_ROOT, "public", "ai", "docs.nav.json");
const DOCS_DEMO_REGISTRY_PATH = resolve(DEMOS_ROOT, "registry.json");
const INCLUDE_DRAFT_DOCS = process.env.ZENITH_DOCS_INCLUDE_DRAFT === "true";
const DOC_STATUS_VALUES: ReadonlyArray<DocStatus> = ["canonical", "draft", "deprecated", "internal", "archived"];
const DOC_STATUS_SET = new Set<DocStatus>(DOC_STATUS_VALUES);

let manifestCache: { mtimeMs: number; entries: ManifestItem[] } | null = null;
let docsNavCache: { mtimeMs: number; categories: DocsNavCategory[] } | null = null;
let docsDemoRegistryCache:
    | {
        mtimeMs: number;
        demos: Map<string, DocsDemoRegistryEntry>;
      }
    | null = null;

type DocsDemoRegistryEntry = {
    id: string;
    name: string;
    sourcePath: string;
    route: string;
    height: number;
    contracts: string[];
};

export type DocsDemoEntry = {
    id: string;
    name: string;
    route: string;
    height: number;
    contracts: string[];
    source: string;
};

export type DocsDemoListEntry = {
    id: string;
    name: string;
    route: string;
    sourcePath: string;
    height: number;
    contracts: string[];
};

function toStringValue(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => toStringValue(entry))
        .filter((entry) => entry.length > 0);
}

function toNumberValue(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
        return Number.parseFloat(value.trim());
    }
    return null;
}

function normalizeDocStatus(value: unknown): DocStatus | null {
    const normalized = toStringValue(value).toLowerCase() as DocStatus;
    if (!normalized || !DOC_STATUS_SET.has(normalized)) {
        return null;
    }
    return normalized;
}

function isVisibleDocStatus(status: DocStatus): boolean {
    if (status === "canonical") {
        return true;
    }
    if (status === "draft" && INCLUDE_DRAFT_DOCS) {
        return true;
    }
    return false;
}

function warnDocStatusIssue(message: string): void {
    if (process.env.NODE_ENV === "test") {
        return;
    }
    console.warn(`[docs-status] ${message}`);
}

function stripComment(rawLine: string): string {
    let quote: string | null = null;
    for (let index = 0; index < rawLine.length; index += 1) {
        const char = rawLine[index];
        if (quote) {
            if (char === quote && rawLine[index - 1] !== "\\") {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === "#") {
            return rawLine.slice(0, index).trim();
        }
    }
    return rawLine.trim();
}

function parseFrontmatterValue(rawValue: string): unknown {
    const value = rawValue.trim();
    if (!value) {
        return "";
    }
    if (value.startsWith("[") && value.endsWith("]")) {
        try {
            return JSON.parse(value);
        } catch {
            return [];
        }
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

function parseFrontmatter(source: string): ParsedFrontmatter {
    const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) {
        return { meta: {}, body: source };
    }

    const meta: Record<string, unknown> = {};
    for (const rawLine of match[1].split("\n")) {
        const line = stripComment(rawLine);
        if (!line) {
            continue;
        }
        const delimiter = line.indexOf(":");
        if (delimiter <= 0) {
            continue;
        }
        const key = line.slice(0, delimiter).trim();
        const value = line.slice(delimiter + 1).trim();
        meta[key] = parseFrontmatterValue(value);
    }

    return {
        meta,
        body: source.slice(match[0].length)
    };
}

function normalizeSlugPath(raw: string): string {
    const segments = String(raw || "")
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length === 0) {
        return "";
    }
    if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) {
        return "";
    }
    return segments.join("/");
}

function isWithinRoot(root: string, filePath: string): boolean {
    const rel = relative(root, filePath);
    if (!rel) {
        return true;
    }
    return !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}

function relativeStoragePath(filePath: string): string {
    return relative(STORAGE_ROOT, filePath).replace(/\\/g, "/");
}

function titleFromSlug(slug: string): string {
    const lastSegment = slug.split("/").filter(Boolean).pop() || "Untitled";
    return lastSegment
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function docsHrefFromSlug(slug: string): string {
    return `/docs/${normalizeSlugPath(slug)}`;
}

function toSortableOrder(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
        const parsed = Number.parseFloat(value.trim());
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    }
    return Number.POSITIVE_INFINITY;
}

function stripDatePrefix(slug: string): string {
    const match = String(slug || "").match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
    return match ? match[1] : slug;
}

function parseDocsUrlPath(url: string): string {
    const value = toStringValue(url);
    if (!value.startsWith("/docs/")) {
        return "";
    }
    return normalizeSlugPath(value.slice("/docs/".length));
}

function coerceDocStatus(
    value: unknown,
    sourcePath: string,
    options: { allowWarning?: boolean } = {},
): DocStatus {
    const normalized = normalizeDocStatus(value);
    if (normalized) {
        return normalized;
    }
    if (options.allowWarning) {
        warnDocStatusIssue(`${sourcePath}: missing or invalid status. Treating as internal/hidden.`);
    }
    return "internal";
}

function coerceManifestItem(raw: ManifestItem): ContentRef | null {
    const kind = toStringValue(raw.kind);
    const slug = normalizeSlugPath(toStringValue(raw.slug));
    const sourcePath = toStringValue(raw.source_path);
    const title = toStringValue(raw.title);
    const status = coerceDocStatus(raw.status, `manifest:${sourcePath}`, { allowWarning: true });
    const url = toStringValue(raw.url);
    const category = normalizeSlugPath(toStringValue(raw.category));
    const categoryTitle = toStringValue(raw.category_title);
    const categoryOrder = toNumberValue(raw.category_order);
    const docOrder = toNumberValue(raw.doc_order);

    if (!slug || !sourcePath || !kind || !url) {
        return null;
    }

    const fallbackCategory = topCategoryFromPath(slug);

    return {
        slug,
        sourcePath,
        title: title || titleFromSlug(slug),
        status,
        url,
        category: category || fallbackCategory.category,
        categoryTitle: categoryTitle || fallbackCategory.categoryTitle,
        categoryOrder,
        docOrder
    };
}

async function loadManifestEntries(): Promise<ContentRef[]> {
    try {
        const manifestStat = await stat(MANIFEST_PATH);
        if (manifestCache && manifestCache.mtimeMs === manifestStat.mtimeMs) {
            return manifestCache.entries
                .map((entry) => coerceManifestItem(entry))
                .filter((entry): entry is ContentRef => Boolean(entry));
        }

        const raw = await readFile(MANIFEST_PATH, "utf8");
        const parsed = JSON.parse(raw) as { items?: ManifestItem[] };
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        manifestCache = { mtimeMs: manifestStat.mtimeMs, entries: items };

        return items
            .map((entry) => coerceManifestItem(entry))
            .filter((entry): entry is ContentRef => Boolean(entry));
    } catch {
        manifestCache = null;
        return [];
    }
}

function coerceDocsDemoRegistry(raw: DocsDemoRegistryJson): Map<string, DocsDemoRegistryEntry> {
    const demosRaw = Array.isArray(raw.demos) ? raw.demos : [];
    const out = new Map<string, DocsDemoRegistryEntry>();
    for (const row of demosRaw) {
        const record = row as Record<string, unknown>;
        const id = toStringValue(record.id);
        const name = toStringValue(record.name) || titleFromSlug(id);
        const sourcePath = toStringValue(record.source);
        const route = toStringValue(record.route) || `/__docs-demo/${id}`;
        const height = toNumberValue(record.height) ?? 360;
        const contracts = toStringArray(record.contracts);

        if (!id || !sourcePath) {
            continue;
        }
        out.set(id, {
            id,
            name,
            sourcePath,
            route,
            height,
            contracts,
        });
    }
    return out;
}

async function loadDocsDemoRegistry(): Promise<Map<string, DocsDemoRegistryEntry>> {
    try {
        const registryStat = await stat(DOCS_DEMO_REGISTRY_PATH);
        if (docsDemoRegistryCache && docsDemoRegistryCache.mtimeMs === registryStat.mtimeMs) {
            return new Map(docsDemoRegistryCache.demos);
        }
        const raw = await readFile(DOCS_DEMO_REGISTRY_PATH, "utf8");
        const parsed = JSON.parse(raw) as DocsDemoRegistryJson;
        const demos = coerceDocsDemoRegistry(parsed);
        docsDemoRegistryCache = {
            mtimeMs: registryStat.mtimeMs,
            demos,
        };
        return new Map(demos);
    } catch {
        docsDemoRegistryCache = null;
        return new Map();
    }
}

function coerceDocsNavCategories(raw: DocsNavJson): DocsNavCategory[] {
    const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : [];
    const out: DocsNavCategory[] = [];

    for (let categoryIndex = 0; categoryIndex < categoriesRaw.length; categoryIndex += 1) {
        const category = categoriesRaw[categoryIndex] as Record<string, unknown>;
        const categorySlug = normalizeSlugPath(toStringValue(category?.slug));
        if (!categorySlug) {
            continue;
        }
        const categoryTitle = toStringValue(category?.title) || titleFromSlug(categorySlug);
        const summary = toStringValue(category?.summary);
        const explicitOrder = toNumberValue(category?.order);
        const order = explicitOrder ?? (1000 + categoryIndex);
        const docsRaw = Array.isArray(category?.docs) ? category.docs : [];
        const docs: DocsNavDoc[] = [];

        for (let docIndex = 0; docIndex < docsRaw.length; docIndex += 1) {
            const doc = docsRaw[docIndex] as Record<string, unknown>;
            const slugFromField = normalizeSlugPath(toStringValue(doc?.slug));
            const slugFromUrl = parseDocsUrlPath(toStringValue(doc?.url));
            const path = slugFromField || slugFromUrl;
            if (!path || path.startsWith("_")) {
                continue;
            }
            const title = toStringValue(doc?.title) || titleFromSlug(path);
            const order = toNumberValue((doc as Record<string, unknown>)?.order);
            docs.push({
                path,
                title,
                category: categorySlug,
                categoryTitle,
                order
            });
        }

        out.push({
            slug: categorySlug,
            title: categoryTitle,
            summary,
            order,
            docs
        });
    }

    out.sort((a, b) => {
        const orderDelta = a.order - b.order;
        if (orderDelta !== 0) {
            return orderDelta;
        }
        return a.slug.localeCompare(b.slug);
    });
    return out;
}

async function loadDocsNavCategories(): Promise<DocsNavCategory[]> {
    try {
        const docsNavStat = await stat(DOCS_NAV_PATH);
        if (docsNavCache && docsNavCache.mtimeMs === docsNavStat.mtimeMs) {
            return docsNavCache.categories.map((category) => ({
                slug: category.slug,
                title: category.title,
                summary: category.summary,
                order: category.order,
                docs: category.docs.map((doc) => ({ ...doc }))
            }));
        }

        const raw = await readFile(DOCS_NAV_PATH, "utf8");
        const parsed = JSON.parse(raw) as DocsNavJson;
        const categories = coerceDocsNavCategories(parsed);
        docsNavCache = { mtimeMs: docsNavStat.mtimeMs, categories };
        return categories;
    } catch {
        docsNavCache = null;
        return [];
    }
}

async function listMarkdownFiles(
    rootDir: string,
    options: { excludeDirectoryNames?: string[] } = {},
): Promise<string[]> {
    const out: string[] = [];
    const excluded = new Set(options.excludeDirectoryNames || []);

    async function walk(current: string): Promise<void> {
        const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                if (excluded.has(entry.name)) {
                    continue;
                }
                await walk(fullPath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (!/\.(md|mdx)$/i.test(entry.name)) {
                continue;
            }
            out.push(fullPath);
        }
    }

    try {
        await walk(rootDir);
    } catch {
        return [];
    }

    out.sort((a, b) => a.localeCompare(b));
    return out;
}

async function fallbackDocsRefs(): Promise<ContentRef[]> {
    const files = await listMarkdownFiles(DOCS_ROOT, { excludeDirectoryNames: ["_legacy"] });
    const refs: ContentRef[] = [];

    for (const filePath of files) {
        if (!isWithinRoot(DOCS_ROOT, filePath)) {
            continue;
        }
        const rel = relative(DOCS_ROOT, filePath).replace(/\\/g, "/");
        const slug = normalizeSlugPath(rel.replace(/\.(md|mdx)$/i, ""));
        if (!slug) {
            continue;
        }
        const sourcePath = relativeStoragePath(filePath);
        let meta: Record<string, unknown> = {};
        try {
            const raw = await readFile(filePath, "utf8");
            meta = parseFrontmatter(raw).meta;
        } catch {
            // Keep fallback metadata.
        }
        const status = coerceDocStatus(meta.status, sourcePath, { allowWarning: true });
        if (!isVisibleDocStatus(status)) {
            continue;
        }
        const fallbackCategory = topCategoryFromPath(slug);
        const category = normalizeSlugPath(toStringValue(meta.nav_group) || fallbackCategory.category);
        const categoryTitle = toStringValue(meta.nav_group_title) || fallbackCategory.categoryTitle;
        const categoryOrder = toNumberValue(meta.nav_group_order);
        const docOrder = toNumberValue(meta.nav_order);
        refs.push({
            slug,
            sourcePath,
            title: toStringValue(meta.title) || titleFromSlug(slug),
            status,
            url: docsHrefFromSlug(slug),
            category: category || fallbackCategory.category,
            categoryTitle,
            categoryOrder,
            docOrder
        });
    }

    return refs;
}

async function fallbackBlogRefs(): Promise<ContentRef[]> {
    const files = await listMarkdownFiles(BLOG_ROOT);
    const refs: ContentRef[] = [];

    for (const filePath of files) {
        if (!isWithinRoot(BLOG_ROOT, filePath)) {
            continue;
        }
        const rel = relative(BLOG_ROOT, filePath).replace(/\\/g, "/");
        const sourceSlug = rel.replace(/\.(md|mdx)$/i, "");
        const slug = normalizeSlugPath(stripDatePrefix(sourceSlug));
        if (!slug) {
            continue;
        }
        const sourcePath = relativeStoragePath(filePath);
        let meta: Record<string, unknown> = {};
        try {
            const raw = await readFile(filePath, "utf8");
            meta = parseFrontmatter(raw).meta;
        } catch {
            // Keep fallback metadata.
        }
        refs.push({
            slug,
            sourcePath,
            title: toStringValue(meta.title) || titleFromSlug(slug),
            status: "published",
            url: `/blog/${slug}`,
            category: "",
            categoryTitle: "",
            categoryOrder: null,
            docOrder: null
        });
    }

    return refs;
}

async function docsRefs(): Promise<ContentRef[]> {
    const fromManifest = (await loadManifestEntries()).filter(
        (entry) => entry.url.startsWith("/docs/") && entry.status !== "published" && isVisibleDocStatus(entry.status)
    );
    if (fromManifest.length > 0) {
        return fromManifest;
    }
    return fallbackDocsRefs();
}

async function blogRefs(): Promise<ContentRef[]> {
    const fromManifest = (await loadManifestEntries()).filter(
        (entry) => entry.url.startsWith("/blog/") && entry.status === "published"
    );
    if (fromManifest.length > 0) {
        return fromManifest;
    }
    return fallbackBlogRefs();
}

async function readSource(sourcePath: string): Promise<ParsedSource | null> {
    const rawPath = toStringValue(sourcePath);
    if (!rawPath) {
        return null;
    }

    const fullPath = resolve(STORAGE_ROOT, rawPath);
    if (!isWithinRoot(STORAGE_ROOT, fullPath)) {
        return null;
    }

    try {
        const raw = await readFile(fullPath, "utf8");
        const parsed = parseFrontmatter(raw);
        return {
            meta: parsed.meta,
            body: parsed.body,
            extension: extname(fullPath).toLowerCase()
        };
    } catch {
        return null;
    }
}

async function renderBodyHtml(body: string, extension: string, sourcePath = ""): Promise<string> {
    const demoRegistry = await loadDocsDemoRegistry();
    const strictDemoShortcodes = process.env.CI === "true";
    if (extension === ".mdx") {
        return compileCmsBody(
            { body_mdx: body },
            { mdxEnabled: true, demoRegistry, sourcePath, strictDemoShortcodes }
        );
    }
    return compileCmsBody(
        { body_md: body },
        { mdxEnabled: true, demoRegistry, sourcePath, strictDemoShortcodes }
    );
}

function parseDateValue(value: unknown): string {
    const text = toStringValue(value);
    return text || "";
}

function sortByDateThenSlug(
    a: { publishedAt?: string; slug: string },
    b: { publishedAt?: string; slug: string }
): number {
    const aDate = toStringValue(a.publishedAt || "");
    const bDate = toStringValue(b.publishedAt || "");
    if (aDate !== bDate) {
        return bDate.localeCompare(aDate);
    }
    return a.slug.localeCompare(b.slug);
}

function topCategoryFromPath(pathValue: string): { category: string; categoryTitle: string } {
    const segments = normalizeSlugPath(pathValue).split("/").filter(Boolean);
    const first = segments.length > 1 ? segments[0] : "root";
    return {
        category: first,
        categoryTitle: titleFromSlug(first)
    };
}

function flattenDocsNavTree(tree: DocsNavTreeGroup[]): DocsNavDoc[] {
    const docs: DocsNavDoc[] = [];
    for (const group of tree) {
        for (const item of group.items) {
            docs.push({
                path: item.path,
                title: item.title,
                category: group.id,
                categoryTitle: group.title,
                order: Number.isFinite(item.order) ? item.order : null
            });
        }
    }
    return docs;
}

function categoriesFromNavTree(tree: DocsNavTreeGroup[]): DocsNavCategory[] {
    return tree.map((group) => ({
        slug: group.id,
        title: group.title,
        summary: group.summary,
        order: group.order,
        docs: group.items.map((item) => ({
            path: item.path,
            title: item.title,
            category: group.id,
            categoryTitle: group.title,
            order: Number.isFinite(item.order) ? item.order : null
        }))
    }));
}

function compareNavOrder(a: number, b: number): number {
    const aFinite = Number.isFinite(a);
    const bFinite = Number.isFinite(b);
    if (aFinite && bFinite) {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    }
    if (aFinite) {
        return -1;
    }
    if (bFinite) {
        return 1;
    }
    return 0;
}

function sortTreeGroups(a: DocsNavTreeGroup, b: DocsNavTreeGroup): number {
    const orderDelta = compareNavOrder(a.order, b.order);
    if (orderDelta !== 0) {
        return orderDelta;
    }
    const titleDelta = a.title.localeCompare(b.title);
    if (titleDelta !== 0) {
        return titleDelta;
    }
    return a.id.localeCompare(b.id);
}

function sortTreeItems(a: DocsNavTreeItem, b: DocsNavTreeItem): number {
    const orderDelta = compareNavOrder(a.order, b.order);
    if (orderDelta !== 0) {
        return orderDelta;
    }
    const titleDelta = a.title.localeCompare(b.title);
    if (titleDelta !== 0) {
        return titleDelta;
    }
    return a.path.localeCompare(b.path);
}

export async function fetchDocsNavTree(): Promise<DocsNavTreeGroup[]> {
    const refs = await docsRefs();
    const visibleRefs = refs.filter((entry) => {
        if (!entry.slug || entry.slug.startsWith("_")) {
            return false;
        }
        if (entry.slug.startsWith("_legacy/") || entry.slug.includes("/_legacy/")) {
            return false;
        }
        return true;
    });
    const categories = await loadDocsNavCategories();
    const categoryMetaById = new Map<string, DocsNavCategory>();
    const docMetaByPath = new Map<string, DocsNavDoc>();
    for (const category of categories) {
        categoryMetaById.set(category.slug, category);
        for (const doc of category.docs) {
            docMetaByPath.set(doc.path, doc);
        }
    }

    const grouped = new Map<string, DocsNavTreeGroup>();
    for (const ref of visibleRefs) {
        const fallback = topCategoryFromPath(ref.slug);
        const categoryId = normalizeSlugPath(ref.category) || fallback.category;
        if (!categoryId || categoryId.startsWith("_")) {
            continue;
        }
        const categoryMeta = categoryMetaById.get(categoryId);
        const docMeta = docMetaByPath.get(ref.slug);
        const categoryTitle = ref.categoryTitle || categoryMeta?.title || fallback.categoryTitle;
        const categoryOrder = toSortableOrder(
            ref.categoryOrder ?? categoryMeta?.order ?? Number.POSITIVE_INFINITY
        );

        let group = grouped.get(categoryId);
        if (!group) {
            group = {
                id: categoryId,
                title: categoryTitle,
                order: categoryOrder,
                summary: categoryMeta?.summary || "",
                items: []
            };
            grouped.set(categoryId, group);
        }

        const docOrder = toSortableOrder(ref.docOrder ?? docMeta?.order ?? Number.POSITIVE_INFINITY);
        const title = ref.title || docMeta?.title || titleFromSlug(ref.slug);
        group.items.push({
            title,
            path: ref.slug,
            slug: docsHrefFromSlug(ref.slug),
            href: docsHrefFromSlug(ref.slug),
            order: docOrder
        });
    }

    const tree = Array.from(grouped.values());
    for (const group of tree) {
        group.items.sort(sortTreeItems);
    }
    tree.sort(sortTreeGroups);
    return tree;
}

export async function fetchDocsList(): Promise<DocsNavDoc[]> {
    return flattenDocsNavTree(await fetchDocsNavTree());
}

export async function fetchDocByRoute(
    section: string,
    slug: string
): Promise<{ section: string; slug: string; title: string; path: string; html: string } | null> {
    const combinedPath = normalizeSlugPath(`${section}/${slug}`);
    if (!combinedPath) {
        return null;
    }

    const refs = await docsRefs();
    const match = refs.find((entry) => entry.slug === combinedPath);
    if (!match) {
        return null;
    }

    const source = await readSource(match.sourcePath);
    if (!source) {
        return null;
    }

    return {
        section,
        slug,
        title: toStringValue(source.meta.title) || match.title || titleFromSlug(combinedPath),
        path: combinedPath,
        html: await renderBodyHtml(source.body, source.extension, match.sourcePath)
    };
}

export async function fetchBlogList(): Promise<BlogListEntry[]> {
    const refs = await blogRefs();
    const posts: BlogListEntry[] = [];

    for (const ref of refs) {
        const source = await readSource(ref.sourcePath);
        if (!source) {
            continue;
        }
        const excerpt = toStringValue(source.meta.description);
        const publishedAt = parseDateValue(source.meta.date || source.meta.published_at);
        const updatedAt = parseDateValue(source.meta.last_updated || source.meta.updated_at);
        posts.push({
            slug: ref.slug,
            title: toStringValue(source.meta.title) || ref.title || titleFromSlug(ref.slug),
            excerpt,
            publishedAt,
            updatedAt
        });
    }

    posts.sort(sortByDateThenSlug);
    return posts;
}

export async function fetchBlogPostBySlug(
    rawSlug: string
): Promise<BlogPostEntry | null> {
    const slug = normalizeSlugPath(rawSlug);
    if (!slug) {
        return null;
    }

    const refs = await blogRefs();
    const match = refs.find((entry) => entry.slug === slug);
    if (!match) {
        return null;
    }

    const source = await readSource(match.sourcePath);
    if (!source) {
        return null;
    }

    return {
        slug: match.slug,
        title: toStringValue(source.meta.title) || match.title || titleFromSlug(match.slug),
        html: await renderBodyHtml(source.body, source.extension, match.sourcePath),
        publishedAt: parseDateValue(source.meta.date || source.meta.published_at),
        updatedAt: parseDateValue(source.meta.last_updated || source.meta.updated_at)
    };
}

export async function fetchDocsCategories(): Promise<DocsNavCategory[]> {
    return categoriesFromNavTree(await fetchDocsNavTree());
}

export async function fetchDocByPath(path: string): Promise<DocsPageEntry | null> {
    const normalized = normalizeSlugPath(path);
    if (!normalized) {
        return null;
    }

    const refs = await docsRefs();
    const match = refs.find((entry) => entry.slug === normalized);
    if (!match) {
        return null;
    }

    const source = await readSource(match.sourcePath);
    if (!source) {
        return null;
    }

    return {
        path: normalized,
        title: toStringValue(source.meta.title) || match.title || titleFromSlug(normalized),
        html: await renderBodyHtml(source.body, source.extension, match.sourcePath)
    };
}

export async function fetchDocsDemoById(rawId: string): Promise<DocsDemoEntry | null> {
    const id = toStringValue(rawId);
    if (!id) {
        return null;
    }

    const registry = await loadDocsDemoRegistry();
    const entry = registry.get(id);
    if (!entry) {
        return null;
    }

    const sourcePath = resolve(STORAGE_ROOT, entry.sourcePath);
    if (!isWithinRoot(DEMOS_ROOT, sourcePath)) {
        return null;
    }

    try {
        const source = await readFile(sourcePath, "utf8");
        return {
            id: entry.id,
            name: entry.name,
            route: entry.route,
            height: entry.height,
            contracts: [...entry.contracts],
            source,
        };
    } catch {
        return null;
    }
}

export async function fetchDocsDemoList(): Promise<DocsDemoListEntry[]> {
    const registry = await loadDocsDemoRegistry();
    const demos = Array.from(registry.values()).map((entry) => ({
        id: entry.id,
        name: entry.name,
        route: entry.route,
        sourcePath: entry.sourcePath,
        height: entry.height,
        contracts: [...entry.contracts],
    }));
    demos.sort((a, b) => a.id.localeCompare(b.id));
    return demos;
}
