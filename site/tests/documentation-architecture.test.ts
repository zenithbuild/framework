import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPublicDocumentationPath,
  PUBLIC_DOCUMENTATION_SECTIONS,
} from "../../docs/public-documentation-policy.mjs";
import { renderDocumentationMarkdown, isSafeDocumentationUrl } from "../src/server/documentationMarkdown";
import {
  collectDocumentationOrderDiagnostics,
  discoverLocalDocumentationEntries,
} from "../src/server/localDocumentationSource";
import { loadDocumentationPageSource } from "../src/server/documentationPageSource";
import { createDocumentationViewModel } from "../src/server/documentationViewModel";

const siteRoot = resolve(import.meta.dir, "..");
const docsRoot = resolve(siteRoot, "../docs/documentation");

describe("public documentation inventory", () => {
  test("uses one explicit path boundary for Tina and the repo loader", async () => {
    const diskFiles = readdirSync(docsRoot, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".md"));
    const publicFiles = diskFiles.filter(isPublicDocumentationPath).sort();
    const entries = await discoverLocalDocumentationEntries();
    const loaderFiles = entries.map((entry) => String(entry.sourcePath).replace("docs/documentation/", "")).sort();

    expect(publicFiles).toHaveLength(66);
    expect(loaderFiles).toEqual(publicFiles);
    expect(publicFiles).not.toContain("_inventory.md");
    expect(existsSync(resolve(siteRoot, "content/docs"))).toBe(false);
    expect(existsSync(resolve(siteRoot, "src/content/docs"))).toBe(false);
  });

  test("has unique canonical routes and safe path-derived slugs", async () => {
    const entries = await discoverLocalDocumentationEntries();
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(entries.length);
    expect(entries.every((entry) => /^\/docs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(entry.path))).toBe(true);
    const missing = await loadDocumentationPageSource({ slug: "..", sectionSlug: "routing" });
    expect(missing.document).toBeNull();
  });
});

describe("reader-first documentation order", () => {
  test("uses the canonical section and article order", async () => {
    const source = await loadDocumentationPageSource({ slug: "getting-started", sectionSlug: "root" });
    expect(source.sections.map((group) => group.section.title)).toEqual(
      PUBLIC_DOCUMENTATION_SECTIONS.map((section) => section.title),
    );
    expect(source.sections[0]?.entries.map((entry) => entry.path)).toEqual([
      "/docs/getting-started",
      "/docs/install-compatibility",
      "/docs/getting-started/project-structure",
      "/docs/getting-started/first-page",
      "/docs/getting-started/development-workflow",
      "/docs/getting-started/build-and-preview",
    ]);
  });

  test("previous and next cross section boundaries without loops", async () => {
    const source = await loadDocumentationPageSource({ slug: "build-and-preview", sectionSlug: "getting-started" });
    expect(source.document).not.toBeNull();
    const view = createDocumentationViewModel(source.document!, source.sections, source.sourceMode);
    expect(view.previous?.path).toBe("/docs/getting-started/development-workflow");
    expect(view.next?.path).toBe("/docs/zenith-contract");
    expect(view.next?.path).not.toBe(source.document?.path);
  });

  test("provides structured reader navigation without presentation HTML", async () => {
    const source = await loadDocumentationPageSource({ slug: "events", sectionSlug: "syntax" });
    const view = createDocumentationViewModel(source.document!, source.sections, source.sourceMode);

    expect(view.sections[0]?.title).toBe("Getting Started");
    expect(view.sections.find((section) => section.current)?.title).toBe("Core Concepts");
    expect(view.sections.flatMap((section) => section.entries).find((entry) => entry.current)?.path).toBe("/docs/syntax/events");
    expect(view.breadcrumbs.map((breadcrumb) => breadcrumb.label)).toEqual(["Docs", "Core Concepts", "Events"]);
    expect(view.headings.length).toBeGreaterThan(0);
    expect("sidebarHtml" in view).toBe(false);
    expect("headingsHtml" in view).toBe(false);
  });

  test("duplicate article orders produce deterministic diagnostics", async () => {
    const entries = await discoverLocalDocumentationEntries();
    const duplicate = { ...entries[1], docOrder: entries[0].docOrder, section: entries[0].section };
    expect(collectDocumentationOrderDiagnostics([entries[0], duplicate])[0]).toContain("duplicate order");
  });
});

describe("documentation Markdown rendering", () => {
  test("renders GFM structures and derives headings from the rendered pass", () => {
    const source = [
      "## Same heading",
      "## Same heading",
      "- parent",
      "  - child",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| Zenith | `<Page>` |",
      "",
      "```zen",
      "<button on:click={save}>Save</button>",
      "```",
      "",
      "![Logo](/logo.svg)",
      "<script>globalThis.pwned = true</script>",
    ].join("\n");
    const rendered = renderDocumentationMarkdown(source);

    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain("<ul>");
    expect(rendered.html).toContain('data-language="zen"');
    expect(rendered.html).toContain("&lt;button on:click={save}&gt;");
    expect(rendered.html).toContain('alt="Logo"');
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.headings.map((heading) => heading.id)).toEqual(["same-heading", "same-heading-2"]);
    expect(rendered.headings.every((heading) => rendered.html.includes(`id="${heading.id}"`))).toBe(true);
  });

  test("uses the article shell as the single visible title", () => {
    const rendered = renderDocumentationMarkdown("# Events\n\n## Bind an event\n\nUse `on:click`.", "Events");
    expect(rendered.html).not.toContain("<h1");
    expect(rendered.html).toContain('<h2 id="bind-an-event"');
    expect(rendered.headings.map((heading) => heading.text)).toEqual(["Bind an event"]);
  });

  test("rejects executable and traversal URL schemes", () => {
    expect(isSafeDocumentationUrl("/docs/getting-started")).toBe(true);
    expect(isSafeDocumentationUrl("https://zenith.build/docs")).toBe(true);
    expect(isSafeDocumentationUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeDocumentationUrl("../../private.md")).toBe(false);
  });
});
