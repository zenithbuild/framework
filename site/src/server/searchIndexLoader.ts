import { loadGitBlogPosts } from "./gitBlogSource";
import { loadDocumentationIndexSource } from "./documentationSource";
import { buildSearchIndex } from "./siteSearchIndex";
import type { SearchIndexPayload } from "./searchTypes";

export async function loadSearchIndex(): Promise<SearchIndexPayload> {
  const [blogPosts, docsSource] = await Promise.all([
    loadGitBlogPosts().catch(() => []),
    loadDocumentationIndexSource().catch(() => ({ sourceMode: "local", sections: [], tags: [] })),
  ]);

  const docs = docsSource.sections.flatMap((group) => group.entries.map((entry) => ({
    slug: entry.slug,
    routeSectionSlug: entry.routeSectionSlug,
    title: entry.title,
    sidebarLabel: entry.sidebarLabel,
    description: entry.description,
    excerpt: entry.excerpt,
    path: entry.path,
    sourcePath: entry.sourcePath,
    sourceKind: "repo_sync",
    status: "published",
    section: entry.section,
    tags: entry.tags,
    markdownRaw: "",
    htmlRendered: null,
    headings: [],
    docOrder: entry.docOrder,
    seoTitle: null,
    seoDescription: null,
  })));

  return buildSearchIndex(blogPosts, docs as any);
}
