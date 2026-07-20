import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PUBLIC_ROUTE_METADATA,
  createPageMetadata,
} from "../src/content/site/metadata";

const siteRoot = resolve(import.meta.dir, "..");
const publicRoutes = [
  "/",
  "/blog",
  "/blog/building-zenith-0-8",
  "/docs",
  "/docs/getting-started",
  "/about",
];

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const pageFiles = [
  "src/pages/index.zen",
  "src/pages/blog/index.zen",
  "src/pages/blog/building-zenith-0-8/index.zen",
  "src/pages/docs/index.zen",
  "src/pages/docs/getting-started/index.zen",
  "src/pages/about/index.zen",
];

describe("public metadata contract", () => {
  test("defines unique factual metadata for every public route", () => {
    expect(Object.keys(PUBLIC_ROUTE_METADATA).sort()).toEqual(publicRoutes.sort());
    const titles = publicRoutes.map((path) => PUBLIC_ROUTE_METADATA[path].title);
    const descriptions = publicRoutes.map((path) => PUBLIC_ROUTE_METADATA[path].description);
    expect(new Set(titles).size).toBe(publicRoutes.length);
    expect(new Set(descriptions).size).toBe(publicRoutes.length);
    descriptions.forEach((description) => expect(description.length).toBeGreaterThan(40));
  });

  test("builds canonicals and URL-bearing structured data only from a configured origin", () => {
    const configured = createPageMetadata("/blog/building-zenith-0-8", "https://zenith.example");
    const unconfigured = createPageMetadata("/blog/building-zenith-0-8", "");
    expect(configured.canonicalUrl).toBe("https://zenith.example/blog/building-zenith-0-8");
    expect(configured.socialImageUrl).toBe("https://zenith.example/logo.png");
    expect(configured.structuredData).toContain('"@type":"BlogPosting"');
    expect(configured.structuredData).toContain('"@type":"Person"');
    expect(unconfigured.canonicalUrl).toBe("");
    expect(unconfigured.socialImageUrl).toBe("");
    expect(unconfigured.structuredData).toBe("");
  });

  test("renders the complete static metadata surface through the shared layout", () => {
    const layout = readSource("src/layouts/DefaultLayout.zen");
    expect(layout.includes('defaultLayoutCanonicalUrl ? "canonical" : undefined')).toBe(true);
    expect(layout.includes('property="og:title"')).toBe(true);
    expect(layout.includes('property="og:description"')).toBe(true);
    expect(layout.includes('property="og:type"')).toBe(true);
    expect(layout.includes('name="twitter:card"')).toBe(true);
    expect(layout.includes('structuredDataNode.type = "application/ld+json"')).toBe(true);
    expect(layout.includes("structuredDataRef.current?.remove()")).toBe(true);
    pageFiles.forEach((file) => {
      const source = readSource(file);
      expect(source.includes("createPageMetadata") || source.includes("createContentMetadata")).toBe(true);
      expect(source.includes("metadata={data.metadata}")).toBe(true);
    });
  });
});

describe("semantic route relationships", () => {
  test("keeps blog and docs navigation crawlable and contextual", () => {
    const articleRoute = readSource("src/pages/blog/building-zenith-0-8/index.zen");
    const articleSurface = readSource("src/components/BlogArticle.zen");
    const docs = readSource("src/components/DocumentationArticle.zen");
    expect(articleRoute.includes("loadBlogDetailSource")).toBe(true);
    expect(articleSurface.includes("<article")).toBe(true);
    expect(articleSurface.includes('href="/blog"')).toBe(true);
    expect(articleSurface.includes("Back to Blog")).toBe(true);
    expect(articleSurface.includes('aria-label="Article pagination"')).toBe(true);
    expect(docs.includes("<article")).toBe(true);
    expect(docs.includes('aria-label="Breadcrumb"')).toBe(true);
    expect(docs.includes("documentationView.breadcrumbs")).toBe(true);
    expect(docs.includes('aria-label="Documentation pagination"')).toBe(true);
  });
});
