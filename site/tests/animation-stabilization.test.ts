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
const artworkSource = readSource("src/components/transition/transitionArtwork.ts");
const navigationSource = readSource("src/components/ui/Navigation.zen");
const globalsSource = readSource("src/styles/globals.css");
const scrollbarSource = readSource("src/components/route-transition/scrollbarCompensation.ts");

describe("navigation geometry stability", () => {
  test("nav container has fixed height and max width", () => {
    // v1 nav (handoff §4): 64px mobile / 72px (+1px border) desktop, fluid to the 1440 container.
    expect(navigationSource.includes("h-16")).toBe(true);
    expect(navigationSource.includes("md:h-[72px]")).toBe(true);
    expect(navigationSource.includes("max-w-[1440px]")).toBe(true);
  });

  test("logo slot has fixed dimensions and does not shrink", () => {
    expect(navigationSource.includes("h-10 w-10 shrink-0")).toBe(true);
  });

  test("link group and actions group have fixed gap spacing", () => {
    expect(navigationSource.includes("lg:gap-7")).toBe(true);
    expect(navigationSource.includes("lg:gap-[10px]")).toBe(true);
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

describe("shared transition artwork exit", () => {
  test("both overlays animate the same three rings and the mark", () => {
    for (const ring of ["outer", "middle", "inner"]) {
      expect(artworkSource).toContain(`[data-transition-ring="${ring}"]`);
    }
    expect(introSource).toContain("exitArtwork(timeline, art)");
    expect(transitionSource).toContain("exitArtwork(timeline, layer)");
    expect(artworkSource).toContain("stagger: transitionTiming.ringExitStagger");
    expect(artworkSource).toContain(".to(art.mark, { autoAlpha: 0, scale: 0.9");
  });

  test("keeps the backdrop opaque until the intro artwork finishes", () => {
    expect(introSource).toContain('setDocumentState("artworkExit")');
    expect(globalsSource).toContain('data-zenith-intro-state="artworkExit"');
    expect(introSource).toContain("onComplete: revealContent");
    expect(introSource).toContain("revealThroughOverlay(timeline, loader, backdrop)");
    expect(artworkSource).toContain('.addLabel("overlayReveal", ">")');
    expect(artworkSource).toContain('duration: transitionTiming.backdropFade }, "overlayReveal"');
  });

  test("releases the destination after the route label and artwork exit", () => {
    const words = transitionSource.indexOf(".to(split ? split.words : [], { autoAlpha: 0, yPercent: -105");
    const artwork = transitionSource.indexOf("exitArtwork(timeline, layer)");
    const reveal = transitionSource.indexOf("revealThroughOverlay(timeline, overlay, backdrop)");
    expect(words).toBeGreaterThan(-1);
    expect(artwork).toBeGreaterThan(words);
    expect(reveal).toBeGreaterThan(artwork);
  });

  test("cancels active intro tweens and releases gated elements", () => {
    expect(introSource).toContain("timeline?.kill()");
    expect(introSource).toContain("heroLineTween?.kill()");
    expect(introSource).toContain("setGateAccess(gates, false)");
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
    expect(introSource).toContain("motionPreference.matches");
    expect(introSource).toContain('zenOn(motionPreference, "change"');
  });

  test("reduced motion bypasses route transition animation", () => {
    expect(transitionSource.includes('matchMedia("(prefers-reduced-motion: reduce)")')).toBe(true);
    const reducedIdx = transitionSource.indexOf("if (reducedMotion)");
    expect(reducedIdx).toBeGreaterThan(-1);
  });

  test("no addEventListener in transition or intro, querySelector only with zen-allow annotation", () => {
    expect(transitionSource.includes("zen-allow:dom-query")).toBe(true);
    expect(transitionSource.includes("addEventListener")).toBe(false);
    expect(introSource).not.toContain("querySelector");
    expect(artworkSource).toContain("wrapper.querySelector");
    expect(introSource.includes("addEventListener")).toBe(false);
  });

  test("HMR idempotency — intro checks for duplicate timeline", () => {
    expect(introSource.includes("__zenithIntroTimelineActive")).toBe(true);
    expect(introSource).toContain("if (win.__zenithIntroTimelineActive) return;");
  });
});
