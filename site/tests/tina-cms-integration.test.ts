import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadDocumentationPageSource } from "../src/server/documentationPageSource";
import { loadGitBlogPosts } from "../src/server/gitBlogSource";
import { loadAboutContent, loadEditorialContentSource, loadSponsorshipContent } from "../src/server/editorialContentSource";
import { assertUniqueSlugs, ContentValidationError, normalizeSponsor, safePublicUrl } from "../src/server/contentValidation";

const siteRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(siteRoot, "..");

describe("Tina repository architecture", () => {
  test("points at the repository content root and existing docs without duplication", () => {
    const config = readFileSync(resolve(siteRoot, "tina/config.ts"), "utf8");
    const docsCollection = readFileSync(resolve(siteRoot, "tina/collections/docs.ts"), "utf8");
    expect(config).toContain('localContentPath: "../.."');
    expect(docsCollection).toContain("path: PUBLIC_DOCUMENTATION_ROOT");
    expect(docsCollection).toContain("match: PUBLIC_DOCUMENTATION_MATCH");
    expect(existsSync(resolve(siteRoot, "content/docs"))).toBe(false);
    expect(existsSync(resolve(siteRoot, "src/content/docs"))).toBe(false);
    expect(existsSync(resolve(siteRoot, "tina/__generated__/client.ts"))).toBe(true);
  });

  test("keeps public docs explicit and excludes the draft inventory", async () => {
    const nav = JSON.parse(readFileSync(resolve(repoRoot, "docs/public/ai/docs.nav.json"), "utf8"));
    const publicEntries = nav.categories.flatMap((category: any) => category.docs);
    expect(publicEntries).toHaveLength(66);
    expect(publicEntries.some((entry: any) => entry.source_path.includes("_inventory"))).toBe(false);
    const sourceFiles = readdirSync(resolve(repoRoot, "docs/documentation"), { recursive: true })
      .filter((name) => String(name).endsWith(".md"));
    expect(sourceFiles.length).toBeGreaterThan(publicEntries.length);

    const page = await loadDocumentationPageSource({ slug: "route-protection", sectionSlug: "routing" });
    expect(page.document?.sourcePath).toBe("docs/documentation/routing/route-protection.md");
    expect(page.document?.htmlRendered).toContain("<pre data-language=");
    expect(page.document?.headings.length).toBeGreaterThan(0);
    expect(page.sections.flatMap((group) => group.entries).some((entry) => entry.slug === "_inventory")).toBe(false);
  });
});

describe("normalized Git content", () => {
  test("loads published Blog Markdown deterministically", async () => {
    const posts = await loadGitBlogPosts();
    expect(posts).toHaveLength(4);
    expect(posts[0].slug).toBe("building-zenith-0-8");
    expect(posts[0].featured).toBe(true);
    expect(posts[0].author.name).toBe("Judah Sullivan");
    expect(posts[0].htmlRendered).toContain('id="server-truth-before-client-convenience"');
    expect(posts[0].htmlRendered).toContain("language-zen");
    expect(posts.every((post) => post.canonicalPath === post.path)).toBe(true);
  });

  test("loads About, people, sponsorship, and settings with controlled fallbacks", async () => {
    const fallback = { pageTitle: "Fallback", description: "Fallback description" };
    const about = await loadAboutContent(fallback);
    const editorial = await loadEditorialContentSource();
    expect(about.pageTitle).toBe("About Zenith");
    expect(editorial.people.map((person) => person.name)).toContain("Jonathan Streetman");
    expect(editorial.people).toHaveLength(3);
    expect(editorial.sponsorship.mode).toBe("invitation");
    expect(editorial.sponsorship.ctaUrl).toBe("https://github.com/sponsors/zenithbuild");
    expect(editorial.settings.defaultSeoTitle).toBe("ZenithBuild");
  });

  test("excludes expired sponsors and rejects unsafe URLs and duplicate slugs", async () => {
    const sponsorship = await loadSponsorshipContent(new Date("2030-01-01T00:00:00.000Z"));
    expect(sponsorship.sponsorship.mode).toBe("invitation");
    expect(safePublicUrl("javascript:alert(1)")).toBeNull();
    expect(safePublicUrl("/docs")).toBe("/docs");
    expect(() => assertUniqueSlugs([{ slug: "same" }, { slug: "same" }], "test")).toThrow(ContentValidationError);
    expect(normalizeSponsor({
      kind: "sponsor",
      name: "Example sponsor",
      url: "https://example.com",
      recognitionText: "Supports Zenith development.",
      active: true,
      featured: true,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
    }, new Date("2026-07-13T00:00:00.000Z"))?.name).toBe("Example sponsor");
    expect(normalizeSponsor({
      kind: "sponsor",
      name: "Expired sponsor",
      url: "https://example.com",
      recognitionText: "Expired.",
      active: true,
      endsAt: "2025-01-01T00:00:00.000Z",
    }, new Date("2026-07-13T00:00:00.000Z"))).toBeNull();
  });
});
