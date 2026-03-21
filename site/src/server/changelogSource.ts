import { blogPostContent } from "../content/index";
import { createDirectusServerClient, type DirectusServerClient } from "./directusClient";

type SourceMode = "local" | "directus";
type AccentTone = "red" | "blue" | "gold" | "magenta";

interface DirectusChangelogRecord {
  slug: string;
  title: string;
  version: string;
  description: string | null;
  markdown_raw: string;
  html_rendered: string | null;
  published_at: string | null;
  sort: number | null;
  status: string;
  source_kind: string;
  source_path: string | null;
  category_ref?: {
    slug?: string | null;
    title?: string | null;
    route_base?: string | null;
  } | null;
}

interface LocalBlogRecord {
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  readingTime?: string;
  sections?: Array<Record<string, any>>;
}

export interface ChangelogEntry {
  slug: string;
  title: string;
  version: string;
  description: string;
  publishedAt: string | null;
  displayPublishedAt: string | null;
  readingTime: string;
  path: string;
  htmlRendered: string;
  sourceLabel: string;
  sourcePath: string | null;
  accentTone: AccentTone;
  category: {
    slug: string;
    title: string;
    routeBase: string;
  };
}

interface AdjacentChangelogEntry extends ChangelogEntry {
  relation: "newer" | "older";
}

interface ChangelogSourceResult {
  entries: ChangelogEntry[];
  sourceMode: SourceMode;
}

const editorialDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const accentTones: AccentTone[] = ["gold", "red", "blue", "magenta"];

export async function loadChangelogIndexSource(): Promise<{
  latestEntry: ChangelogEntry | null;
  archiveEntries: ChangelogEntry[];
  sourceMode: SourceMode;
}> {
  const { entries, sourceMode } = await loadChangelogEntries();
  return {
    latestEntry: entries[0] || null,
    archiveEntries: entries.slice(1),
    sourceMode,
  };
}

export async function loadChangelogDetailSource(slug: string): Promise<{
  changelogEntry: ChangelogEntry | null;
  relatedEntries: AdjacentChangelogEntry[];
  sourceMode: SourceMode;
}> {
  const sourceMode = resolveSourceMode();

  if (sourceMode === "directus") {
    return loadDirectusChangelogDetailSource(slug);
  }

  const entries = loadLocalChangelogEntries();
  const changelogEntry = findLocalChangelogEntry(entries, slug);

  if (!changelogEntry) {
    return {
      changelogEntry: null,
      relatedEntries: [],
      sourceMode,
    };
  }

  return {
    changelogEntry,
    relatedEntries: resolveAdjacentChangelogEntries(entries, changelogEntry.slug),
    sourceMode,
  };
}

async function loadChangelogEntries(): Promise<ChangelogSourceResult> {
  const sourceMode = resolveSourceMode();

  if (sourceMode === "directus") {
    return {
      entries: await loadDirectusChangelogEntries(),
      sourceMode,
    };
  }

  return {
    entries: loadLocalChangelogEntries(),
    sourceMode,
  };
}

function resolveSourceMode(): SourceMode {
  const mode = (process.env.ZENITH_CHANGELOG_SOURCE || "directus").trim().toLowerCase();

  if (mode === "local" || mode === "directus") {
    return mode;
  }

  throw new Error(
    `Unsupported ZENITH_CHANGELOG_SOURCE "${mode}". Use "local" or "directus".`,
  );
}

async function loadDirectusChangelogEntries(): Promise<ChangelogEntry[]> {
  const client = await createDirectusServerClient();
  const records = await queryDirectusChangelogRecords(client);
  return records.map((record, index) => mapDirectusChangelogRecord(record, index));
}

async function loadDirectusChangelogDetailSource(slugOrVersion: string): Promise<{
  changelogEntry: ChangelogEntry | null;
  relatedEntries: AdjacentChangelogEntry[];
  sourceMode: SourceMode;
}> {
  const sourceMode: SourceMode = "directus";
  const client = await createDirectusServerClient();
  const matchedRecords = await queryDirectusChangelogRecords(client, {
    slugOrVersion,
    limit: 1,
  });

  if (matchedRecords.length === 0) {
    return {
      changelogEntry: null,
      relatedEntries: [],
      sourceMode,
    };
  }

  const changelogEntry = mapDirectusChangelogRecord(matchedRecords[0]!, 0);
  const records = await queryDirectusChangelogRecords(client);
  const orderedEntries = records.map((record, index) => mapDirectusChangelogRecord(record, index));

  return {
    changelogEntry,
    relatedEntries: resolveAdjacentChangelogEntries(orderedEntries, changelogEntry.slug),
    sourceMode,
  };
}

async function queryDirectusChangelogRecords(
  client: DirectusServerClient,
  options?: {
    slugOrVersion?: string;
    limit?: number;
  },
): Promise<DirectusChangelogRecord[]> {
  const normalizedVersion = normalizeVersionLookup(options?.slugOrVersion);
  return client.queryItems<DirectusChangelogRecord>("changelogs", {
    limit: options?.limit ?? -1,
    fields: [
      "slug",
      "title",
      "version",
      "description",
      "markdown_raw",
      "html_rendered",
      "published_at",
      "sort",
      "status",
      "source_kind",
      "source_path",
      "category_ref.slug",
      "category_ref.title",
      "category_ref.route_base",
    ],
    sort: ["sort"],
    query: {
      "filter[status][_eq]": "published",
      "filter[source_kind][_eq]": "repo_sync",
      "filter[_or][0][slug][_eq]": options?.slugOrVersion,
      "filter[_or][1][version][_eq]": normalizedVersion,
    },
  });
}

function loadLocalChangelogEntries(): ChangelogEntry[] {
  const localPosts = ((blogPostContent.posts || []) as LocalBlogRecord[]).filter((record) =>
    isLocalChangelogRecord(record),
  );
  return [...localPosts]
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt);
      const rightTime = Date.parse(right.publishedAt);

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.slug.localeCompare(right.slug);
    })
    .map((record, index) => mapLocalBlogRecord(record, index));
}

function findLocalChangelogEntry(entries: ChangelogEntry[], slugOrVersion: string) {
  const normalizedVersion = normalizeVersionLookup(slugOrVersion);
  return (
    entries.find((entry) => entry.slug === slugOrVersion) ||
    entries.find((entry) => normalizedVersion && entry.version === normalizedVersion) ||
    null
  );
}

function resolveAdjacentChangelogEntries(entries: ChangelogEntry[], slug: string): AdjacentChangelogEntry[] {
  const currentIndex = entries.findIndex((entry) => entry.slug === slug);
  if (currentIndex === -1) {
    return [];
  }

  const adjacent: AdjacentChangelogEntry[] = [];
  const newerEntry = entries[currentIndex - 1];
  const olderEntry = entries[currentIndex + 1];

  if (newerEntry) {
    adjacent.push({ ...newerEntry, relation: "newer" });
  }
  if (olderEntry) {
    adjacent.push({ ...olderEntry, relation: "older" });
  }

  return adjacent;
}

function mapDirectusChangelogRecord(
  record: DirectusChangelogRecord,
  index: number,
): ChangelogEntry {
  const description = cleanDescription(record.description || record.title);
  const category = normalizeChangelogCategory(record.category_ref);
  return {
    slug: record.slug,
    title: record.title,
    version: record.version,
    description,
    publishedAt: record.published_at,
    displayPublishedAt: formatEditorialDate(record.published_at),
    readingTime: formatReadingTime(record.markdown_raw),
    path: `/changelog/${record.slug}`,
    htmlRendered: decorateChangelogHtml(record.html_rendered || `<p>${escapeHtml(description)}</p>`),
    sourceLabel: record.source_kind === "repo_sync" ? "Repo sync" : "CMS",
    sourcePath: record.source_path,
    accentTone: accentToneForIndex(index),
    category,
  };
}

function mapLocalBlogRecord(record: LocalBlogRecord, index: number): ChangelogEntry {
  const version = deriveLocalVersion(record);
  const slug = normalizeLocalSlug(record, version);
  const description = cleanDescription(record.description || record.excerpt || record.title);
  const htmlRendered = decorateChangelogHtml(renderLocalSections(record));

  return {
    slug,
    title: record.title,
    version,
    description,
    publishedAt: record.publishedAt || null,
    displayPublishedAt: formatEditorialDate(record.publishedAt),
    readingTime: record.readingTime || formatReadingTime(stripHtmlTags(htmlRendered)),
    path: `/changelog/${slug}`,
    htmlRendered,
    sourceLabel: "Local fallback",
    sourcePath: null,
    accentTone: accentToneForIndex(index),
    category: {
      slug: "release-notes",
      title: "Release Notes",
      routeBase: "/changelog",
    },
  };
}

function normalizeChangelogCategory(category: DirectusChangelogRecord["category_ref"]) {
  return {
    slug: category?.slug || "release-notes",
    title: category?.title || "Release Notes",
    routeBase: category?.route_base || "/changelog",
  };
}

function deriveLocalVersion(record: LocalBlogRecord) {
  const slugMatch = record.slug.match(/(\d+)-(\d+)-(\d+)/);
  if (slugMatch) {
    return `${slugMatch[1]}.${slugMatch[2]}.${slugMatch[3]}`;
  }

  const titleMatch = record.title.match(/(\d+\.\d+\.\d+)/);
  return titleMatch?.[1] || "local";
}

function isLocalChangelogRecord(record: LocalBlogRecord) {
  return deriveLocalVersion(record) !== "local";
}

function normalizeLocalSlug(record: LocalBlogRecord, version: string) {
  if (version !== "local") {
    return `v${version.replace(/\./g, "-")}`;
  }

  return record.slug;
}

function normalizeVersionLookup(slugOrVersion: string | null | undefined) {
  const value = (slugOrVersion || "").trim();
  if (!value) {
    return null;
  }

  if (/^\d+\.\d+\.\d+$/.test(value)) {
    return value;
  }

  const slugMatch = value.match(/^v?(\d+)-(\d+)-(\d+)$/);
  if (slugMatch) {
    return `${slugMatch[1]}.${slugMatch[2]}.${slugMatch[3]}`;
  }

  return null;
}

function renderLocalSections(record: LocalBlogRecord) {
  const sections = record.sections || [];
  if (sections.length === 0) {
    return `<p>${escapeHtml(cleanDescription(record.description || record.excerpt || record.title))}</p>`;
  }

  return sections
    .map((section) => {
      if (section.type === "quote") {
        return [
          `<section>`,
          `<blockquote><p>${escapeHtml(section.quote || "")}</p>`,
          section.attribution ? `<footer>${escapeHtml(section.attribution)}</footer>` : "",
          `</blockquote>`,
          `</section>`,
        ].join("");
      }

      if (section.type === "points") {
        const items = (section.items || [])
          .map(
            (item: Record<string, any>) =>
              `<li><strong>${escapeHtml(item.title || "")}</strong> ${escapeHtml(item.description || "")}</li>`,
          )
          .join("");

        return [
          `<section>`,
          section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : "",
          section.title ? `<h2>${escapeHtml(section.title)}</h2>` : "",
          section.intro ? `<p>${escapeHtml(section.intro)}</p>` : "",
          `<ul>${items}</ul>`,
          `</section>`,
        ].join("");
      }

      const paragraphs = (section.paragraphs || [])
        .map((paragraph: string) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");

      return [
        `<section>`,
        section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : "",
        section.title ? `<h2>${escapeHtml(section.title)}</h2>` : "",
        paragraphs,
        `</section>`,
      ].join("");
    })
    .join("");
}

function decorateChangelogHtml(html: string) {
  return html
    .replace(/<h1>/g, '<h1 class="font-display text-[clamp(2.4rem,4vw,4rem)] leading-[0.94] tracking-tight text-foreground">')
    .replace(/<h2>/g, '<h2 class="mt-12 font-display text-[clamp(1.8rem,3vw,3rem)] leading-[0.96] tracking-tight text-foreground first:mt-0">')
    .replace(/<h3>/g, '<h3 class="mt-8 font-display text-[clamp(1.25rem,2.2vw,1.8rem)] leading-tight text-foreground">')
    .replace(/<p>/g, '<p class="mt-5 text-base leading-8 text-muted-foreground first:mt-0">')
    .replace(/<ul>/g, '<ul class="mt-5 list-disc space-y-3 pl-6 text-base leading-8 text-muted-foreground">')
    .replace(/<ol>/g, '<ol class="mt-5 list-decimal space-y-3 pl-6 text-base leading-8 text-muted-foreground">')
    .replace(/<li>/g, '<li class="pl-1">')
    .replace(/<pre>/g, '<pre class="mt-6 overflow-x-auto rounded-[1.5rem] border border-border/70 bg-card/80 p-5 text-sm leading-7 text-foreground">')
    .replace(/<code>/g, '<code class="font-mono text-[0.92em]">')
    .replace(/<blockquote>/g, '<blockquote class="mt-8 rounded-[1.75rem] border-l-4 border-surface-border-blue bg-surface-blue/40 px-6 py-5">')
    .replace(/<a /g, '<a class="font-medium text-foreground underline decoration-border underline-offset-4" ');
}

function formatEditorialDate(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  return editorialDateFormatter.format(new Date(dateValue));
}

function formatReadingTime(markdown: string) {
  const wordCount = markdown.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(wordCount / 220));
  return `${minutes} min read`;
}

function accentToneForIndex(index: number): AccentTone {
  return accentTones[index % accentTones.length] || "gold";
}

function cleanDescription(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}
