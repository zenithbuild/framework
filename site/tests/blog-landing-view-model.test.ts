import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createBlogLandingBrowseModel,
} from "../src/server/blogLandingViewModel";
import { BLOG_ALL_FILTER, describeBlogArchiveFilters, filterBlogArticles } from "../src/components/blog/blogArchiveFilters";
import { loadGitBlogPosts } from "../src/server/gitBlogSource";
import type { BlogPost } from "../src/server/postSource";

function blogPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    slug: "first-post",
    title: "First post",
    excerpt: "A concise entry.",
    description: "A concise entry.",
    publishedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: null,
    displayPublishedAt: "July 1, 2026",
    displayUpdatedAt: null,
    readingTime: "2 min read",
    path: "/blog/first-post",
    tags: ["Compiler"],
    tagMeta: [],
    category: { slug: "framework", title: "Framework", routeBase: "/blog" },
    cover: { eyebrow: "Framework", title: "First post", description: "A concise entry.", tone: "blue", image: null },
    author: { name: "Zenith Team", role: null, href: null },
    summaryPoints: [],
    relatedSlugs: [],
    htmlRendered: "<p>A concise entry.</p>",
    cta: { eyebrow: "Docs", title: "Read docs", description: "", href: "/docs", label: "Open docs" },
    featured: false,
    seoTitle: "First post",
    seoDescription: "A concise entry.",
    canonicalPath: "/blog/first-post",
    headings: [],
    ...overrides,
  };
}

describe("Blog landing browse model", () => {
  test("includes every committed post, including the featured lead, exactly once", async () => {
    const posts = await loadGitBlogPosts();
    const model = createBlogLandingBrowseModel(posts[0], posts.slice(1));

    expect(model.articles.map((post) => post.path)).toEqual(posts.map((post) => post.path));
    expect(model.categories).toEqual(["Framework", "Framework release", "Routing", "Tooling"]);
    expect(model.tags).toEqual(["Compiler", "Design", "Diagnostics", "Routing", "Runtime", "Security", "Server", "Tooling"]);
  });

  test("deduplicates labels and handles optional article presentation data without mutation", () => {
    const featured = blogPost({
      slug: "featured",
      path: "/blog/featured",
      category: { slug: "tooling", title: "Tooling", routeBase: "/blog" },
      tags: ["Compiler", " compiler ", ""],
      readingTime: "",
      author: { name: "", role: null, href: null },
    });
    const duplicate = blogPost({ slug: "featured", path: "/blog/featured", tags: ["Routing"] });
    const followup = blogPost({
      slug: "followup",
      path: "/blog/followup",
      category: { slug: "tooling", title: "tooling", routeBase: "/blog" },
      tags: ["Runtime", "compiler"],
    });
    const model = createBlogLandingBrowseModel(featured, [duplicate, followup]);

    expect(model.articles).toHaveLength(2);
    expect(model.categories).toEqual(["Tooling"]);
    expect(model.tags).toEqual(["Compiler", "Runtime"]);
    expect(featured.tags).toEqual(["Compiler", " compiler ", ""]);
  });

  test("filters categories and tags together without changing source order", () => {
    const first = blogPost({ slug: "first", category: { slug: "framework", title: "Framework", routeBase: "/blog" }, tags: ["Compiler", "Runtime"] });
    const second = blogPost({ slug: "second", category: { slug: "routing", title: "Routing", routeBase: "/blog" }, tags: ["Server", "Security"] });
    const third = blogPost({ slug: "third", category: { slug: "framework", title: "Framework", routeBase: "/blog" }, tags: ["Design"] });
    const articles = [first, second, third];

    expect(filterBlogArticles(articles, BLOG_ALL_FILTER, BLOG_ALL_FILTER)).toEqual(articles);
    expect(filterBlogArticles(articles, "framework", BLOG_ALL_FILTER)).toEqual([first, third]);
    expect(filterBlogArticles(articles, BLOG_ALL_FILTER, "security")).toEqual([second]);
    expect(filterBlogArticles(articles, "Framework", "Runtime")).toEqual([first]);
    expect(filterBlogArticles(articles, "Routing", "Runtime")).toEqual([]);
    expect(articles).toEqual([first, second, third]);
  });

  test("describes default, category, tag, and combined result contexts", () => {
    expect(describeBlogArchiveFilters()).toBe("All articles");
    expect(describeBlogArchiveFilters("Routing", BLOG_ALL_FILTER)).toBe("Routing");
    expect(describeBlogArchiveFilters(BLOG_ALL_FILTER, "Security")).toBe("Tagged “Security”");
    expect(describeBlogArchiveFilters("Routing", "Security")).toBe("Routing · Security");
  });

  test("keeps the landing surface semantic and search explicitly presentation-only", () => {
    const surface = readFileSync(resolve(import.meta.dir, "../src/components/BlogLanding.zen"), "utf8");
    const header = readFileSync(resolve(import.meta.dir, "../src/components/blog/BlogHeader.zen"), "utf8");
    const archive = readFileSync(resolve(import.meta.dir, "../src/components/blog/BlogArchiveBrowser.zen"), "utf8");

    expect((header.match(/<h1[\s>]/g) || [])).toHaveLength(1);
    expect(surface).toContain("posts={browseModel.articles}");
    expect(archive).toContain("blogArchiveRenderRows");
    expect(archive).toContain('data-blog-search="presentation-only"');
    expect(archive).toContain('placeholder="Search articles"');
    expect(archive).toContain("readonly");
    expect(archive).toContain('data-blog-filter-trigger="category"');
    expect(archive).toContain('data-blog-filter-trigger="tag"');
    expect(archive).toContain('state blogArchiveSelectedCategory = "All"');
  });
});
