import { readFile } from "node:fs/promises";
import { createDirectusServerClient, type DirectusServerClient } from "./directusClient";
import {
  deriveDocumentationLeafSlug,
  excerptText,
  extractDocumentationDescription,
  formatDocumentationDetailPath,
  humanizeDocumentationSlug,
  readLocalDocumentationTagsMap,
  renderDocumentationHtml,
  stripDocumentationFrontmatter,
} from "./documentationSourceSupport";

type SourceMode = "local" | "directus";

interface DocsNavCategoryRecord {
  slug: string;
  title: string;
  summary?: string;
  order: number | null;
  docs: DocsNavDocRecord[];
}

interface DocsNavDocRecord {
  slug: string;
  title: string;
  label?: string;
  url?: string;
  order?: number | null;
  status?: string;
  source_path: string;
}

interface DirectusDocumentationSectionRecord {
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  order?: number | null;
  route_base?: string | null;
}

interface DirectusDocumentationTagRecord {
  slug?: string | null;
  title?: string | null;
  color?: string | null;
  order?: number | null;
}

interface DirectusDocumentationRecord {
  slug: string;
  title: string;
  description?: string | null;
  markdown_raw?: string | null;
  html_rendered?: string | null;
  source_path?: string | null;
  source_kind?: string | null;
  status?: string | null;
  category?: string | null;
  category_label?: string | null;
  category_order?: number | null;
  doc_order?: number | null;
  category_ref?: DirectusDocumentationSectionRecord | null;
  section?: DirectusDocumentationSectionRecord | null;
  tags?: Array<{ tag?: DirectusDocumentationTagRecord | null; tags_id?: DirectusDocumentationTagRecord | null } | DirectusDocumentationTagRecord> | null;
}

export interface DocumentationTag {
  slug: string;
  title: string;
  color: string | null;
  order: number | null;
}

export interface DocumentationSection {
  slug: string;
  title: string;
  description: string | null;
  order: number;
  path: string;
}

export interface DocumentationNavEntry {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  path: string;
  sourcePath: string | null;
  section: DocumentationSection;
  tags: DocumentationTag[];
  tagSlugs: string[];
  tagTitles: string[];
  searchText: string;
  docOrder: number | null;
}

export interface DocumentationSectionGroup {
  section: DocumentationSection;
  entries: DocumentationNavEntry[];
}

export interface DocumentationDetail {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  path: string;
  sourcePath: string | null;
  sourceKind: string;
  status: string;
  section: DocumentationSection;
  tags: DocumentationTag[];
  markdownRaw: string;
  htmlRendered: string | null;
  docOrder: number | null;
}

export interface DocumentationIndexSource {
  sourceMode: SourceMode;
  sections: DocumentationSectionGroup[];
  tags: DocumentationTag[];
}

export interface DocumentationDetailSource {
  sourceMode: SourceMode;
  document: DocumentationDetail | null;
}

interface DocumentationDetailLookup {
  slug: string;
  sectionSlug?: string | null;
}

const DOCS_NAV_URL = new URL("../../../docs/public/ai/docs.nav.json", import.meta.url);
const DOCS_ROOT_URL = new URL("../../../docs/", import.meta.url);

const BASE_DOCUMENTATION_FIELDS = ["slug", "title", "description", "markdown_raw", "html_rendered", "source_path", "source_kind", "status", "category", "category_label", "category_order", "doc_order"] as const;
const RELATIONAL_DOCUMENTATION_FIELDS = ["category_ref.slug", "category_ref.title", "category_ref.description", "category_ref.order", "category_ref.route_base", "section.slug", "section.title", "section.description", "section.order", "tags.tag.slug", "tags.tag.title", "tags.tag.color", "tags.tag.order", "tags.tags_id.slug", "tags.tags_id.title", "tags.tags_id.color", "tags.tags_id.order"] as const;

const DOCUMENTATION_SORT = ["category_order", "doc_order", "title", "source_path"] as const;

export function resolveDocumentationSourceMode(): SourceMode {
  const mode = (process.env.ZENITH_DOCUMENTATION_SOURCE || "local").trim().toLowerCase();

  if (mode === "local" || mode === "directus") {
    return mode;
  }

  throw new Error(
    `Unsupported ZENITH_DOCUMENTATION_SOURCE "${mode}". Use "local" or "directus".`,
  );
}

export function getDocumentationDirectusQueryPlan() {
  return {
    collection: "documentation",
    fields: [...BASE_DOCUMENTATION_FIELDS, ...RELATIONAL_DOCUMENTATION_FIELDS],
    sort: [...DOCUMENTATION_SORT],
    query: {
      "filter[status][_eq]": "published",
      "filter[source_kind][_eq]": "repo_sync",
    },
  };
}

export async function loadDocumentationIndexSource(): Promise<DocumentationIndexSource> {
  const sourceMode = resolveDocumentationSourceMode();
  const entries = sourceMode === "directus"
    ? await loadDirectusDocumentationEntries()
    : await loadLocalDocumentationEntries();

  return {
    sourceMode,
    sections: groupDocumentationEntries(entries),
    tags: collectDocumentationTags(entries),
  };
}

export async function loadDocumentationDetailSource(slug: string): Promise<DocumentationDetailSource> {
  return loadDocumentationDetailFromLookup(slug);
}

export async function loadDocumentationDetailFromLookup(
  lookupInput: string | DocumentationDetailLookup,
): Promise<DocumentationDetailSource> {
  const sourceMode = resolveDocumentationSourceMode();
  const entries = sourceMode === "directus"
    ? await loadDirectusDocumentationEntries()
    : await loadLocalDocumentationEntries();
  const lookup = normalizeDocumentationLookup(lookupInput);

  return {
    sourceMode,
    document: entries.find((entry) => matchesDocumentationLookup(entry, lookup)) || null,
  };
}

async function loadDirectusDocumentationEntries(): Promise<DocumentationDetail[]> {
  const client = await createDirectusServerClient();
  const records = await queryDirectusDocumentationRecords(client);

  return [...records]
    .map((record) => mapDirectusDocumentationRecord(record))
    .sort(compareDocumentationEntries);
}

async function loadLocalDocumentationEntries(): Promise<DocumentationDetail[]> {
  const nav = await readLocalDocsNav();
  const localTagsByDoc = await readLocalDocumentationTagsMap();
  const entries = [];

  for (const category of nav.categories || []) {
    const section = mapNavCategoryToSection(category);
    for (const doc of category.docs || []) {
      const routeKey = doc.slug;
      const slug = deriveDocumentationLeafSlug(routeKey);
      const sourcePath = normalizeLocalSourcePath(doc.source_path);
      const fileUrl = new URL(sourcePath, DOCS_ROOT_URL);
      const raw = await readFile(fileUrl, "utf8");
      const markdownRaw = stripDocumentationFrontmatter(raw).trimStart();
      const description = extractDocumentationDescription(markdownRaw, doc.title);
      entries.push({
        slug,
        title: doc.title,
        description,
        excerpt: excerptText(description, 180),
        path: doc.url || formatDocumentationDetailPath(section.slug, slug),
        sourcePath: `docs/${sourcePath}`,
        sourceKind: "repo_sync",
        status: doc.status || "published",
        section,
        tags: mapLocalTags(localTagsByDoc.get(routeKey) || []),
        markdownRaw,
        htmlRendered: renderDocumentationHtml(markdownRaw),
        docOrder: Number.isInteger(doc.order) ? doc.order : null,
      });
    }
  }

  return entries.sort(compareDocumentationEntries);
}

async function queryDirectusDocumentationRecords(
  client: DirectusServerClient,
): Promise<DirectusDocumentationRecord[]> {
  const plan = getDocumentationDirectusQueryPlan();
  const baseOptions = {
    sort: [...plan.sort],
    query: plan.query,
    limit: -1,
  };

  try {
    return await client.queryItems<DirectusDocumentationRecord>(plan.collection, {
      ...baseOptions,
      fields: [...plan.fields],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/(query failed \(400|query failed \(403|field|invalid query|forbidden)/i.test(message)) {
      throw error;
    }

    return client.queryItems<DirectusDocumentationRecord>(plan.collection, {
      ...baseOptions,
      fields: [...BASE_DOCUMENTATION_FIELDS],
    });
  }
}

function mapDirectusDocumentationRecord(record: DirectusDocumentationRecord): DocumentationDetail {
  const section = mapRecordSection(record);
  const slug = deriveDocumentationLeafSlug(record.slug || record.source_path || "");
  const markdownRaw = String(record.markdown_raw || "");
  const description = extractDocumentationDescription(record.description || markdownRaw, record.title);

  return {
    slug,
    title: record.title,
    description,
    excerpt: excerptText(description, 180),
    path: formatDocumentationDetailPath(section.slug, slug, record.category_ref?.route_base || "/docs"),
    sourcePath: record.source_path || null,
    sourceKind: record.source_kind || "repo_sync",
    status: record.status || "published",
    section,
    tags: mapRecordTags(record.tags),
    markdownRaw,
    htmlRendered: record.html_rendered || renderDocumentationHtml(markdownRaw),
    docOrder: toInteger(record.doc_order),
  };
}

function groupDocumentationEntries(entries: DocumentationDetail[]): DocumentationSectionGroup[] {
  const groups = new Map<string, DocumentationSectionGroup>();

  for (const entry of entries) {
    const key = entry.section.slug;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(toNavEntry(entry));
      continue;
    }

    groups.set(key, {
      section: entry.section,
      entries: [toNavEntry(entry)],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      section: group.section,
      entries: [...group.entries].sort(compareNavEntries),
    }))
    .sort((left, right) => {
      if (left.section.order !== right.section.order) {
        return left.section.order - right.section.order;
      }
      return left.section.slug.localeCompare(right.section.slug);
    });
}

function toNavEntry(entry: DocumentationDetail): DocumentationNavEntry {
  const tags = entry.tags.map(cloneDocumentationTag);
  const tagSlugs = tags.map((tag) => tag.slug);
  const tagTitles = tags.map((tag) => tag.title);

  return {
    slug: entry.slug,
    title: entry.title,
    description: entry.description,
    excerpt: entry.excerpt,
    path: entry.path,
    sourcePath: entry.sourcePath,
    section: {
      slug: entry.section.slug,
      title: entry.section.title,
      description: entry.section.description,
      order: entry.section.order,
      path: entry.section.path,
    },
    tags,
    tagSlugs,
    tagTitles,
    searchText: [
      entry.title,
      entry.description,
      entry.excerpt,
      entry.slug,
      entry.path,
      entry.sourcePath || "",
      entry.section.title,
      entry.section.slug,
      ...tagTitles,
      ...tagSlugs,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .join(" "),
    docOrder: entry.docOrder,
  };
}

function collectDocumentationTags(entries: DocumentationDetail[]): DocumentationTag[] {
  const tags = new Map<string, DocumentationTag>();

  for (const entry of entries) {
    for (const tag of entry.tags) {
      if (!tags.has(tag.slug)) {
        tags.set(tag.slug, cloneDocumentationTag(tag));
      }
    }
  }

  return [...tags.values()].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
}

function cloneDocumentationTag(tag: DocumentationTag): DocumentationTag {
  return {
    slug: tag.slug,
    title: tag.title,
    color: tag.color,
    order: tag.order,
  };
}

function compareDocumentationEntries(left: DocumentationDetail, right: DocumentationDetail): number {
  if (left.section.order !== right.section.order) {
    return left.section.order - right.section.order;
  }

  const leftOrder = left.docOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.docOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const titleOrder = left.title.localeCompare(right.title);
  if (titleOrder !== 0) {
    return titleOrder;
  }

  return (left.sourcePath || left.slug).localeCompare(right.sourcePath || right.slug);
}

function compareNavEntries(left: DocumentationNavEntry, right: DocumentationNavEntry): number {
  const leftOrder = left.docOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.docOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.path.localeCompare(right.path);
}

async function readLocalDocsNav(): Promise<{ categories: DocsNavCategoryRecord[] }> {
  return JSON.parse(await readFile(DOCS_NAV_URL, "utf8"));
}

function mapNavCategoryToSection(category: DocsNavCategoryRecord): DocumentationSection {
  const sectionSlug = category.slug || "root";
  return {
    slug: sectionSlug,
    title: sectionSlug === "root" ? "Start Here" : category.title,
    description: category.summary || null,
    order: toInteger(category.order) ?? Number.MAX_SAFE_INTEGER,
    path: formatSectionPath(sectionSlug),
  };
}

function mapRecordSection(record: DirectusDocumentationRecord): DocumentationSection {
  const relation = record.category_ref || record.section || null;
  const sectionSlug = relation?.slug || record.category || deriveSectionSlug(record.source_path || record.slug);
  const sectionTitle = sectionSlug === "root"
    ? "Start Here"
    : relation?.title || record.category_label || humanizeDocumentationSlug(sectionSlug);
  const routeBase = relation?.route_base || "/docs";

  return {
    slug: sectionSlug,
    title: sectionTitle,
    description: relation?.description || null,
    order: toInteger(relation?.order) ?? toInteger(record.category_order) ?? Number.MAX_SAFE_INTEGER,
    path: formatSectionRoute(sectionSlug, routeBase),
  };
}

function mapRecordTags(rawTags: DirectusDocumentationRecord["tags"]): DocumentationTag[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const seen = new Set<string>();

  return rawTags
    .map((entry) => {
      const tag = (entry && typeof entry === "object" && ("tag" in entry || "tags_id" in entry))
        ? (entry.tag || entry.tags_id)
        : entry;
      if (!tag?.slug || !tag?.title) {
        return null;
      }
      const normalizedSlug = String(tag.slug || "").trim();
      if (!normalizedSlug || seen.has(normalizedSlug)) {
        return null;
      }
      seen.add(normalizedSlug);
      return {
        slug: normalizedSlug,
        title: tag.title,
        color: tag.color || null,
        order: toInteger(tag.order),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.slug.localeCompare(right.slug);
    });
}

function mapLocalTags(rawTags: string[]): DocumentationTag[] {
  const seen = new Set<string>();

  return rawTags
    .map((tag) => String(tag || "").trim())
    .filter((tag) => {
      if (!tag || seen.has(tag)) {
        return false;
      }
      seen.add(tag);
      return true;
    })
    .map((tag) => ({
    slug: tag,
    title: humanizeDocumentationSlug(tag),
    color: null,
    order: null,
  }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function normalizeLocalSourcePath(sourcePath: string): string {
  return sourcePath.startsWith("documentation/") ? sourcePath : `documentation/${sourcePath}`;
}

function deriveSectionSlug(slug: string): string {
  const normalized = String(slug || "")
    .replace(/^docs\/documentation\//, "")
    .replace(/\.md$/, "");
  const parts = normalized.split("/").filter(Boolean);

  if (parts[0] === "_legacy") {
    if (parts.length < 3 || parts[1]?.endsWith(".md")) {
      return "legacy";
    }
    return parts[1] || "legacy";
  }

  return parts.length > 1 ? (parts[0] || "root") : "root";
}

function formatSectionPath(sectionSlug: string): string {
  return formatSectionRoute(sectionSlug, "/docs");
}

function formatSectionRoute(sectionSlug: string, routeBase: string): string {
  const base = routeBase || "/docs";
  return sectionSlug === "root" ? base : `${base}/${sectionSlug}`;
}

function toInteger(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}

function normalizeDocumentationLookup(lookupInput: string | DocumentationDetailLookup) {
  if (typeof lookupInput !== "string") {
    return {
      slug: deriveDocumentationLeafSlug(lookupInput.slug),
      sectionSlug: lookupInput.sectionSlug ?? "root",
    };
  }

  const normalized = String(lookupInput || "").replace(/^\/?docs\/?/, "").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return {
      slug: deriveDocumentationLeafSlug(normalized),
      sectionSlug: "root",
    };
  }

  return {
    slug: deriveDocumentationLeafSlug(parts[parts.length - 1] || ""),
    sectionSlug: parts[parts.length - 2] || "root",
  };
}

function matchesDocumentationLookup(entry: DocumentationDetail, lookup: { slug: string; sectionSlug: string }) {
  return entry.slug === lookup.slug && entry.section.slug === lookup.sectionSlug;
}
