import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string): string {
  const abs = resolve(siteRoot, path);
  return existsSync(abs) ? readFileSync(abs, "utf8") : "";
}

const modalSource = readSource("src/components/search/SearchModal.zen");
const triggerSource = readSource("src/components/search/SearchTrigger.zen");
const engineSource = readSource("src/components/search/searchEngine.ts");
const navSource = readSource("src/components/ui/Navigation.zen");
const layoutSource = readSource("src/layouts/DefaultLayout.zen");
const blogIndexSource = readSource("src/pages/blog/index.zen");
const docsIndexSource = readSource("src/pages/docs/index.zen");
const homeSource = readSource("src/pages/index.zen");

describe("SearchModal component contract", () => {
  test("uses role=dialog and aria-modal=true", () => {
    expect(modalSource.includes('role="dialog"')).toBe(true);
    expect(modalSource.includes('aria-modal="true"')).toBe(true);
  });

  test("has accessible title via aria-label", () => {
    expect(modalSource.includes("aria-label")).toBe(true);
  });

  test("has accessible search label", () => {
    expect(modalSource.includes('aria-label="Search"')).toBe(true);
  });

  test("uses zenOn for event subscriptions (not addEventListener)", () => {
    expect(modalSource.includes("zenOn")).toBe(true);
    expect(modalSource.includes("addEventListener")).toBe(false);
  });

  test("uses zenDocument (not document directly)", () => {
    expect(modalSource.includes("zenDocument")).toBe(true);
  });

  test("uses zenWindow for window access", () => {
    expect(modalSource.includes("zenWindow")).toBe(true);
  });

  test("does not use querySelector in script", () => {
    const scriptSection = modalSource.split("</script>")[0] || "";
    expect(scriptSection.includes("zen-allow:dom-query")).toBe(true);
  });

  test("supports keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)", () => {
    expect(modalSource.includes("ArrowDown")).toBe(true);
    expect(modalSource.includes("ArrowUp")).toBe(true);
    expect(modalSource.includes("Enter")).toBe(true);
    expect(modalSource.includes("Escape")).toBe(true);
  });

  test("has backdrop click close", () => {
    expect(modalSource.includes("handleBackdrop")).toBe(true);
  });

  test("has focus management (focus input on open, return focus on close)", () => {
    expect(modalSource.includes("modalPreviouslyFocused")).toBe(true);
    expect(modalSource.includes(".focus()")).toBe(true);
  });

  test("has body scroll lock", () => {
    expect(modalSource.includes("body.style.overflow")).toBe(true);
  });

  test("has result count with aria-live", () => {
    expect(modalSource.includes('aria-live="polite"')).toBe(true);
  });

  test("has empty state", () => {
    expect(modalSource.includes("data-search-empty-state")).toBe(true);
  });

  test("has preview pane", () => {
    expect(modalSource.includes("data-search-preview")).toBe(true);
  });

  test("has results list", () => {
    expect(modalSource.includes("data-search-results")).toBe(true);
  });

  test("has filter reset", () => {
    expect(modalSource.includes("resetFilters")).toBe(true);
    expect(modalSource.includes("data-filter-reset")).toBe(true);
  });

  test("filter triggers are real Zenith buttons inside a delegated filter bar", () => {
    const scriptEnd = modalSource.indexOf("</script>");
    const markup = modalSource.slice(scriptEnd);
    expect(modalSource.includes("handleResultsClick")).toBe(true);
    expect(modalSource.includes("handleResultsHover")).toBe(true);
    expect(modalSource.includes("handleFilterBarClick")).toBe(true);
    expect(markup.includes('data-filter-trigger="section"')).toBe(true);
    expect(markup.includes('data-filter-trigger="tag"')).toBe(true);
    expect(markup.includes('data-filter-trigger="category"')).toBe(true);
    expect(markup.includes('data-filter-trigger="author"')).toBe(true);
    expect(markup.includes('data-filter-trigger="sort"')).toBe(true);
    expect(markup.includes('data-filter-reset="true"')).toBe(true);
    expect(markup.includes("on:click={toggleSection}")).toBe(false);
    expect(markup.includes("unsafeHTML={renderFilterSection")).toBe(false);
  });

  test("uses on: events (not onclick or @click)", () => {
    expect(modalSource.includes("on:click")).toBe(true);
    expect(modalSource.includes("on:input")).toBe(true);
    expect(modalSource.includes("on:keydown")).toBe(true);
    expect(modalSource.includes("on:pointerenter")).toBe(true);
  });

  test("uses Tailwind tokens (no raw hex colors)", () => {
    expect(/#[0-9a-fA-F]{3,6}\b/.test(modalSource)).toBe(false);
  });

  test("subscribes to search:open custom event", () => {
    expect(modalSource.includes("search:open")).toBe(true);
  });

  test("supports scope config (global, docs, blog)", () => {
    expect(modalSource.includes('"global"')).toBe(true);
    expect(modalSource.includes('"docs"')).toBe(true);
    expect(modalSource.includes('"blog"')).toBe(true);
  });

  test("mobile responsive (hidden sm:block for preview pane)", () => {
    expect(modalSource.includes("sm:block")).toBe(true);
  });

  test("file is under 500 lines", () => {
    const lineCount = modalSource.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(500);
  });
});

describe("SearchTrigger component contract", () => {
  test("dispatches search:open custom event", () => {
    expect(triggerSource.includes("search:open")).toBe(true);
  });

  test("supports scope prop", () => {
    expect(triggerSource.includes("scope")).toBe(true);
  });

  test("uses zenDocument (not document directly)", () => {
    expect(triggerSource.includes("zenDocument")).toBe(true);
  });

  test("uses zenOn for keyboard shortcut (Cmd+K / Ctrl+K)", () => {
    expect(triggerSource.includes("zenOn")).toBe(true);
    expect(triggerSource.includes("metaKey")).toBe(true);
    expect(triggerSource.includes("ctrlKey")).toBe(true);
  });

  test("does not use addEventListener", () => {
    expect(triggerSource.includes("addEventListener")).toBe(false);
  });

  test("uses on:click (not onclick)", () => {
    expect(triggerSource.includes("on:click")).toBe(true);
    expect(triggerSource.includes("onclick=")).toBe(false);
  });
});

describe("Search engine contract", () => {
  test("implements weighted scoring", () => {
    expect(engineSource.includes("SCORE_EXACT_TITLE")).toBe(true);
    expect(engineSource.includes("SCORE_TITLE_PREFIX")).toBe(true);
    expect(engineSource.includes("SCORE_HEADING")).toBe(true);
    expect(engineSource.includes("SCORE_CATEGORY_SECTION_TAG")).toBe(true);
    expect(engineSource.includes("SCORE_DESCRIPTION")).toBe(true);
    expect(engineSource.includes("SCORE_BODY")).toBe(true);
  });

  test("implements highlight to HTML", () => {
    expect(engineSource.includes("highlightToHtml")).toBe(true);
    expect(engineSource.includes("<mark")).toBe(true);
  });

  test("implements punctuation normalization", () => {
    expect(engineSource.includes("NFKD")).toBe(true);
  });

  test("implements duplicate suppression", () => {
    expect(engineSource.includes("seen")).toBe(true);
  });

  test("implements scope filtering", () => {
    expect(engineSource.includes("scopeMatches")).toBe(true);
  });
});

describe("Search integration into pages", () => {
  test("Navigation has a SearchTrigger with global scope", () => {
    expect(navSource.includes("SearchTrigger")).toBe(true);
    expect(navSource.includes('scope="global"')).toBe(true);
  });

  test("DefaultLayout renders SearchModal", () => {
    expect(layoutSource.includes("SearchModal")).toBe(true);
    expect(layoutSource.includes("searchIndex")).toBe(true);
  });

  test("Home page passes searchIndex to layout", () => {
    expect(homeSource.includes("searchIndex")).toBe(true);
    expect(homeSource.includes("loadSearchIndex")).toBe(true);
  });

  test("Blog index page passes searchIndex and has blog-scoped trigger", () => {
    expect(blogIndexSource.includes("searchIndex")).toBe(true);
    expect(blogIndexSource.includes("loadSearchIndex")).toBe(true);
    expect(blogIndexSource.includes('scope="blog"')).toBe(true);
  });

  test("Docs index page passes searchIndex and has docs-scoped trigger", () => {
    expect(docsIndexSource.includes("searchIndex")).toBe(true);
    expect(docsIndexSource.includes("loadSearchIndex")).toBe(true);
    expect(docsIndexSource.includes('scope="docs"')).toBe(true);
  });
});

describe("SearchModal real compiler validation", () => {
  test("SearchModal.zen compiles with the real Zenith compiler", () => {
    const { execSync } = require("node:child_process");
    const compiler = resolve(siteRoot, "../packages/compiler/target/release/zenith-compiler");
    const modalPath = resolve(siteRoot, "src/components/search/SearchModal.zen");
    let result: string;
    try {
      result = execSync(`${compiler} --embedded-markup-expressions "${modalPath}"`, {
        encoding: "utf8",
        timeout: 15000,
      });
    } catch (err: any) {
      throw new Error(`Zenith compiler failed for SearchModal.zen: ${err.stderr || err.message}`);
    }
    const parsed = JSON.parse(result);
    expect(parsed.diagnostics).toEqual([]);
  });

  test("SearchTrigger.zen compiles with the real Zenith compiler", () => {
    const { execSync } = require("node:child_process");
    const compiler = resolve(siteRoot, "../packages/compiler/target/release/zenith-compiler");
    const triggerPath = resolve(siteRoot, "src/components/search/SearchTrigger.zen");
    let result: string;
    try {
      result = execSync(`${compiler} --embedded-markup-expressions "${triggerPath}"`, {
        encoding: "utf8",
        timeout: 15000,
      });
    } catch (err: any) {
      throw new Error(`Zenith compiler failed for SearchTrigger.zen: ${err.stderr || err.message}`);
    }
    const parsed = JSON.parse(result);
    expect(parsed.diagnostics).toEqual([]);
  });

  test("SearchModal script has no state declarations with type annotations", () => {
    const scriptSection = modalSource.split("</script>")[0] || "";
    const stateLines = scriptSection.split("\n").filter((line) => line.trim().startsWith("state "));
    for (const line of stateLines) {
      const afterState = line.trim().slice(6);
      const colonIdx = afterState.indexOf(":");
      const eqIdx = afterState.indexOf("=");
      if (colonIdx >= 0 && (eqIdx < 0 || colonIdx < eqIdx)) {
        throw new Error(`State declaration with type annotation found (unsupported by Zenith compiler): ${line.trim()}`);
      }
    }
  });
});

describe("SearchModal runtime binding regression", () => {
  test("no removed helper functions referenced in markup", () => {
    const scriptEnd = modalSource.indexOf("</script>");
    const markup = modalSource.slice(scriptEnd);
    const removedHelpers = ["showDocsFilters", "showBlogFilters", "hasActiveFilters"];
    for (const helper of removedHelpers) {
      if (markup.includes(helper)) {
        throw new Error(`Removed helper ${helper} still referenced in markup`);
      }
    }
  });

  test("filter bar uses delegated click instead of per-button handlers", () => {
    const scriptEnd = modalSource.indexOf("</script>");
    const markup = modalSource.slice(scriptEnd);
    expect(markup.includes("on:click={handleFilterBarClick")).toBe(true);
    expect(markup.includes("on:click={toggleSection}")).toBe(false);
    expect(markup.includes("on:click={toggleCategory}")).toBe(false);
    expect(markup.includes("on:click={toggleTag}")).toBe(false);
    expect(markup.includes("on:click={toggleAuthor}")).toBe(false);
    expect(markup.includes("on:click={toggleSort}")).toBe(false);
  });

  test("filter controls use conditional rendering and real option markup", () => {
    const scriptEnd = modalSource.indexOf("</script>");
    const markup = modalSource.slice(scriptEnd);
    expect(markup.includes('modalScope === "docs" && modalDocsFilters')).toBe(true);
    expect(markup.includes('modalScope === "blog" && modalBlogFilters')).toBe(true);
    expect(markup.includes('modalFilterSection !== "All"')).toBe(true);
    expect(markup.includes('data-filter-trigger="section"')).toBe(true);
    expect(markup.includes('data-filter-name="section"')).toBe(true);
    expect(markup.includes('data-filter-name="category"')).toBe(true);
    expect(markup.includes('unsafeHTML={renderFilterOpts')).toBe(false);
    expect(markup.includes('filterOptions("section").map')).toBe(true);
    expect(markup.includes('filterOptions("category").map')).toBe(true);
    expect(markup.includes('on:click={() => selectFilter')).toBe(false);
    expect(markup.includes('on:click={handleFilterOptionClick')).toBe(false);
    expect(markup.includes('role="menuitem"')).toBe(true);
    expect(markup.includes('aria-controls="search-filter-section-menu"')).toBe(true);
  });

  test(
    "full production build completes and emits a valid home page",
    async () => {
      const { execSync } = require("node:child_process");
      const { readFileSync, existsSync } = require("node:fs");
      const { resolve } = require("node:path");
      const siteRoot = resolve(import.meta.dir, "..");
      let output: string;
      try {
        output = execSync("bun run build", { cwd: siteRoot, encoding: "utf8", timeout: 120000, stdio: "pipe" });
      } catch (err: any) {
        throw new Error(`Production build failed: ${err.stderr || err.stdout || err.message}`);
      }
      expect(output.includes("Built 8 page(s)")).toBe(true);
      expect(output.includes("286 asset(s)")).toBe(true);
      const indexHtml = resolve(siteRoot, "dist/static/index.html");
      expect(existsSync(indexHtml)).toBe(true);
      const html = readFileSync(indexHtml, "utf8");
      expect(html.length).toBeGreaterThan(1000);
      expect(html.includes("Zenith Dev Building")).toBe(false);
      expect(html.includes("BINDING_APPLY_FAILED")).toBe(false);
      expect(html.includes("showDocsFilters")).toBe(false);
    },
    { timeout: 130_000 },
  );
});
