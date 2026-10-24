import type { BlogPost } from "./postSource";
import type { DocumentationDetail } from "./documentationSource";
import { PUBLIC_ROUTE_METADATA } from "../content/site/metadata";
import { stripHtmlTags } from "./postSourceSupport";
import type {
  BlogSearchFilters,
  DocsSearchFilters,
  SearchFilterOption,
  SearchIndexPayload,
  SearchRecord,
} from "./searchTypes";

function stripMarkdownBody(raw: string): string {
  return stripHtmlTags(
    String(raw || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, " ")
      .replace(/^\s*[-*+]\s+/gm, " ")
      .replace(/^\s*\d+\.\s+/gm, " ")
      .replace(/^\s*>\s?/gm, " ")
      .replace(/[*_`~]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 2000);
}

function mapBlogPostToRecord(post: BlogPost): SearchRecord {
  return {
    id: `blog:${post.slug}`,
    scope: "blog",
    title: post.title,
    description: post.excerpt || post.description,
    bodyText: stripMarkdownBody(post.htmlRendered),
    headings: (post.headings || []).map((h) => ({ id: h.id, text: h.text })),
    category: post.category?.title,
    tags: post.tags || [],
    author: post.author?.name,
    publishedAt: post.publishedAt || undefined,
    readingTime: post.readingTime || undefined,
    featured: post.featured || undefined,
    path: post.canonicalPath || post.path,
  };
}

function mapDocToRecord(doc: DocumentationDetail): SearchRecord {
  return {
    id: `docs:${doc.path}`,
    scope: "docs",
    title: doc.title,
    description: doc.description,
    bodyText: stripMarkdownBody(doc.htmlRendered || doc.markdownRaw),
    headings: (doc.headings || []).map((h) => ({ id: h.id, text: h.text })),
    section: doc.section?.title,
    tags: (doc.tags || []).map((t) => t.title),
    path: doc.path,
  };
}

function mapPageRouteRecords(): SearchRecord[] {
  return Object.values(PUBLIC_ROUTE_METADATA)
    .filter((route) => route.path !== "/blog/building-zenith-0-8")
    .map((route) => ({
      id: `page:${route.path}`,
      scope: "page" as const,
      title: route.title,
      description: route.description,
      path: route.path,
    }));
}

export function buildBlogRecords(posts: BlogPost[]): SearchRecord[] {
  return posts.map(mapBlogPostToRecord);
}

export function buildDocsRecords(docs: DocumentationDetail[]): SearchRecord[] {
  return docs.map(mapDocToRecord);
}

export function buildPageRecords(): SearchRecord[] {
  return mapPageRouteRecords();
}

export function buildSearchIndex(
  blogPosts: BlogPost[],
  docs: DocumentationDetail[],
): SearchIndexPayload {
  const records: SearchRecord[] = [
    ...buildPageRecords(),
    ...buildDocsRecords(docs),
    ...buildBlogRecords(blogPosts),
  ];

  return {
    records,
    docsFilters: buildDocsFilters(records),
    blogFilters: buildBlogFilters(records),
  };
}

function buildDocsFilters(records: SearchRecord[]): DocsSearchFilters {
  const docsRecords = records.filter((r) => r.scope === "docs");
  const sectionCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const record of docsRecords) {
    const section = record.section || "Uncategorized";
    sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1);
    for (const tag of record.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const sections: SearchFilterOption[] = [
    { value: "All", label: "All sections", count: docsRecords.length },
    ...[...sectionCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ value: label, label, count })),
  ];

  const tags: SearchFilterOption[] = [
    { value: "All", label: "All tags", count: docsRecords.length },
    ...[...tagCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ value: label, label, count })),
  ];

  return { sections, tags };
}

function buildBlogFilters(records: SearchRecord[]): BlogSearchFilters {
  const blogRecords = records.filter((r) => r.scope === "blog");
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();

  for (const record of blogRecords) {
    const category = record.category || "Uncategorized";
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    for (const tag of record.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    if (record.author) {
      authorCounts.set(record.author, (authorCounts.get(record.author) || 0) + 1);
    }
  }

  const categories: SearchFilterOption[] = [
    { value: "All", label: "All categories", count: blogRecords.length },
    ...[...categoryCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ value: label, label, count })),
  ];

  const tags: SearchFilterOption[] = [
    { value: "All", label: "All tags", count: blogRecords.length },
    ...[...tagCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ value: label, label, count })),
  ];

  const authors: SearchFilterOption[] = [
    { value: "All", label: "All authors", count: blogRecords.length },
    ...[...authorCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ value: label, label, count })),
  ];

  const sortOrders: SearchFilterOption[] = [
    { value: "newest", label: "Newest first", count: blogRecords.length },
    { value: "oldest", label: "Oldest first", count: blogRecords.length },
    { value: "featured", label: "Featured first", count: blogRecords.length },
  ];

  return { categories, tags, authors, sortOrders };
}
