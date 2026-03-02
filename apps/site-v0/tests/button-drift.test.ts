/**
 * Drift gates for:
 * 1. Two-primitive button system (Button.zen / IconButton.zen)
 * 2. Canonical props/TS enforcement (no fake prop DSL, no forbidden event syntax)
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const srcDir = join(projectRoot, "src");

const ALLOWLISTED_FILES = new Set([
  "components/ui/Button.zen",
  "components/ui/IconButton.zen",
]);

function* walkZenFiles(dir: string, base = ""): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = join(base, entry.name);
    if (entry.isDirectory()) {
      yield* walkZenFiles(join(dir, entry.name), rel);
    } else if (entry.name.endsWith(".zen")) {
      yield rel;
    }
  }
}

function extractRawButtonTags(content: string): { tag: string; lineNum: number }[] {
  const results: { tag: string; lineNum: number }[] = [];
  const tagRe = /<(button|a)\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(content)) !== null) {
    const pos = match.index;
    if (isInsideScriptOrStyle(content, pos)) continue;
    if (isInsideStringLiteral(content, pos)) continue;
    const upToMatch = content.slice(0, pos);
    const lineNum = upToMatch.split("\n").length;
    results.push({ tag: match[0], lineNum });
  }
  return results;
}

function isInsideScriptOrStyle(content: string, position: number): boolean {
  const before = content.slice(0, position);
  for (const tag of ["script", "style"]) {
    const lastOpen = before.lastIndexOf(`<${tag}`);
    if (lastOpen === -1) continue;
    const lastClose = before.lastIndexOf(`</${tag}>`);
    if (lastClose < lastOpen) return true;
  }
  return false;
}

const PILL_INDICATORS = ["rounded-full", "font-mono", "uppercase"];
const ICON_SIZE_RE = /\bw-(?:8|10|12)\b.*\bh-(?:8|10|12)\b|\bh-(?:8|10|12)\b.*\bw-(?:8|10|12)\b/;

describe("Button system drift gates", () => {
  test("no raw <button> tags outside Button.zen / IconButton.zen", () => {
    const violations: string[] = [];

    for (const rel of walkZenFiles(srcDir)) {
      if (ALLOWLISTED_FILES.has(rel)) continue;
      const content = readFileSync(join(srcDir, rel), "utf8");
      const tags = extractRawButtonTags(content);
      for (const { tag, lineNum } of tags) {
        if (tag.startsWith("<button")) {
          violations.push(`${rel}:${lineNum} raw <button> tag (use <Button /> or <IconButton />)`);
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Raw <button> tags found outside primitives:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("no raw pill-button markup outside Button.zen / IconButton.zen", () => {
    const violations: string[] = [];

    for (const rel of walkZenFiles(srcDir)) {
      if (ALLOWLISTED_FILES.has(rel)) continue;
      const content = readFileSync(join(srcDir, rel), "utf8");
      const tags = extractRawButtonTags(content);

      for (const { tag, lineNum } of tags) {
        if (!tag.includes("rounded-full")) continue;

        const decorative = /\bw-1\.5\b|\bw-2\b|\brounded-full\b[^"]*\bbg-/.test(tag)
          && !tag.includes("font-mono")
          && !tag.includes("uppercase");
        if (decorative) continue;

        const isPill = PILL_INDICATORS.every((m) => tag.includes(m));
        if (isPill) {
          violations.push(`${rel}:${lineNum} raw pill button (use <Button />)`);
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Raw pill buttons found outside primitives:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("no raw icon-circle markup outside IconButton.zen", () => {
    const violations: string[] = [];

    for (const rel of walkZenFiles(srcDir)) {
      if (ALLOWLISTED_FILES.has(rel)) continue;
      const content = readFileSync(join(srcDir, rel), "utf8");
      const tags = extractRawButtonTags(content);

      for (const { tag, lineNum } of tags) {
        if (!tag.includes("rounded-full")) continue;
        if (!ICON_SIZE_RE.test(tag)) continue;

        violations.push(`${rel}:${lineNum} raw icon button (use <IconButton />)`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Raw icon buttons found outside primitives:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("IconButton.zen requires ariaLabel via props", () => {
    const iconButtonPath = join(srcDir, "components", "ui", "IconButton.zen");
    const content = readFileSync(iconButtonPath, "utf8");
    // Canonical pattern: ariaLabel is declared in interface Props and wired to aria-label.
    expect(content).toContain("ariaLabel");
    expect(
      content.includes("aria-label={ariaLabel}") || content.includes("aria-label={props.ariaLabel}")
    ).toBe(true);
  });

  test("all <IconButton> usages in source include ariaLabel attribute", () => {
    const violations: string[] = [];

    for (const rel of walkZenFiles(srcDir)) {
      if (ALLOWLISTED_FILES.has(rel)) continue;
      const content = readFileSync(join(srcDir, rel), "utf8");
      const iconBtnRe = /<IconButton\b[^>]*>/g;
      let match: RegExpExecArray | null;
      while ((match = iconBtnRe.exec(content)) !== null) {
        if (!match[0].includes("ariaLabel")) {
          const lineNum = content.slice(0, match.index).split("\n").length;
          violations.push(`${rel}:${lineNum} <IconButton> missing ariaLabel`);
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `IconButton usages without ariaLabel:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("Button.zen and IconButton.zen exist", () => {
    const btnPath = join(srcDir, "components", "ui", "Button.zen");
    const iconPath = join(srcDir, "components", "ui", "IconButton.zen");
    expect(() => readFileSync(btnPath, "utf8")).not.toThrow();
    expect(() => readFileSync(iconPath, "utf8")).not.toThrow();
  });

  test("Button.zen and IconButton.zen use single-element conditional rendering (no hidden dual DOM)", () => {
    for (const file of ["Button.zen", "IconButton.zen"]) {
      const content = readFileSync(join(srcDir, "components", "ui", file), "utf8");
      expect(content.includes("{props.href") || content.includes("{href")).toBe(true);
      expect(content).toContain("? (");
      expect(content).toContain(": (");
      expect(content).not.toContain("hidden={props.href");
      expect(content).not.toContain("hidden={props.href ?");
    }
  });

  test("Button.zen and IconButton.zen forward click handlers via on:click={onClick}", () => {
    for (const file of ["Button.zen", "IconButton.zen"]) {
      const content = readFileSync(join(srcDir, "components", "ui", file), "utf8");
      expect(content).toContain("onClick?: (event: MouseEvent) => void;");
      expect(
        content.includes("on:click={onClick}") ||
        content.includes("on:click={props.onClick}") ||
        content.includes("on:click={props.onClick ||")
      ).toBe(true);
    }
  });

  test("no new animation keywords introduced in Button/IconButton", () => {
    const forbidden = ["gsap", "translate-x", "translate-y", "scale", "rotate", "animate-"];
    for (const file of ["Button.zen", "IconButton.zen"]) {
      const content = readFileSync(join(srcDir, "components", "ui", file), "utf8");
      for (const keyword of forbidden) {
        expect(content).not.toContain(keyword);
      }
    }
  });

  test("blog/docs index chip rows use Button primitive", () => {
    const blogIndex = readFileSync(join(srcDir, "pages", "blog", "index.zen"), "utf8");
    const docsIndex = readFileSync(join(srcDir, "pages", "docs", "index.zen"), "utf8");

    const blogButtonCount = (blogIndex.match(/<Button\b/g) || []).length;
    const docsButtonCount = (docsIndex.match(/<Button\b/g) || []).length;

    expect(blogButtonCount).toBeGreaterThanOrEqual(3);
    expect(docsButtonCount).toBeGreaterThanOrEqual(1);
  });

  test("ThemeToggle and CTASection use button primitives", () => {
    const themeToggle = readFileSync(join(srcDir, "components", "ui", "ThemeToggle.zen"), "utf8");
    const ctaSection = readFileSync(join(srcDir, "components", "globals", "CTASection.zen"), "utf8");

    expect(themeToggle).toContain("<Button");
    expect(themeToggle).not.toContain("<button");
    expect(ctaSection).toContain("<Button");
  });

  test("blog/docs index contains no raw rounded pill chip anchors/buttons", () => {
    const targets = [
      join(srcDir, "pages", "blog", "index.zen"),
      join(srcDir, "pages", "docs", "index.zen"),
    ];
    const violations: string[] = [];

    for (const target of targets) {
      const content = readFileSync(target, "utf8");
      const tags = extractRawButtonTags(content);
      for (const { tag, lineNum } of tags) {
        if (!tag.includes("rounded-full")) continue;
        violations.push(`${target}:${lineNum} ${tag}`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Raw rounded chip tags found in docs/blog indexes:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });
});

function extractScriptContent(source: string): string {
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(source)) !== null) {
    if (/\bserver\b/.test(m[0].slice(0, m[0].indexOf(">")))) continue;
    blocks.push(m[1]);
  }
  return blocks.join("\n");
}

function isInsideStringLiteral(content: string, position: number): boolean {
  const before = content.slice(0, position);
  const backtickCount = (before.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) return true;
  const lastNewline = before.lastIndexOf("\n");
  const line = before.slice(lastNewline + 1);
  const singleQuotes = (line.match(/'/g) || []).length;
  const doubleQuotes = (line.match(/"/g) || []).length;
  return singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0;
}

describe("Canonical props/TS enforcement", () => {
  test("no fake prop DSL (prop foo = ...) in any .zen file", () => {
    const violations: string[] = [];
    const propDslRe = /\bprop\s+\w+\s*=/g;

    for (const rel of walkZenFiles(srcDir)) {
      const content = readFileSync(join(srcDir, rel), "utf8");
      const script = extractScriptContent(content);
      let m: RegExpExecArray | null;
      while ((m = propDslRe.exec(script)) !== null) {
        const lineNum = script.slice(0, m.index).split("\n").length;
        violations.push(`${rel}:${lineNum} "${m[0]}"`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Fake prop DSL found:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("no export let (Svelte props pattern) in any .zen file", () => {
    const violations: string[] = [];
    const exportLetRe = /\bexport\s+let\b/g;

    for (const rel of walkZenFiles(srcDir)) {
      const content = readFileSync(join(srcDir, rel), "utf8");
      const script = extractScriptContent(content);
      let m: RegExpExecArray | null;
      while ((m = exportLetRe.exec(script)) !== null) {
        const lineNum = script.slice(0, m.index).split("\n").length;
        violations.push(`${rel}:${lineNum} "${m[0]}"`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Svelte-style export let found:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("no forbidden event syntax (onclick=, @click=, onClick=) in .zen templates", () => {
    const violations: string[] = [];
    const forbiddenRe = /\bonclick\s*=\s*"|@click\s*=|onClick\s*=/g;

    for (const rel of walkZenFiles(srcDir)) {
      const content = readFileSync(join(srcDir, rel), "utf8");
      let m: RegExpExecArray | null;
      while ((m = forbiddenRe.exec(content)) !== null) {
        if (isInsideStringLiteral(content, m.index)) continue;
        if (isInsideScriptOrStyle(content, m.index)) continue;

        // Allow canonical component prop passthrough on Button/IconButton.
        if (m[0].startsWith("onClick")) {
          const openTagStart = content.lastIndexOf("<", m.index);
          const openTagEndRaw = content.indexOf(">", m.index);
          const openTagEnd = openTagEndRaw === -1 ? content.length : openTagEndRaw + 1;
          const tagSnippet = openTagStart >= 0 ? content.slice(openTagStart, openTagEnd) : "";
          if (tagSnippet.startsWith("<Button") || tagSnippet.startsWith("<IconButton")) {
            continue;
          }
        }

        const lineNum = content.slice(0, m.index).split("\n").length;
        violations.push(`${rel}:${lineNum} "${m[0].trim()}"`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Forbidden event syntax found:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });

  test("no prop onclick / prop onClick in any .zen file", () => {
    const violations: string[] = [];
    const propClickRe = /\bprop\s+onclick\b|\bprop\s+onClick\b/g;

    for (const rel of walkZenFiles(srcDir)) {
      const content = readFileSync(join(srcDir, rel), "utf8");
      let m: RegExpExecArray | null;
      while ((m = propClickRe.exec(content)) !== null) {
        const lineNum = content.slice(0, m.index).split("\n").length;
        violations.push(`${rel}:${lineNum} "${m[0]}"`);
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `prop onclick found:\n${violations.join("\n")}`
        : undefined
    ).toEqual([]);
  });
});
