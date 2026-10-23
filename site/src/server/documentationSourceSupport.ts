import { readFile } from "node:fs/promises";
import type {
  DocumentationDetail,
  DocumentationDetailLookup,
  DocumentationNavEntry,
  DocumentationSectionGroup,
  DocumentationTag,
} from "./documentationSource";

interface LocalDocsIndexRecord {
  doc?: string;
  tags?: string[];
}

const DOCS_INDEX_URL = new URL("../../../docs/public/ai/docs.index.jsonl", import.meta.url);

export async function readLocalDocumentationTagsMap(): Promise<Map<string, string[]>> {
  const raw = await readFile(DOCS_INDEX_URL, "utf8");
  const tagsByDoc = new Map<string, Set<string>>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = JSON.parse(trimmed) as LocalDocsIndexRecord;
    if (!record.doc) continue;
    const next = tagsByDoc.get(record.doc) || new Set<string>();
    for (const tag of record.tags || []) {
      const normalized = String(tag || "").trim();
      if (normalized) next.add(normalized);
    }
    tagsByDoc.set(record.doc, next);
  }

  return new Map([...tagsByDoc.entries()].map(([doc, tags]) => [doc, [...tags].sort((a, b) => a.localeCompare(b))]));
}

export function deriveDocumentationLeafSlug(value: string): string {
  const normalized = String(value || "")
    .replace(/^docs\/documentation\//, "")
    .replace(/^documentation\//, "")
    .replace(/\.md$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function stripDocumentationFrontmatter(raw: string): string {
  const source = String(raw || "");
  if (!source.startsWith("---")) {
    return source;
  }

  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? source.slice(match[0].length) : source;
}

export function extractDocumentationDescription(source: string, fallback: string): string {
  const cleaned = String(source || "")
    .replace(/^# .*\n+/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[<`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

export function excerptText(source: string, maxLength: number): string {
  const text = String(source || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function humanizeDocumentationSlug(slug: string): string {
  return String(slug || "")
    .split(/[-/]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDocumentationDetailPath(sectionSlug: string, slug: string, routeBase = "/docs"): string {
  const base = String(routeBase || "/docs").replace(/\/$/, "") || "/docs";
  return sectionSlug === "root" ? `${base}/${slug}` : `${base}/${sectionSlug}/${slug}`;
}

export function renderDocumentationHtml(markdownRaw: string): string {
  const lines = String(markdownRaw || "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  const headingCounts = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("```")) {
      const language = escapeHtml(trimmed.slice(3).trim());
      const codeLines: string[] = [];
      while (index + 1 < lines.length && !String(lines[index + 1] || "").trim().startsWith("```")) {
        index += 1;
        codeLines.push(lines[index] || "");
      }
      if (index + 1 < lines.length && String(lines[index + 1] || "").trim().startsWith("```")) index += 1;
      html.push(`<pre><code class="language-${language || "plain"}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const baseId = stableHeadingId(heading[2] || "section");
      const count = headingCounts.get(baseId) || 0;
      headingCounts.set(baseId, count + 1);
      const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
      html.push(`<h${level} id="${id}" class="scroll-mt-28">${renderInlineMarkdown(heading[2] || "")}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push("<hr />");
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines = [trimmed.replace(/^>\s?/, "")];
      while (index + 1 < lines.length && String(lines[index + 1] || "").trim().startsWith(">")) {
        index += 1;
        quoteLines.push(String(lines[index] || "").trim().replace(/^>\s?/, ""));
      }
      html.push(`<blockquote><p>${renderInlineMarkdown(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    const bullet = trimmed.match(/^([-*])\s+(.*)$/);
    if (bullet) {
      const items = [bullet[2] || ""];
      while (index + 1 < lines.length) {
        const next = String(lines[index + 1] || "").trim();
        const nextBullet = next.match(/^([-*])\s+(.*)$/);
        if (!nextBullet) break;
        index += 1;
        items.push(nextBullet[2] || "");
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      const items = [ordered[1] || ""];
      while (index + 1 < lines.length) {
        const next = String(lines[index + 1] || "").trim();
        const nextOrdered = next.match(/^\d+\.\s+(.*)$/);
        if (!nextOrdered) break;
        index += 1;
        items.push(nextOrdered[1] || "");
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines = [trimmed];
    while (index + 1 < lines.length) {
      const next = String(lines[index + 1] || "").trim();
      if (!next || /^(#{1,6})\s+/.test(next) || next.startsWith(">") || next.startsWith("```") || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || /^(-{3,}|\*{3,})$/.test(next)) {
        break;
      }
      index += 1;
      paragraphLines.push(next);
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(String(value || ""))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) =>
      safeMarkdownUrl(href) ? `<a href="${href}">${label}</a>` : label,
    );
}

export interface MarkdownHeading {
  id: string;
  text: string;
  level: number;
}

export function extractMarkdownHeadings(markdownRaw: string): MarkdownHeading[] {
  const counts = new Map<string, number>();
  return String(markdownRaw || "").split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(#{2,3})\s+(.*)$/);
    if (!match) return [];
    const text = String(match[2] || "").replace(/[`*_]/g, "").trim();
    const baseId = stableHeadingId(text || "section");
    const count = counts.get(baseId) || 0;
    counts.set(baseId, count + 1);
    return [{ id: count === 0 ? baseId : `${baseId}-${count + 1}`, text, level: match[1].length }];
  });
}

function stableHeadingId(value: string): string {
  return String(value || "section")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function safeMarkdownUrl(value: string): boolean {
  const url = String(value || "").trim();
  return /^#[-a-z0-9_:.]+$/i.test(url)
    || (/^\/(?!\/)/.test(url) && !/["'<>]/.test(url))
    || /^https?:\/\/[^\s"'<>]+$/i.test(url)
    || /^mailto:[^\s"'<>]+$/i.test(url);
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function groupDocumentationEntries(entries: DocumentationDetail[]): DocumentationSectionGroup[] {
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
      const titleOrder = left.section.title.localeCompare(right.section.title);
      if (titleOrder !== 0) return titleOrder;
      return left.section.slug.localeCompare(right.section.slug);
    });
}

function toNavEntry(entry: DocumentationDetail): DocumentationNavEntry {
  const tags = entry.tags.map(cloneDocumentationTag);
  const tagSlugs = tags.map((tag) => tag.slug);
  const tagTitles = tags.map((tag) => tag.title);

  return {
    slug: entry.slug,
    routeSectionSlug: entry.routeSectionSlug,
    title: entry.title,
    sidebarLabel: entry.sidebarLabel,
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

export function collectDocumentationTags(entries: DocumentationDetail[]): DocumentationTag[] {
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

export function compareDocumentationEntries(left: DocumentationDetail, right: DocumentationDetail): number {
  if (left.section.order !== right.section.order) {
    return left.section.order - right.section.order;
  }

  const sectionTitleOrder = left.section.title.localeCompare(right.section.title);
  if (sectionTitleOrder !== 0) {
    return sectionTitleOrder;
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

  const slugOrder = left.slug.localeCompare(right.slug);
  if (slugOrder !== 0) return slugOrder;
  return (left.sourcePath || left.slug).localeCompare(right.sourcePath || right.slug);
}

function compareNavEntries(left: DocumentationNavEntry, right: DocumentationNavEntry): number {
  const leftOrder = left.docOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.docOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  const titleOrder = left.title.localeCompare(right.title);
  if (titleOrder !== 0) return titleOrder;
  return left.slug.localeCompare(right.slug) || left.path.localeCompare(right.path);
}
export function formatSectionPath(sectionSlug: string): string {
  return formatSectionRoute(sectionSlug, "/docs");
}

export function formatSectionRoute(sectionSlug: string, routeBase: string): string {
  const base = routeBase || "/docs";
  return sectionSlug === "root" ? base : `${base}/${sectionSlug}`;
}

export function toInteger(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}

export function normalizeDocumentationLookup(lookupInput: string | DocumentationDetailLookup) {
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

export function matchesDocumentationLookup(entry: DocumentationDetail, lookup: { slug: string; sectionSlug: string }) {
  return entry.slug === lookup.slug && entry.routeSectionSlug === lookup.sectionSlug;
}
