import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const introSource = readSource("src/components/IntroLoader.zen");
const transitionSource = readSource("src/components/route-transition/RouteTransition.zen");
const navigationSource = readSource("src/components/ui/Navigation.zen");
const globalsSource = readSource("src/styles/globals.css");
const scrollbarSource = readSource("src/components/route-transition/scrollbarCompensation.ts");

describe("navigation geometry stability", () => {
  test("nav container has fixed height and max width", () => {
    expect(navigationSource.includes("h-16")).toBe(true);
    expect(navigationSource.includes("max-w-7xl")).toBe(true);
  });

  test("logo slot has fixed dimensions and does not shrink", () => {
    expect(navigationSource.includes("h-10 w-10 shrink-0")).toBe(true);
  });

  test("link group and actions group have fixed gap spacing", () => {
    expect(navigationSource.includes("gap-7")).toBe(true);
    expect(navigationSource.includes("gap-3")).toBe(true);
    expect(navigationSource.includes("gap-4")).toBe(true);
  });

  test("active-link styling does not change layout dimensions", () => {
    expect(navigationSource.includes("border-b")).toBe(true);
    expect(navigationSource.includes("border-primary")).toBe(true);
    expect(navigationSource.includes("border-transparent")).toBe(true);
    expect(navigationSource.includes("font-bold")).toBe(false);
    expect(navigationSource.includes("border-primary text-foreground")).toBe(true);
    expect(navigationSource.includes("border-transparent text-muted-foreground")).toBe(true);
  });

  test("theme toggle and mobile menu trigger have fixed dimensions", () => {
    expect(navigationSource.includes("h-10 w-10")).toBe(true);
  });

  test("nav root and inner elements are never transformed by route transition", () => {
    expect(transitionSource.includes("logoStage.appendChild(navigationLogo)")).toBe(false);
    expect(transitionSource.includes("Flip")).toBe(false);
    expect(transitionSource.includes("navigationLogo")).toBe(false);
    expect(transitionSource.includes("navigationLogoTargetRef")).toBe(false);
  });

  test("no nav logo hiding or restoring in route transition", () => {
    expect(transitionSource.includes('gsap.set(navigationLogo, { autoAlpha: 0 })')).toBe(false);
    expect(transitionSource.includes('gsap.set(navigationLogo, { autoAlpha: 1 })')).toBe(false);
    expect(transitionSource.includes('navigationLogo.style.display')).toBe(false);
    expect(transitionSource.includes('data-route-transition-logo-owner')).toBe(false);
  });
});

describe("overlay isolation", () => {
  test("transition overlay uses position fixed and covers full viewport", () => {
    expect(transitionSource.includes("fixed inset-0")).toBe(true);
  });

  test("transition overlay z-index is above nav", () => {
    expect(transitionSource.includes("z-[90]")).toBe(true);
    expect(navigationSource.includes("z-50")).toBe(true);
  });

  test("route transition backdrop is fully opaque", () => {
    expect(transitionSource.includes('bg-background/95')).toBe(false);
    expect(transitionSource.includes('bg-background/90')).toBe(false);
    expect(transitionSource.includes('bg-background/80')).toBe(false);
    expect(transitionSource.includes('class="absolute inset-0 bg-background"')).toBe(true);
  });

  test("intro backdrop is fully opaque", () => {
    expect(introSource.includes('class="absolute inset-0 bg-background"')).toBe(true);
  });

  test("page shell is fully hidden during transitions, not partially visible", () => {
    expect(transitionSource.includes("autoAlpha: 0.38")).toBe(false);
    expect(transitionSource.includes("autoAlpha: 0.28")).toBe(false);
    expect(transitionSource.includes("autoAlpha: 0.5")).toBe(false);
  });

  test("page shell is marked inert during transitions", () => {
    expect(transitionSource.includes('pageShell.setAttribute("inert"')).toBe(true);
    expect(transitionSource.includes('pageShell.setAttribute("aria-hidden"')).toBe(true);
  });

  test("z-index scale is defined in CSS", () => {
    expect(globalsSource.includes("--zenith-z-nav: 50")).toBe(true);
    expect(globalsSource.includes("--zenith-z-intro: 80")).toBe(true);
    expect(globalsSource.includes("--zenith-z-route-transition: 90")).toBe(true);
  });
});

describe("intro SVG exit animation", () => {
  test("decorative ring elements are queried from shared composition", () => {
    expect(introSource.includes("decorRingOuter")).toBe(true);
    expect(introSource.includes("decorRingMid")).toBe(true);
    expect(introSource.includes("decorRingInner")).toBe(true);
  });

  test("svgExit phase is defined in the intro state machine", () => {
    expect(introSource.includes('"svgExit"')).toBe(true);
    expect(introSource.includes("animateSvgExit")).toBe(true);
    expect(introSource.includes("svgExitTimeline")).toBe(true);
  });

  test("svgExit phase is recognized in CSS", () => {
    expect(globalsSource.includes('data-zenith-intro-state="svgExit"')).toBe(true);
  });

  test("page reveal is gated on SVG exit completion", () => {
    const svgExitIdx = introSource.indexOf("function animateSvgExit");
    const revealContentInExit = introSource.indexOf("onComplete: revealContent", svgExitIdx);
    expect(revealContentInExit).toBeGreaterThan(-1);
    const settleLogoIdx = introSource.indexOf("function settleLogo");
    const svgExitCall = introSource.indexOf("animateSvgExit()", settleLogoIdx);
    expect(svgExitCall).toBeGreaterThan(-1);
  });

  test("decorative rings animate out with coordinated sequence, not simultaneous fade", () => {
    const svgExitIdx = introSource.indexOf("function animateSvgExit");
    const exitSection = introSource.substring(svgExitIdx, svgExitIdx + 600);
    expect(exitSection.includes("scale: 1.1")).toBe(true);
    expect(exitSection.includes("scale: 0.5")).toBe(true);
    expect(exitSection.includes("scale: 0.25")).toBe(true);
    expect(exitSection.includes("0.04")).toBe(true);
    expect(exitSection.includes("0.08")).toBe(true);
  });

  test("SVG exit timeline is killed on cleanup", () => {
    expect(introSource.includes("svgExitTimeline.kill()")).toBe(true);
    expect(introSource.includes("svgExitTimeline = null")).toBe(true);
  });
});

describe("route transition artwork exit", () => {
  test("entering phase has artwork exit before page reveal", () => {
    const labelExitIdx = transitionSource.indexOf(".to(split ? split.words : [], { autoAlpha: 0, yPercent: -105");
    const pageRevealIdx = transitionSource.indexOf(".to(pageShell, { autoAlpha: 1, scale: 1");
    expect(labelExitIdx).toBeGreaterThan(-1);
    expect(pageRevealIdx).toBeGreaterThan(labelExitIdx);

    const ringsExitIdx = transitionSource.indexOf(".to(layerRings, { autoAlpha: 0, scale: 1.15");
    expect(ringsExitIdx).toBeGreaterThan(-1);
    expect(pageRevealIdx).toBeGreaterThan(ringsExitIdx);
  });

  test("overlay remains opaque through artwork exit phase", () => {
    const backdropFadeIdx = transitionSource.indexOf('.to(backdrop, { autoAlpha: 0');
    expect(backdropFadeIdx).toBeGreaterThan(-1);
    const ringsExitIdx = transitionSource.indexOf('.to(layerRings, { autoAlpha: 0, scale: 1.15');
    expect(ringsExitIdx).toBeGreaterThan(-1);
    expect(backdropFadeIdx).toBeGreaterThan(ringsExitIdx);
  });

  test("transition mark fades out during artwork resolution", () => {
    expect(transitionSource.includes('.to(mark, { autoAlpha: 0')).toBe(true);
  });
});

describe("flicker prevention", () => {
  test("no duplicate logo — route transition does not manipulate nav logo", () => {
    expect(transitionSource.includes("navigationLogo")).toBe(false);
    expect(transitionSource.includes("data-route-transition-logo-clone")).toBe(false);
    expect(transitionSource.includes("Flip")).toBe(false);
  });

  test("scrollbar compensation is applied during scroll lock", () => {
    expect(scrollbarSource.includes("measureScrollbarWidth")).toBe(true);
    expect(scrollbarSource.includes("lockTransitionScroll")).toBe(true);
    expect(scrollbarSource.includes("unlockTransitionScroll")).toBe(true);
    expect(globalsSource.includes("--zenith-scrollbar-width")).toBe(true);
    expect(globalsSource.includes("padding-right: var(--zenith-scrollbar-width")).toBe(true);
  });

  test("transition-active state is managed on document element", () => {
    expect(globalsSource.includes("data-zenith-transition-active")).toBe(true);
    expect(scrollbarSource.includes('setAttribute("data-zenith-transition-active"')).toBe(true);
    expect(scrollbarSource.includes('removeAttribute("data-zenith-transition-active"')).toBe(true);
  });

  test("intro sets scrollbar compensation variable on mount", () => {
    expect(introSource.includes("--zenith-scrollbar-width")).toBe(true);
    expect(introSource.includes("scrollbarWidth")).toBe(true);
  });

  test("reduced motion bypasses elaborate SVG animation in intro", () => {
    expect(introSource.includes('matchMedia("(prefers-reduced-motion: reduce)")')).toBe(true);
    expect(introSource.includes("completeImmediately()")).toBe(true);
  });

  test("reduced motion bypasses route transition animation", () => {
    expect(transitionSource.includes('matchMedia("(prefers-reduced-motion: reduce)")')).toBe(true);
    const reducedIdx = transitionSource.indexOf("if (reducedMotion)");
    expect(reducedIdx).toBeGreaterThan(-1);
  });

  test("no addEventListener in transition or intro, querySelector only with zen-allow annotation", () => {
    expect(transitionSource.includes("zen-allow:dom-query")).toBe(true);
    expect(transitionSource.includes("addEventListener")).toBe(false);
    expect(introSource.includes("zen-allow:dom-query")).toBe(true);
    expect(introSource.includes("addEventListener")).toBe(false);
  });

  test("HMR idempotency — intro checks for duplicate timeline", () => {
    expect(introSource.includes("__zenithIntroTimelineActive")).toBe(true);
    expect(introSource.includes("duplicateTimeline")).toBe(true);
  });
});
