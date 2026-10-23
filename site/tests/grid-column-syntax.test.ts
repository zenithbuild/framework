import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Tailwind arbitrary grid tracks must be separated with underscores. A comma
// between tracks is emitted verbatim into grid-template-columns, which is
// invalid CSS, so the grid silently collapses to a single column (JUD-65).
const srcRoot = resolve(import.meta.dir, "../src");
const sourceExtensions = new Set([".zen", ".ts", ".js", ".css"]);
const gridUtility = /(?:[\w-]+:)*grid-(?:cols|rows)-\[([^\]\s"']*)\]/g;

function collectSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (relative(srcRoot, path).startsWith(join("public", "admin"))) return [];
    if (statSync(path).isDirectory()) return collectSources(path);
    const dot = name.lastIndexOf(".");
    return dot >= 0 && sourceExtensions.has(name.slice(dot)) ? [path] : [];
  });
}

function hasTopLevelComma(value: string): boolean {
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) return true;
  }
  return false;
}

describe("grid column utility syntax", () => {
  test("site source has no comma-separated arbitrary grid tracks", () => {
    const offenders: string[] = [];
    for (const file of collectSources(srcRoot)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(gridUtility)) {
        if (hasTopLevelComma(match[1])) offenders.push(`${relative(srcRoot, file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("restored layouts keep their multi-column tracks", () => {
    const read = (path: string) => readFileSync(resolve(srcRoot, path), "utf8");
    expect(read("components/BlogArticle.zen")).toContain("lg:grid-cols-[minmax(0,48rem)_15rem]");
    expect(read("components/FeatureShowcase.zen")).toContain("md:grid-cols-[8rem_minmax(0,1fr)]");
    const about = read("pages/about/index.zen");
    expect(about).toContain("sm:grid-cols-[3rem_1fr]");
    expect(about).toContain("lg:grid-cols-[1fr_1.35fr]");
    expect(about).toContain("sm:grid-cols-[8rem_1fr]");
  });
});
