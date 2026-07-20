import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderDocumentationMarkdown } from "../src/server/documentationMarkdown";
import { loadGitBlogPosts } from "../src/server/gitBlogSource";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dir, `../${path}`), "utf8");
}

describe("shared navigation interaction contract", () => {
  test("uses a click-controlled, focus-safe desktop disclosure", () => {
    const dropdown = source("src/components/ui/NavDropdown.zen");

    expect(dropdown).toContain("state navDropdownOpen");
    expect(dropdown).toContain("ref<HTMLButtonElement>()");
    expect(dropdown).toContain("on:click={navDropdownToggle}");
    expect(dropdown).toContain("on:keydown={navDropdownHandleKeydown}");
    expect(dropdown).toContain('zenOn(doc, "pointerdown"');
    expect(dropdown).toContain("navDropdownTriggerRef.current?.focus()");
    expect(dropdown).toContain('aria-haspopup="menu"');
    expect(dropdown).toContain('role="menu"');
    expect(dropdown).toContain('role="menuitem"');
    expect(dropdown).not.toContain("on:pointerleave");
    expect(dropdown).not.toContain("on:pointerenter");
    expect(dropdown).not.toContain("setTimeout");
    expect(dropdown).not.toContain("querySelector");
    expect(dropdown).not.toContain("addEventListener");
  });

  test("provides an independent tap disclosure for mobile navigation", () => {
    const navigation = source("src/components/ui/Navigation.zen");

    expect(navigation).toContain("state mobileDocsOpen");
    expect(navigation).toContain("on:click={toggleMobileDocs}");
    expect(navigation).toContain('data-mobile-nav-disclosure="docs"');
    expect(navigation).toContain('data-mobile-nav-panel="docs"');
    expect(navigation).toContain("mobileDocsTriggerRef.current?.focus()");
    expect(navigation).not.toContain("on:pointerleave");
  });
});

describe("Blog detail reader contract", () => {
  test("uses one Markdown render result for matching heading IDs and entries", async () => {
    const rendered = renderDocumentationMarkdown([
      "# Example",
      "",
      "## Repeat heading",
      "",
      "### Nested detail",
      "",
      "```md",
      "## Not a section",
      "```",
      "",
      "## Repeat heading",
    ].join("\n"), "Example");

    expect(rendered.headings).toEqual([
      { id: "repeat-heading", text: "Repeat heading", level: 2 },
      { id: "nested-detail", text: "Nested detail", level: 3 },
      { id: "repeat-heading-2", text: "Repeat heading", level: 2 },
    ]);
    for (const heading of rendered.headings) expect(rendered.html).toContain(`id="${heading.id}"`);
    expect(rendered.html).not.toContain('id="not-a-section"');

    const gitSource = source("src/server/gitBlogSource.ts");
    expect(gitSource).toContain("renderDocumentationMarkdown(parsed.content, title)");
    expect(gitSource).toContain("headings: rendered.headings");
    expect(gitSource).not.toContain("extractMarkdownHeadings(parsed.content)");
  });

  test("keeps native hashes, observer cleanup, sticky offset, and optional metadata fallbacks", async () => {
    const article = source("src/components/BlogArticle.zen");
    const toc = source("src/components/reader/ReaderToc.zen");
    const dynamicRoute = source("src/pages/blog/[slug].zen");
    const posts = await loadGitBlogPosts();

    expect((article.match(/<h1\b/g) || []).length).toBe(1);
    expect(article).toContain("<ReaderToc");
    expect(toc).toContain('href="#');
    expect(toc).toContain('aria-current="location"');
    expect(toc).toContain("IntersectionObserver");
    expect(toc).toContain("headingObserver.disconnect()");
    expect(toc).toContain("endObserver.disconnect()");
    expect(toc).toContain('zenOn(win, "hashchange"');
    expect(toc).toContain("getBoundingClientRect().top");
    expect(article).toContain("lg:sticky lg:top-24");
    expect(article).toContain('data-reader-article-end="blog"');
    expect(article).toContain("image ? undefined : \"display: none;\"");
    expect(article).toContain("post.readingTime ? undefined : \"display: none;\"");
    expect(toc).not.toContain("querySelector");
    expect(toc).not.toContain("addEventListener");
    expect(toc).toContain('zenOn(win, "scroll"');
    expect(toc).toContain('{ passive: true }');
    expect(toc).toContain('headingPositions = headingElements.map');
    expect(dynamicRoute).toContain("createContentMetadata");
    expect(dynamicRoute).not.toContain("headingLinksHtml");
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) expect(post.path).toBe(`/blog/${post.slug}`);
  });

  test("limits smooth anchor movement to readers who allow motion", () => {
    const globals = source("src/styles/globals.css");
    const motionBlock = globals.slice(globals.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(motionBlock).toContain('html:has([data-reader-page="true"])');
    expect(motionBlock).toContain("scroll-behavior: smooth");
    expect(motionBlock).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motionBlock).toContain("scroll-behavior: auto !important");
  });
});
