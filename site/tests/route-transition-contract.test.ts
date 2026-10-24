import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyRoute,
  getRouteIdentity,
  shouldUseBrandedTransition,
} from "../src/components/route-transition/routeTransitionPolicy";
import { transitionTiming, labelHoldFor, labelTierFor } from "../src/components/transition/transitionTiming";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const transitionSource = readSource("src/components/route-transition/RouteTransition.zen");
const layoutSource = readSource("src/layouts/DefaultLayout.zen");
const pageExitSource = readSource("src/components/route-transition/pageExitMotion.ts");
const transitionIdentitySource = readSource("src/components/transition/TransitionIdentity.zen");

describe("route transition policy", () => {
  test("classifies the public route groups from one policy", () => {
    expect(classifyRoute("/")).toBe("home");
    expect(classifyRoute("/about")).toBe("marketing");
    expect(classifyRoute("/blog")).toBe("blog-index");
    expect(classifyRoute("/blog/building-zenith-0-8")).toBe("blog-article");
    expect(classifyRoute("/docs")).toBe("docs-index");
    expect(classifyRoute("/docs/getting-started")).toBe("docs-article");
    expect(classifyRoute("/missing")).toBe("unknown");
    expect(getRouteIdentity("/docs").label).toBe("Documentation");
  });

  test("uses branded transitions for marketing and blog relationships", () => {
    expect(shouldUseBrandedTransition("/", "/blog")).toBe(true);
    expect(shouldUseBrandedTransition("/blog", "/blog/building-zenith-0-8")).toBe(true);
    expect(shouldUseBrandedTransition("/blog/building-zenith-0-8", "/blog")).toBe(true);
    expect(shouldUseBrandedTransition("/blog/one", "/blog/two")).toBe(true);
    expect(shouldUseBrandedTransition("/about", "/docs")).toBe(true);
  });

  test("keeps docs hierarchy, hashes, external URLs, and unknown routes immediate", () => {
    expect(shouldUseBrandedTransition("/docs", "/docs/getting-started")).toBe(false);
    expect(shouldUseBrandedTransition("/docs/getting-started", "/docs/reactivity/state")).toBe(false);
    expect(shouldUseBrandedTransition("/docs/getting-started", "/docs")).toBe(false);
    expect(shouldUseBrandedTransition("/about", "/about#principles")).toBe(false);
    expect(shouldUseBrandedTransition("/", "https://example.com/blog")).toBe(false);
    expect(shouldUseBrandedTransition("/", "/missing")).toBe(false);
  });
});

describe("route transition lifecycle", () => {
  test("uses the Zenith lifecycle instead of click interception", () => {
    expect(layoutSource.includes("<RouteTransition")).toBe(true);
    expect(transitionSource.includes('from "@zenithbuild/router"')).toBe(true);
    expect(transitionSource.includes('on("navigation:before-leave"')).toBe(true);
    expect(transitionSource.includes('on("navigation:before-enter"')).toBe(true);
    expect(transitionSource.includes('on("navigation:abort"')).toBe(true);
    expect(transitionSource.includes('on("navigation:error"')).toBe(true);
    expect(transitionSource.includes("on:click")).toBe(false);
    expect(transitionSource.includes("history.pushState")).toBe(false);
    expect(transitionSource.includes("history.replaceState")).toBe(false);
  });

  test("uses SplitText, cleanup, and reduced motion without Flip", () => {
    expect(transitionSource.includes('from "gsap/SplitText"')).toBe(true);
    expect(transitionSource.includes("SplitText.create")).toBe(true);
    expect(transitionSource.includes("split.revert()")).toBe(true);
    expect(transitionSource.includes("split.kill()")).toBe(true);
    expect(transitionSource.includes("prefers-reduced-motion: reduce")).toBe(true);
    // Shared composition data attributes are in TransitionIdentity
    expect(transitionIdentitySource.includes("data-transition-ring")).toBe(true);
    expect(transitionIdentitySource.includes("data-transition-glow")).toBe(true);
    expect(transitionIdentitySource.includes("data-transition-label")).toBe(true);
    // Route transition has its own mark in the slot
    expect(transitionSource.includes("data-route-transition-mark")).toBe(true);
    // Flip must NOT be imported or used in the route transition
    expect(transitionSource.includes('from "gsap/Flip"')).toBe(false);
    expect(transitionSource.includes("Flip.getState")).toBe(false);
    expect(transitionSource.includes("Flip.from")).toBe(false);
    expect(transitionSource.includes("Flip.to")).toBe(false);
    expect(transitionSource.includes("Flip.fit")).toBe(false);
    expect(transitionSource.includes("Flip.killFlipsOf")).toBe(false);
    expect(transitionSource.includes("zen-allow:dom-query")).toBe(true);
    expect(transitionSource.includes("addEventListener")).toBe(false);
  });

  test("keeps the transition layer stable across route swaps without logo cloning", () => {
    expect(transitionSource.includes("__zenithRouteTransitionLayer")).toBe(true);
    expect(transitionSource.includes("documentElement.appendChild(localOverlay)")).toBe(true);
    expect(transitionSource.includes("data-route-transition-logo-clone")).toBe(false);
    expect(transitionSource.includes("navigationLogo")).toBe(false);
    expect(transitionSource.includes("__zenithNavigationLogoTarget")).toBe(false);
    expect(transitionSource.includes("pageShell.focus({ preventScroll: true })")).toBe(true);
  });

  test("prevents page bleed with fully opaque overlay and hidden page shell", () => {
    expect(transitionSource.includes('bg-background/95')).toBe(false);
    expect(transitionSource.includes('bg-background/90')).toBe(false);
    expect(transitionSource.includes('class="absolute inset-0 bg-background"')).toBe(true);
    expect(transitionSource.includes("autoAlpha: 0.38")).toBe(false);
    expect(transitionSource.includes("autoAlpha: 0.28")).toBe(false);
  });

  test("gates page reveal on artwork exit completion", () => {
    const ringsExitIdx = transitionSource.indexOf(".to(layerRings, { autoAlpha: 0, scale: 1.15");
    const pageRevealIdx = transitionSource.indexOf(".to(pageShell, { autoAlpha: 1, scale: 1");
    expect(ringsExitIdx).toBeGreaterThan(-1);
    expect(pageRevealIdx).toBeGreaterThan(-1);
    expect(pageRevealIdx).toBeGreaterThan(ringsExitIdx);
    const glowExitIdx = transitionSource.indexOf(".to(layerGlow, { autoAlpha: 0, scale: 1.1");
    expect(glowExitIdx).toBeGreaterThan(-1);
    expect(pageRevealIdx).toBeGreaterThan(glowExitIdx);
  });

  test("uses scrollbar compensation during transitions", () => {
    expect(transitionSource.includes("lockTransitionScroll")).toBe(true);
    expect(transitionSource.includes("unlockTransitionScroll")).toBe(true);
  });

  test("uses labeled GSAP timeline phases for sequencing", () => {
    expect(transitionSource.includes(".addLabel(")).toBe(true);
    expect(transitionSource.includes('"exitCurrentPage"')).toBe(true);
    expect(transitionSource.includes('"coverViewport"')).toBe(true);
    expect(transitionSource.includes('"artworkEnter"')).toBe(true);
    expect(transitionSource.includes('"labelEnter"')).toBe(true);
    expect(transitionSource.includes('"labelHold"')).toBe(true);
    expect(transitionSource.includes('"labelExit"')).toBe(true);
    expect(transitionSource.includes('"artworkExit"')).toBe(true);
    expect(transitionSource.includes('"overlayReveal"')).toBe(true);
    expect(transitionSource.includes('"destinationEnter"')).toBe(true);
  });

  test("overlay masks away via clipPath, not simple fade", () => {
    expect(transitionSource.includes("clipPath")).toBe(true);
    expect(transitionSource.includes("inset(0% 0% 0% 0%)")).toBe(true);
    expect(transitionSource.includes("inset(100% 0% 0% 0%)")).toBe(true);
  });
});

describe("page exit motion contract", () => {
  test("provides a shared page-exit helper that reverses entrance language", () => {
    expect(pageExitSource.includes("animatePageExit")).toBe(true);
    expect(pageExitSource.includes("clearPageExitStyles")).toBe(true);
    expect(pageExitSource.includes("identifyPageExitTargets")).toBe(true);
    expect(pageExitSource.includes("power3.in")).toBe(true);
    expect(pageExitSource.includes("y: 18")).toBe(true);
    expect(pageExitSource.includes("scale: 0.985")).toBe(true);
  });

  test("page exit targets route-level elements, not every section", () => {
    expect(pageExitSource.includes("data-page-header")).toBe(true);
    expect(pageExitSource.includes("data-motion-page-header")).toBe(true);
    expect(pageExitSource.includes("data-home-hero")).toBe(true);
    expect(pageExitSource.includes("data-motion-section")).toBe(true);
    expect(pageExitSource.includes("slice(0, 3)")).toBe(true);
  });

  test("page exit supports reduced motion", () => {
    expect(pageExitSource.includes("reducedMotion")).toBe(true);
    expect(pageExitSource.includes("autoAlpha: 0")).toBe(true);
  });

  test("route transition inlines page exit contract", () => {
    expect(transitionSource.includes("animatePageExit")).toBe(true);
    expect(transitionSource.includes("clearPageExitStyles")).toBe(true);
    expect(transitionSource.includes("identifyPageExitTargets")).toBe(true);
    expect(transitionSource.includes("power3.in")).toBe(true);
  });
});

describe("navigation stability", () => {
  test("nav root does not receive transition transforms", () => {
    expect(transitionSource.includes("navigationLogo")).toBe(false);
    expect(transitionSource.includes("Flip.getState(navigationLogo")).toBe(false);
    expect(transitionSource.includes("Flip.fit(transitionLogo, navigationLogo")).toBe(false);
    expect(transitionSource.includes("gsap.set(navigationLogo")).toBe(false);
    expect(transitionSource.includes("navigationLogoTargetRef")).toBe(false);
  });

  test("navigationLogoTargetRef is not passed to RouteTransition", () => {
    const routeTransitionUsage = layoutSource.substring(
      layoutSource.indexOf("<RouteTransition"),
      layoutSource.indexOf("/>", layoutSource.indexOf("<RouteTransition")) + 2,
    );
    expect(routeTransitionUsage.includes("navigationLogoTargetRef")).toBe(false);
  });
});

describe("shared composition and timing", () => {
  test("route transition uses TransitionIdentity for the artwork and label", () => {
    expect(transitionSource.includes('from "@/components/transition/TransitionIdentity.zen"')).toBe(true);
    expect(transitionSource.includes("<TransitionIdentity")).toBe(true);
    expect(transitionSource.includes("<TransitionIdentity>")).toBe(true);
  });

  test("route transition uses shared timing constants", () => {
    expect(transitionSource.includes('transitionTiming')).toBe(true);
    expect(transitionSource.includes("transitionTiming.")).toBe(true);
    expect(transitionSource.includes("labelHoldFor")).toBe(true);
  });

  test("timing tiers classify labels correctly", () => {
    expect(labelTierFor("Blog")).toBe("short");
    expect(labelTierFor("About")).toBe("short");
    expect(labelTierFor("Documentation")).toBe("medium");
    expect(labelTierFor("Getting Started")).toBe("medium");
    expect(labelTierFor("Building Zenith 0.8")).toBe("long");
  });

  test("timing tier hold durations increase with label length", () => {
    const shortHold = labelHoldFor("Blog");
    const mediumHold = labelHoldFor("Documentation");
    const longHold = labelHoldFor("Building Zenith 0.8");
    expect(shortHold).toBeLessThan(mediumHold);
    expect(mediumHold).toBeLessThan(longHold);
  });

  test("label entrance and exit are at least 0.7s for readability", () => {
    expect(transitionTiming.labelEntrance).toBeGreaterThanOrEqual(0.7);
    expect(transitionTiming.labelExit).toBeGreaterThanOrEqual(0.7);
  });

  test("label hold is at least 1.0s for readability", () => {
    expect(transitionTiming.labelHoldShort).toBeGreaterThanOrEqual(1.0);
    expect(transitionTiming.labelHoldMedium).toBeGreaterThanOrEqual(1.0);
    expect(transitionTiming.labelHoldLong).toBeGreaterThanOrEqual(1.0);
  });
});
