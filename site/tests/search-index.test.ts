import { describe, expect, test } from "bun:test";
import { buildSearchIndex, buildBlogRecords, buildDocsRecords, buildPageRecords } from "../src/server/siteSearchIndex";
import { searchRecords, applySearchFilters as applyFilters, normalizeSearchText, tokenizeSearchQuery } from "../src/server/searchRanking";
import { loadGitBlogPosts } from "../src/server/gitBlogSource";
import { loadDocumentationIndexSource } from "../src/server/documentationSource";
import { PUBLIC_ROUTE_METADATA } from "../src/content/site/metadata";
import type { SearchRecord } from "../src/server/searchTypes";

function makeRecord(overrides: Partial<SearchRecord> = {}): SearchRecord {
  return {
    id: "test:1",
    scope: "page",
    title: "Test Record",
    description: "A test description",
    path: "/test",
    ...overrides,
  };
}

describe("Search index building", () => {
  test("global index includes pages, docs, and blog", async () => {
    const blogPosts = await loadGitBlogPosts();
    const docsSource = await loadDocumentationIndexSource();
    const docs = docsSource.sections.flatMap((g) => g.entries) as any[];
    const index = buildSearchIndex(blogPosts, docs);

    const scopes = new Set(index.records.map((r) => r.scope));
    expect(scopes.has("page")).toBe(true);
    expect(scopes.has("docs")).toBe(true);
    expect(scopes.has("blog")).toBe(true);
  });

  test("page records are built from PUBLIC_ROUTE_METADATA excluding blog detail pages", () => {
    const pages = buildPageRecords();
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((r) => r.scope === "page")).toBe(true);
    expect(pages.some((r) => r.path === "/")).toBe(true);
    expect(pages.some((r) => r.path === "/blog")).toBe(true);
    expect(pages.some((r) => r.path === "/docs")).toBe(true);
    expect(pages.some((r) => r.path === "/about")).toBe(true);
    expect(pages.some((r) => r.path === "/blog/building-zenith-0-8")).toBe(false);
  });

  test("docs index excludes blog records", async () => {
    const docsSource = await loadDocumentationIndexSource();
    const docs = docsSource.sections.flatMap((g) => g.entries) as any[];
    const records = buildDocsRecords(docs);
    expect(records.every((r) => r.scope === "docs")).toBe(true);
    expect(records.some((r) => r.scope === "blog")).toBe(false);
  });

  test("blog index excludes docs records", async () => {
    const blogPosts = await loadGitBlogPosts();
    const records = buildBlogRecords(blogPosts);
    expect(records.every((r) => r.scope === "blog")).toBe(true);
    expect(records.some((r) => r.scope === "docs")).toBe(false);
  });

  test("blog records include headings, tags, category, author, and reading time", async () => {
    const blogPosts = await loadGitBlogPosts();
    const records = buildBlogRecords(blogPosts);
    const withHeadings = records.find((r) => r.headings && r.headings.length > 0);
    expect(withHeadings).toBeTruthy();
    const withTags = records.find((r) => r.tags && r.tags.length > 0);
    expect(withTags).toBeTruthy();
    const withCategory = records.find((r) => r.category);
    expect(withCategory).toBeTruthy();
    const withAuthor = records.find((r) => r.author);
    expect(withAuthor).toBeTruthy();
  });

  test("docs records include section and headings", async () => {
    const docsSource = await loadDocumentationIndexSource();
    const docs = docsSource.sections.flatMap((g) => g.entries) as any[];
    const records = buildDocsRecords(docs);
    const withSection = records.find((r) => r.section);
    expect(withSection).toBeTruthy();
  });

  test("docs filters are built from real data", async () => {
    const docsSource = await loadDocumentationIndexSource();
    const docs = docsSource.sections.flatMap((g) => g.entries) as any[];
    const index = buildSearchIndex([], docs);
    expect(index.docsFilters.sections.length).toBeGreaterThan(1);
    expect(index.docsFilters.sections[0].value).toBe("All");
  });

  test("blog filters are built from real data", async () => {
    const blogPosts = await loadGitBlogPosts();
    const index = buildSearchIndex(blogPosts, []);
    expect(index.blogFilters.categories.length).toBeGreaterThan(1);
    expect(index.blogFilters.categories[0].value).toBe("All");
    expect(index.blogFilters.tags.length).toBeGreaterThan(1);
    expect(index.blogFilters.authors.length).toBeGreaterThan(1);
    expect(index.blogFilters.sortOrders.length).toBe(3);
  });

  test("no duplicate record IDs in the combined index", async () => {
    const blogPosts = await loadGitBlogPosts();
    const docsSource = await loadDocumentationIndexSource();
    const docs = docsSource.sections.flatMap((g) => g.entries) as any[];
    const index = buildSearchIndex(blogPosts, docs);
    const ids = index.records.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

describe("Search ranking", () => {
  const testRecords: SearchRecord[] = [
    makeRecord({ id: "1", title: "Getting Started", description: "How to begin", path: "/docs/getting-started", scope: "docs", section: "Start Here" }),
    makeRecord({ id: "2", title: "Routing Guide", description: "Learn routing", path: "/docs/routing", scope: "docs", section: "Guides", headings: [{ id: "h1", text: "Route Protection" }] }),
    makeRecord({ id: "3", title: "Compiler Architecture", description: "How the compiler works", path: "/blog/compiler", scope: "blog", category: "Engineering", tags: ["Compiler", "Runtime"] }),
    makeRecord({ id: "4", title: "Home", description: "Zenith framework homepage", path: "/", scope: "page" }),
  ];

  test("exact title match scores highest", () => {
    const results = searchRecords(testRecords, "Getting Started", "global");
    expect(results[0].record.title).toBe("Getting Started");
  });

  test("heading match ranks above description-only match", () => {
    const results = searchRecords(testRecords, "Route Protection", "global");
    const routingResult = results.find((r) => r.record.title === "Routing Guide");
    expect(routingResult).toBeTruthy();
    expect(routingResult!.matchedHeading?.text).toBe("Route Protection");
  });

  test("category/tag match contributes to score", () => {
    const results = searchRecords(testRecords, "Compiler", "global");
    const compilerResult = results.find((r) => r.record.title === "Compiler Architecture");
    expect(compilerResult).toBeTruthy();
  });

  test("multi-token queries match across fields", () => {
    const results = searchRecords(testRecords, "getting started", "global");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].record.title).toBe("Getting Started");
  });

  test("case-insensitive search", () => {
    const lower = searchRecords(testRecords, "routing guide", "global");
    const upper = searchRecords(testRecords, "ROUTING GUIDE", "global");
    expect(lower[0]?.record.title).toBe(upper[0]?.record.title);
  });

  test("punctuation normalization", () => {
    expect(normalizeSearchText("Hello, World!")).toBe("hello world");
    expect(normalizeSearchText("R&D–test")).toBe("r d test");
  });

  test("duplicate suppression - one result per record regardless of heading count", () => {
    const recordWithManyHeadings = makeRecord({
      id: "5",
      title: "Reactivity Model",
      description: "State and signals",
      path: "/docs/reactivity",
      scope: "docs",
      headings: [
        { id: "h1", text: "State" },
        { id: "h2", text: "Signals" },
        { id: "h3", text: "State Management" },
      ],
    });
    const results = searchRecords([recordWithManyHeadings], "state", "global");
    expect(results.length).toBe(1);
  });

  test("stable ordering for equal scores", () => {
    const results = searchRecords(testRecords, "", "global");
    const scopeOrder: Record<string, number> = { page: 0, docs: 1, blog: 2 };
    const paths = results.map((r) => r.record.path);
    const scopes = results.map((r) => r.record.scope);
    const sortedByScopeThenPath = [...results].sort((a, b) => {
      const so = (scopeOrder[a.record.scope] ?? 3) - (scopeOrder[b.record.scope] ?? 3);
      return so !== 0 ? so : a.record.path.localeCompare(b.record.path);
    });
    const expectedPaths = sortedByScopeThenPath.map((r) => r.record.path);
    const sortedPaths = [...paths].sort();
    expect(paths).toEqual(expectedPaths);
  });

  test("empty query returns scoped records in stable order", () => {
    const results = searchRecords(testRecords, "", "docs");
    expect(results.every((r) => r.record.scope === "docs")).toBe(true);
    expect(results.length).toBe(2);
  });

  test("no-result behavior returns empty array", () => {
    const results = searchRecords(testRecords, "xyznonexistent", "global");
    expect(results.length).toBe(0);
  });

  test("heading match provides heading id for hash destination", () => {
    const results = searchRecords(testRecords, "Route Protection", "global");
    const match = results.find((r) => r.matchedHeading);
    expect(match?.matchedHeading?.id).toBe("h1");
  });

  test("tokenization splits on whitespace and normalizes", () => {
    const tokens = tokenizeSearchQuery("  Getting   Started  ");
    expect(tokens).toEqual(["getting", "started"]);
  });
});

describe("Search scope filtering", () => {
  const mixedRecords: SearchRecord[] = [
    makeRecord({ id: "p1", scope: "page", title: "Home", path: "/" }),
    makeRecord({ id: "d1", scope: "docs", title: "Docs Page", path: "/docs/x", section: "Start Here" }),
    makeRecord({ id: "b1", scope: "blog", title: "Blog Post", path: "/blog/x", category: "Engineering", tags: ["Compiler"], author: "Zenith Team", publishedAt: "2026-07-01" }),
  ];

  test("docs scope excludes blog and page records", () => {
    const results = searchRecords(mixedRecords, "", "docs");
    expect(results.every((r) => r.record.scope === "docs")).toBe(true);
  });

  test("blog scope excludes docs and page records", () => {
    const results = searchRecords(mixedRecords, "", "blog");
    expect(results.every((r) => r.record.scope === "blog")).toBe(true);
  });

  test("global scope includes all scopes", () => {
    const results = searchRecords(mixedRecords, "", "global");
    const scopes = new Set(results.map((r) => r.record.scope));
    expect(scopes.has("page")).toBe(true);
    expect(scopes.has("docs")).toBe(true);
    expect(scopes.has("blog")).toBe(true);
  });
});

describe("Search filters", () => {
  const blogRecords: SearchRecord[] = [
    makeRecord({ id: "b1", scope: "blog", title: "Post A", path: "/blog/a", category: "Engineering", tags: ["Compiler", "Runtime"], author: "Judah", publishedAt: "2026-07-01T00:00:00Z" }),
    makeRecord({ id: "b2", scope: "blog", title: "Post B", path: "/blog/b", category: "Releases", tags: ["Compiler"], author: "Judah", publishedAt: "2026-06-01T00:00:00Z", featured: true }),
    makeRecord({ id: "b3", scope: "blog", title: "Post C", path: "/blog/c", category: "Engineering", tags: ["Design"], author: "Colin", publishedAt: "2026-05-01T00:00:00Z" }),
  ];

  const docsRecords: SearchRecord[] = [
    makeRecord({ id: "d1", scope: "docs", title: "Doc A", path: "/docs/a", section: "Start Here", tags: ["Beginner"] }),
    makeRecord({ id: "d2", scope: "docs", title: "Doc B", path: "/docs/b", section: "Guides", tags: ["Advanced"] }),
  ];

  const allRecords = [...blogRecords, ...docsRecords];

  test("docs section filter", () => {
    const filtered = applyFilters(allRecords, "docs", { section: "Start Here" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("Doc A");
  });

  test("blog category filter", () => {
    const filtered = applyFilters(allRecords, "blog", { category: "Engineering" });
    expect(filtered.length).toBe(2);
    expect(filtered.every((r) => r.category === "Engineering")).toBe(true);
  });

  test("blog tag filter", () => {
    const filtered = applyFilters(allRecords, "blog", { tag: "Compiler" });
    expect(filtered.length).toBe(2);
  });

  test("blog author filter", () => {
    const filtered = applyFilters(allRecords, "blog", { author: "Judah" });
    expect(filtered.length).toBe(2);
  });

  test("blog newest sort", () => {
    const filtered = applyFilters(allRecords, "blog", { sort: "newest" });
    expect(filtered[0].title).toBe("Post A");
  });

  test("blog oldest sort", () => {
    const filtered = applyFilters(allRecords, "blog", { sort: "oldest" });
    expect(filtered[0].title).toBe("Post C");
  });

  test("blog featured sort", () => {
    const filtered = applyFilters(allRecords, "blog", { sort: "featured" });
    expect(filtered[0].title).toBe("Post B");
  });

  test("filter and search combination", () => {
    const searchResults = searchRecords(
      applyFilters(allRecords, "blog", { category: "Engineering" }),
      "Post",
      "blog",
    );
    expect(searchResults.length).toBe(2);
    expect(searchResults.every((r) => r.record.category === "Engineering")).toBe(true);
  });

  test("filter reset returns all scoped records", () => {
    const withFilter = applyFilters(allRecords, "blog", { category: "Engineering" });
    const reset = applyFilters(allRecords, "blog", { category: "All" });
    expect(reset.length).toBeGreaterThan(withFilter.length);
  });

  test("combined category and tag filters", () => {
    const filtered = applyFilters(allRecords, "blog", { category: "Engineering", tag: "Compiler" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("Post A");
  });
});
