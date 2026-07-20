import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dir, `../${path}`), "utf8");
}

describe("Blog landing visual contract", () => {
  test("uses the active site shell, spacing, surface, and focus vocabulary", () => {
    const header = source("src/components/blog/BlogHeader.zen");
    const archive = source("src/components/blog/BlogArchiveBrowser.zen");
    const featured = source("src/components/blog/BlogFeaturedArticle.zen");

    expect(header).toContain("mx-auto grid w-full max-w-7xl");
    expect(header).toContain("px-4 pb-12 pt-32");
    expect(archive).toContain("border-b border-border bg-background");
    expect(featured).toContain("rounded-lg border border-border bg-card");
    expect(archive).toContain("border-t border-border");
    expect(`${header}${featured}${archive}`).toContain("focus-visible:outline-ring");
    expect(`${header}${featured}${archive}`).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(`${header}${featured}${archive}`).not.toContain("gradient");
  });

  test("removes the legacy journal composition without changing the browse model", () => {
    const surface = source("src/components/BlogLanding.zen");
    const route = source("src/pages/blog/index.zen");
    const content = source("src/content/pages/blog.json");

    expect(surface).toContain("BlogHeader");
    expect(surface).toContain("BlogArchiveBrowser");
    expect(surface).toContain("BlogFeaturedArticle");
    expect(surface.indexOf("<BlogArchiveBrowser")).toBeLessThan(surface.indexOf("<BlogFeaturedArticle"));
    expect(surface).not.toContain("BlogDiscoveryBar");
    expect(surface).not.toContain("BlogArticleList");
    expect(surface).not.toContain("BlogBrowseRail");
    expect(surface).not.toContain("state viewMode");
    expect(surface).not.toContain("min-h-[100svh]");
    expect(surface).not.toContain("Publication Masthead");
    expect(surface).not.toContain("Cover Story");
    expect(surface).not.toContain("Source truth");
    expect(surface).not.toContain("Editorial boundary");
    expect(route).toContain("createBlogLandingBrowseModel");
    expect(route).toContain("browseModel={data.blogBrowse}");
    expect(route).not.toContain("components/surfaces");
    expect(content).toContain('"eyebrow": "Zenith Blog"');
  });

  test("keeps search honest while category and tag controls are fully interactive", () => {
    const featured = source("src/components/blog/BlogFeaturedArticle.zen");
    const archive = source("src/components/blog/BlogArchiveBrowser.zen");

    expect(archive).toContain('data-blog-search="presentation-only"');
    expect(archive).toContain("readonly");
    expect(archive).toContain("state blogArchiveOpenMenu");
    expect(archive).toContain("state blogArchiveSelectedCategory");
    expect(archive).toContain("state blogArchiveSelectedTag");
    expect(archive).toContain('zenOn(doc, "pointerdown"');
    expect(archive).toContain("on:click={blogArchiveToggleCategory}");
    expect(archive).toContain("on:keydown={blogArchiveHandleCategoryKeydown}");
    expect(archive).toContain('role=\"menuitemradio\"');
    expect(archive).not.toContain("on:pointerleave");
    expect(archive).not.toContain("setTimeout");
    expect(archive).not.toContain("querySelector");
    expect(archive).not.toContain("addEventListener");
    expect(featured).toContain("<article");
    expect(featured).toContain("href={postPath}");
    expect(archive).toContain("<article");
    expect(archive).toContain("blogArchiveEscapeHtml(post.path)");
  });
});
