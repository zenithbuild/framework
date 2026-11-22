import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { PUBLIC_ROUTE_METADATA, createPageMetadata, indexablePublicRoutes } from "../src/content/site/metadata";

// Zenith v1 site (Round 4 + 4.1). Source of truth: the UI build handoff site-build-handoff.md and
// tokens.json; Figma page 04 "Approved Designs" for visuals. JUD-138..149.
const siteRoot = resolve(import.meta.dir, "..");
const read = (path: string) => {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const v1Files = [
  ...walk(resolve(siteRoot, "src/components/site-v1")),
  resolve(siteRoot, "src/pages/index.zen"),
  resolve(siteRoot, "src/pages/performance/index.zen"),
  resolve(siteRoot, "src/pages/showcase/index.zen"),
  resolve(siteRoot, "src/pages/how-it-works/compiler/index.zen"),
  resolve(siteRoot, "src/components/ui/Navigation.zen"),
  resolve(siteRoot, "src/components/globals/footer/Footer.zen"),
  resolve(siteRoot, "src/components/globals/footer/FooterNav.zen"),
  ...walk(resolve(siteRoot, "src/styles")),
];

describe("v1 tokens", () => {
  const tokens = read("src/styles/site-v1.css");
  test("uses the AA gold text token from tokens.json, not the decorative gold", () => {
    expect(tokens).toContain("--gold-text: #966800");
    expect(tokens).toContain("--gold-text: #ecbd4a");
  });
  test("component layer stays below utilities so display utilities win", () => {
    expect(read("src/styles/site-v1-components.css").trimStart().startsWith("@layer components")
      || read("src/styles/site-v1-components.css").includes("\n@layer components {")).toBe(true);
  });
  test("keeps 44px tap targets on v1 controls", () => {
    expect(read("src/styles/site-v1-components.css")).toContain("min-height: 44px");
    expect(read("src/styles/site-v1-hero.css")).toContain("min-height: 44px");
  });
  test("outlines interactive controls with border-strong (build gate 8)", () => {
    const sections = read("src/styles/site-v1-sections.css");
    expect(sections).toContain("border: 1px solid var(--border-strong);");
    expect(sections).toContain(".pipeline-acc-item { border: 1px solid var(--border-strong);");
    expect(read("src/styles/site-v1-nav.css")).toContain("[data-zen-theme-toggle] { position: relative; border-color: var(--border-strong); }");
  });
  test("honours reduced motion in the hero and section styles", () => {
    expect(read("src/styles/site-v1-hero.css")).toContain("prefers-reduced-motion: reduce");
  });
});

describe("v1 Home contract", () => {
  const hero = read("src/components/site-v1/HomeHero.zen");
  const panel = read("src/components/site-v1/HeroCompilePanel.zen");
  const pipeline = read("src/components/site-v1/PipelineSection.zen");
  const cta = read("src/components/site-v1/ClosingCta.zen");

  test("renders the approved headline as the single H1 alongside the first-visit intro", () => {
    expect(hero).toContain('id="hero-title"');
    expect(hero).toContain("Ship interfaces");
    expect(hero).toContain("the compiler");
    expect(hero).toContain("can trust.");
    expect((hero.match(/<h1/g) || []).length).toBe(1);
    expect(read("src/pages/index.zen")).toContain("introEnabled={true}");
  });

  test("exposes the hero GSAP hook contract without animating anything itself", () => {
    ["data-hero-panel", "data-hero-state", "data-hero-tab", "data-hero-trigger", "data-hero-reset", "data-hero-live"]
      .forEach((hook) => expect(panel).toContain(hook));
    expect(panel).toContain('"hero:statechange"');
    expect(panel).toContain('"hero:layout"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).not.toContain("gsap");
    expect(hero).not.toContain("gsap");
  });

  test("pipeline uses a vertical tablist on desktop and an accordion below 768", () => {
    expect(pipeline).toContain('id="how-it-works"');
    expect(pipeline).toContain('aria-orientation="vertical"');
    expect(pipeline).toContain("data-pipeline-highlight");
    expect(pipeline).toContain('"pipeline:stagechange"');
    expect((pipeline.match(/aria-expanded=/g) || []).length).toBe(4);
  });

  test("closing CTA terminal toggle controls the full log region", () => {
    expect(cta).toContain('id="get-started"');
    expect(cta).toContain('aria-controls="full-log"');
    expect(cta).toContain('id="full-log"');
    expect(cta).toContain("Show full log ▾");
    expect(cta).toContain("Hide full log ▴");
  });

  test("copy feedback has no timers in component scripts", () => {
    expect(read("src/components/site-v1/CopyCommand.zen")).not.toContain("setTimeout(");
    expect(read("src/components/site-v1/CopyCommand.zen")).toContain("data-copy-status");
  });
});

describe("parked /showcase", () => {
  test("is noindex and absent from navigation, footer, and search", () => {
    expect(PUBLIC_ROUTE_METADATA["/showcase"]?.noindex).toBe(true);
    expect(createPageMetadata("/showcase").robots).toBe("noindex,nofollow");
    expect(createPageMetadata("/").robots).not.toContain("noindex");
    expect(indexablePublicRoutes().some((route) => route.path === "/showcase")).toBe(false);
    expect(read("src/content/site/navigation.json")).not.toContain("/showcase");
    expect(read("src/content/site/footer.json")).not.toContain("/showcase");
    expect(read("src/server/siteSearchIndex.ts")).toContain("indexablePublicRoutes()");
  });
});

describe("/performance launch card", () => {
  test("publishes no score until a recorded run exists", () => {
    const performance = read("src/pages/performance/index.zen");
    expect(performance).toContain("—");
    expect(performance).not.toMatch(/\b(score|LCP|CLS|INP)\b[^<\n]{0,20}\b\d{1,3}(\.\d+)?\b/);
    expect(performance).toContain("https://pagespeed.web.dev/");
  });
});

describe("v1 file size", () => {
  test("keeps every v1 source file at or under 500 lines", () => {
    const oversized = v1Files
      .filter((file) => /\.(zen|ts|css|json)$/.test(file))
      .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n").length }))
      .filter(({ lines }) => lines > 500);
    expect(oversized).toEqual([]);
  });
});

describe("v1 Docs article", () => {
  test("wraps rendered code in a dark panel with a Copy button and links the source file", async () => {
    const { decorateDocumentationCode } = await import("../src/server/documentationViewModel");
    const html = decorateDocumentationCode('<p>x</p><pre data-language="text"><code class="language-text">a -&gt; b</code></pre>');
    expect(html).toContain('<figure class="docs-code" data-docs-code="true">');
    expect(html).toContain('data-docs-copy="true"');
    expect(html).toContain('<pre data-language="text"><code class="language-text">a -&gt; b</code></pre></figure>');
    const article = read("src/components/DocumentationArticle.zen");
    expect(article).toContain('aria-controls="docs-toc-panel"');
    expect(article).toContain('aria-controls="docs-sections"');
    expect(article).toContain("Edit this page on GitHub");
    expect(article).toContain('data-docs-next-step="true"');
    expect(read("src/server/documentationViewModel.ts")).toContain("https://github.com/zenithbuild/framework/blob/master/");
  });
});
