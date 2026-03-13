import { describe, expect, test } from "bun:test";

import {
  TRANSITION_PROTOTYPE_HOOKS,
  isPrototypeRoute,
  isPrototypeTransitionNavigation,
  normalizePrototypePath,
  readPrototypePath,
  resolvePrototypeRoutes,
} from "../src/components/globals/route-transition/transitionPrototype";

describe("route transition prototype helpers", () => {
  test("normalizes prototype paths deterministically", () => {
    expect(normalizePrototypePath("/")).toBe("/");
    expect(normalizePrototypePath("/about/")).toBe("/about");
    expect(normalizePrototypePath("/about///")).toBe("/about");
    expect(normalizePrototypePath("")).toBe("");
  });

  test("resolves unique normalized prototype routes", () => {
    expect(
      resolvePrototypeRoutes({
        routes: ["/", "/about/", "/about", "/blog/", "/blog", "/docs/", "/docs"],
      }),
    ).toEqual(["/", "/about", "/blog", "/docs"]);
  });

  test("reads pathname from route-like values", () => {
    expect(readPrototypePath(new URL("https://example.com/about/"))).toBe("/about");
    expect(readPrototypePath({ pathname: "/docs/" })).toBe("/docs");
    expect(readPrototypePath(null)).toBe("");
  });

  test("only treats whitelisted cross-route moves as prototype transitions", () => {
    const routes = ["/", "/about", "/blog", "/docs"];

    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/"),
          to: new URL("https://example.com/about"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/about"),
          to: new URL("https://example.com/about#team"),
        },
        routes,
      ),
    ).toBe(false);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/about"),
          to: new URL("https://example.com/blog"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/"),
          to: new URL("https://example.com/blog"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/"),
          to: new URL("https://example.com/docs"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/about"),
          to: new URL("https://example.com/docs"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/about?tab=alpha"),
          to: new URL("https://example.com/about?tab=beta"),
        },
        routes,
      ),
    ).toBe(false);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/"),
          to: new URL("https://example.com/about#contributors"),
        },
        routes,
      ),
    ).toBe(true);
    expect(
      isPrototypeTransitionNavigation(
        {
          from: new URL("https://example.com/blog"),
          to: new URL("https://example.com/docs#installation"),
        },
        routes,
      ),
    ).toBe(false);
    expect(isPrototypeRoute("/about", routes)).toBe(true);
    expect(isPrototypeRoute("/blog", routes)).toBe(true);
    expect(isPrototypeRoute("/docs", routes)).toBe(true);
  });

  test("keeps the hook list aligned with the phase 3 prototype contract", () => {
    expect(TRANSITION_PROTOTYPE_HOOKS).toEqual([
      "navigation:request",
      "navigation:before-leave",
      "navigation:before-swap",
      "navigation:content-swapped",
      "navigation:before-enter",
      "navigation:enter-complete",
      "navigation:abort",
      "navigation:error",
    ]);
  });
});
