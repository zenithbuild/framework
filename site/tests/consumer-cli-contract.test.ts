import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SitePackage {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const sitePackage = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../package.json"), "utf8"),
) as SitePackage;

describe("site consumer CLI contract", () => {
  test("normal framework commands resolve through the installed Zenith CLI", () => {
    expect(sitePackage.scripts?.dev).toBe("zenith dev");
    expect(sitePackage.scripts?.build).toBe("zenith build");
    expect(sitePackage.scripts?.preview).toBe("zenith preview");

    const scripts = Object.values(sitePackage.scripts || {}).join("\n");
    expect(scripts).not.toContain("zenith-workspace.mjs");
    expect(scripts).not.toContain("ZENITH_BUNDLER_BIN");
    expect(scripts).not.toContain("ZENITH_PREFER_WORKSPACE_PACKAGES");
  });

  test("reads committed content files without a CMS layer", () => {
    const siteRoot = resolve(import.meta.dir, "..");
    const scripts = Object.entries(sitePackage.scripts || {});
    const packages = Object.keys({ ...sitePackage.dependencies, ...sitePackage.devDependencies });

    expect(scripts.filter(([name, command]) => /cms/i.test(name) || /tinacms|directus/i.test(command))).toEqual([]);
    expect(packages.filter((name) => /tina|directus/i.test(name))).toEqual([]);
    expect(existsSync(resolve(siteRoot, "tina"))).toBe(false);
    expect(existsSync(resolve(siteRoot, "src/public/admin"))).toBe(false);
    expect(existsSync(resolve(siteRoot, "src/server/directusClient.ts"))).toBe(false);
  });
});
