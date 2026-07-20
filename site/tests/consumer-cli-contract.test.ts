import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SitePackage {
  scripts?: Record<string, string>;
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

  test("Tina delegates to the same consumer development script", () => {
    expect(sitePackage.scripts?.["cms:dev"]).toBe(
      'tinacms dev --noTelemetry -c "bun run dev"',
    );
  });
});
