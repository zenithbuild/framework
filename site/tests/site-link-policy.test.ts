import { describe, expect, test } from "bun:test";

import {
  PROVEN_SOFT_NAV_ROUTE_ENTRIES,
  classifySiteHref,
  isExternalHref,
  isHashHref,
  isProvenSoftNavRouteEntry,
  mergeLinkRel,
  normalizeRouteEntryHref,
} from "../src/components/ui/siteLinkPolicy";

describe("site link policy", () => {
  test("keeps the proven soft-nav route-entry set explicit", () => {
    expect(PROVEN_SOFT_NAV_ROUTE_ENTRIES).toEqual([
      "/",
      "/about",
      "/blog",
      "/blog/building-zenith-0-8",
      "/docs",
      "/docs/getting-started",
    ]);
  });

  test("normalizes route-entry hrefs deterministically", () => {
    expect(normalizeRouteEntryHref("/")).toBe("/");
    expect(normalizeRouteEntryHref("/about/")).toBe("/about");
    expect(normalizeRouteEntryHref("/about/?tab=api")).toBe("/about");
    expect(normalizeRouteEntryHref("/about#routing")).toBe("/about");
  });

  test("classifies external href families as plain-anchor surfaces", () => {
    expect(isExternalHref("https://zenithbuild.dev")).toBe(true);
    expect(isExternalHref("http://localhost:3000")).toBe(true);
    expect(isExternalHref("//cdn.example.com/app.js")).toBe(true);
    expect(isExternalHref("mailto:hi@zenithbuild.dev")).toBe(true);
    expect(isExternalHref("tel:+13125551212")).toBe(true);
    expect(classifySiteHref("https://zenithbuild.dev")).toBe("external");
    expect(classifySiteHref("mailto:hi@zenithbuild.dev")).toBe("external");
  });

  test("keeps same-page and deep-hash links out of soft-nav", () => {
    expect(isHashHref("#routing")).toBe(true);
    expect(isHashHref("/about#routing")).toBe(true);
    expect(classifySiteHref("#routing")).toBe("hash");
    expect(classifySiteHref("/about#routing")).toBe("hash");
  });

  test("only classifies the proven route-entry set as soft-nav eligible", () => {
    expect(isProvenSoftNavRouteEntry("/")).toBe(true);
    expect(isProvenSoftNavRouteEntry("/about")).toBe(true);
    expect(isProvenSoftNavRouteEntry("/blog")).toBe(true);
    expect(isProvenSoftNavRouteEntry("/changelog")).toBe(false);
    expect(isProvenSoftNavRouteEntry("/docs")).toBe(true);
    expect(isProvenSoftNavRouteEntry("/docs/getting-started")).toBe(true);
    expect(isProvenSoftNavRouteEntry("/about#routing")).toBe(false);
    expect(isProvenSoftNavRouteEntry("/about?tab=api")).toBe(false);
    expect(isProvenSoftNavRouteEntry("/pricing")).toBe(false);
    expect(classifySiteHref("/about")).toBe("proven-route-entry");
    expect(classifySiteHref("/docs")).toBe("proven-route-entry");
    expect(classifySiteHref("/pricing")).toBe("internal-fallback");
  });

  test("merges blank-target rel values safely", () => {
    expect(mergeLinkRel("_blank", "")).toBe("noopener noreferrer");
    expect(mergeLinkRel("_blank", "nofollow")).toBe("nofollow noopener noreferrer");
    expect(mergeLinkRel("", "noopener")).toBe("noopener");
  });
});
