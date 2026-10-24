import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ReadableSlugError,
  assertUniqueReadablePaths,
  normalizeReadablePath,
  normalizeReadableSlug,
  requireReadableSlug,
} from "../src/content/slugContract";
import { renderDocumentationMarkdown } from "../src/server/documentationMarkdown";
import { discoverLocalDocumentationEntries } from "../src/server/localDocumentationSource";
import { loadBlogDetailSource } from "../src/server/postSource";

const readSource = (path: string) => readFileSync(resolve(import.meta.dir, "..", path), "utf8");

describe("canonical readable slug contract", () => {
  test("normalizes punctuation, Unicode, versions, and repeated separators", () => {
    expect(normalizeReadableSlug(" Getting Started ")).toBe("getting-started");
    expect(normalizeReadableSlug("Zenith 0.8.0 Release")).toBe("zenith-0-8-0-release");
    expect(normalizeReadableSlug("Server: Request APIs")).toBe("server-request-apis");
    expect(normalizeReadableSlug("What's New?")).toBe("whats-new");
    expect(normalizeReadableSlug("Déjà---vu")).toBe("deja-vu");
    expect(normalizeReadablePath("Server / Request APIs")).toBe("server/request-apis");
  });

  test("rejects empty results and duplicate canonical paths", () => {
    expect(() => requireReadableSlug("???", "title")).toThrow(ReadableSlugError);
    expect(() => assertUniqueReadablePaths(
      [{ path: "/blog/release" }, { path: "/blog/release" }],
      (record) => record.path,
      "Blog",
    )).toThrow("Duplicate Blog path '/blog/release'");
  });

  test("keeps stored Blog filenames stable when titles change", async () => {
    const loader = readSource("src/server/gitBlogSource.ts");
    expect(loader).toContain('const slug = filename.replace(/\\.md$/, "")');
    expect(loader).not.toContain("normalizeReadableSlug(title)");
    const detail = await loadBlogDetailSource("building-zenith-0-8");
    expect(detail.blogPost?.path).toBe("/blog/building-zenith-0-8");
    expect(detail.blogPost?.canonicalPath).toBe(detail.blogPost?.path);
  });

  test("keeps repository-relative Docs hierarchy readable and collision free", async () => {
    const entries = await discoverLocalDocumentationEntries();
    const paths = entries.map((entry) => entry.path);
    expect(paths).toContain("/docs/getting-started");
    expect(paths).toContain("/docs/routing/pages-layouts-and-dynamic-routes");
    expect(new Set(paths).size).toBe(paths.length);
    paths.forEach((path) => expect(path).toMatch(/^\/docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/));
  });
});

describe("shared heading and reader lifecycle contract", () => {
  test("emits one matching H2/H3 model and rendered ID set", () => {
    const rendered = renderDocumentationMarkdown([
      "# Reader title",
      "",
      "## Install",
      "",
      "### Options",
      "",
      "```md",
      "## Hidden in code",
      "```",
      "",
      "## Install",
    ].join("\n"), "Reader title");
    expect(rendered.headings).toEqual([
      { id: "install", text: "Install", level: 2 },
      { id: "options", text: "Options", level: 3 },
      { id: "install-2", text: "Install", level: 2 },
    ]);
    rendered.headings.forEach((heading) => expect(rendered.html).toContain(`id="${heading.id}"`));
    expect(rendered.html).not.toContain("hidden-in-code");
  });

  test("uses refs, observers, cleanup, one marker, and reduced-motion GSAP", () => {
    const toc = readSource("src/components/reader/ReaderToc.zen");
    const transition = readSource("src/components/reader/DocsArticleTransition.zen");
    const routeTransition = readSource("src/components/route-transition/RouteTransition.zen");
    const docs = readSource("src/components/DocumentationArticle.zen");
    const docsRoute = readSource("src/pages/docs/[...slug].zen");
    expect(toc).toContain("const passed = headingPositions.filter");
    expect(toc).toContain("headingPositions.find");
    expect(toc).toContain("endVisible");
    expect(toc).toContain("headingObserver.disconnect()");
    expect(toc).toContain("endObserver.disconnect()");
    expect(toc).toContain("gsap.killTweensOf(indicator)");
    expect(transition).toContain("navigation:before-leave");
    expect(transition).toContain("navigation:before-enter");
    expect(transition).toContain("navigation:abort");
    expect(transition).toContain("prefers-reduced-motion: reduce");
    expect(transition).toContain("docsTransitionTimeline?.kill()");
    expect(routeTransition).toContain("layer?.overlay.isConnected && layer.overlay !== localOverlay");
    expect(docs).toContain('id="app"');
    expect(docs).toContain('data-docs-shell="true"');
    expect(docs).toContain('data-zen-link="true"');
    expect(docsRoute).toContain('String(ctx.params?.slug || "").split("/")');
    expect(docsRoute).toContain("routeSegments.length > 2");
    expect([toc, transition, docs].join("\n")).not.toContain("querySelector");
    expect([toc, transition, docs].join("\n")).not.toContain("addEventListener");
  });
});
