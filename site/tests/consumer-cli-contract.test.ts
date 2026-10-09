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
    const dev = sitePackage.scripts?.dev;
    expect(dev === "zenith dev" || /^tinacms dev --noTelemetry -c "zenith dev\s*"$/.test(dev)).toBe(true);
    expect(sitePackage.scripts?.build).toBe("zenith build");
    expect(sitePackage.scripts?.preview).toBe("zenith preview");

    const scripts = Object.values(sitePackage.scripts || {}).join("\n");
    expect(scripts).not.toContain("zenith-workspace.mjs");
    expect(scripts).not.toContain("ZENITH_BUNDLER_BIN");
    expect(scripts).not.toContain("ZENITH_PREFER_WORKSPACE_PACKAGES");
  });

  test("Tina delegates to the installed consumer development command", () => {
    const command = sitePackage.scripts?.["cms:dev"] || sitePackage.scripts?.dev;
    const delegated = command?.match(/-c "([^"]+)"$/)?.[1].trim();
    if (delegated === "bun run dev") {
      expect(sitePackage.scripts?.dev).toBe("zenith dev");
    } else {
      expect(delegated).toBe("zenith dev");
    }
  });
});
