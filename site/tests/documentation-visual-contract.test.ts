import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");
const readSource = (relativePath: string) => readFileSync(resolve(siteRoot, relativePath), "utf8");

describe("documentation visual restoration contract", () => {
  test("keeps the approved editorial landing composition", () => {
    const source = readSource("src/pages/docs/index.zen");
    expect(source).toContain("PageHeader");
    expect(source).toContain('data-motion-section="docs-start"');
    expect(source).toContain('data-motion-section="docs-foundations"');
    expect(source).toContain('data-motion-section="docs-server"');
    expect(source).toContain('data-motion-section="docs-delivery"');
    expect(source).toContain('data-docs-section-grid="true"');
    expect(source).not.toContain("sectionDirectoryHtml");
  });

  test("keeps the reader shell structured and width constrained", () => {
    const source = readSource("src/components/DocumentationArticle.zen");
    expect(source).toContain('data-docs-sidebar="true"');
    expect(source).toContain('data-docs-article="true"');
    expect(source).toContain('data-docs-on-this-page="true"');
    expect(source).toContain('data-docs-shell="true"');
    expect(source).toContain('id="app"');
    expect(source).toContain("<ReaderToc");
    expect(source).toContain("max-w-7xl");
    expect(source).toContain("xl:grid-cols-[15rem_minmax(0,1fr)_13rem]");
    expect(source).toContain("sticky top-28");
    expect(source).not.toContain("Source truth");
    expect(source).not.toContain("Docs record");
    expect(source).toContain("unsafeHTML={documentationView.htmlRendered}");
    expect(source).not.toContain("sidebarHtml");
    expect(source).not.toContain("headingsHtml");
  });

  test("keeps Docs prose styling scoped", () => {
    const globals = readSource("src/styles/globals.css");
    const docsStyles = readSource("src/styles/docs.css");
    expect(globals).toContain('@import "./docs.css"');
    expect(docsStyles).toContain(".docs-richtext pre");
    expect(docsStyles).toContain(".docs-richtext table");
    expect(docsStyles).toContain(".docs-richtext blockquote");
    expect(docsStyles).not.toContain(".content-richtext");
  });
});
