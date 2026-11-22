import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const introSource = readSource("src/components/IntroLoader.zen");
const artworkSource = readSource("src/components/transition/transitionArtwork.ts");
const heroSource = readSource("src/components/Hero.zen");
const motionSource = readSource("src/components/motion/MotionController.zen");
const navigationSource = readSource("src/components/ui/Navigation.zen");
const navigationMarkSource = readSource("src/components/ZenithNavigationMark.zen");
const transitionIdentitySource = readSource("src/components/transition/TransitionIdentity.zen");
const transitionTimingSource = readSource("src/components/transition/transitionTiming.ts");
const transitionSource = readSource("src/components/route-transition/RouteTransition.zen");

describe("Zenith animation contract", () => {
  test("keeps rotation on the masked words and scales the mark in place", () => {
    expect(introSource).toContain('mask: "words"');
    expect(introSource).toContain("rotationX: -48");
    expect(introSource).toContain("transformPerspective");
    expect(artworkSource).toContain(".to(art.mark, { autoAlpha: 0, scale: 0.9");
    expect(artworkSource).not.toContain("rotationX");
  });

  test("keeps the intro independent of navigation logo position", () => {
    expect(introSource).not.toContain('from "gsap/Flip"');
    expect(introSource).not.toContain("navigationLogo");
    expect(introSource).not.toContain("appendChild");
    expect(introSource).toContain("getTransitionIdentity(composition, mark)");
  });

  test("uses the same mark asset in the nav and both centered overlays", () => {
    expect(navigationMarkSource).toContain('data-shared-nav-mark="true"');
    for (const source of [introSource, transitionSource, navigationSource]) {
      expect(source).toContain("<ZenithNavigationMark />");
    }
  });

  test("splits only the hero title into clipped lines and reverts cleanly", () => {
    expect(introSource.includes('from "gsap/SplitText"')).toBe(true);
    expect(heroSource.includes('data-hero-split-title="true"')).toBe(true);
    expect(introSource.includes('type: "lines"')).toBe(true);
    expect(introSource.includes('mask: "lines"')).toBe(true);
    expect(introSource.includes("autoSplit: true")).toBe(true);
    expect(introSource.includes("split.lines")).toBe(true);
    expect(introSource.includes("heroSplit?.revert()")).toBe(true);
    expect(introSource.includes("heroLineTween?.kill()")).toBe(true);
  });

  test("flips the two intro phrases in order before the artwork exits", () => {
    expect(introSource).toContain('["Prime trusted runtime", "Compile route graph"]');
    expect(introSource).toContain("if (index + 1 < phrases.length) playPhrase(index + 1)");
    expect(introSource).toContain("else playArtworkExit()");
  });

  test("keeps replay and HMR initialization idempotent", () => {
    expect(introSource.includes("sessionStorage")).toBe(true);
    expect(introSource.includes("introStorageKey")).toBe(true);
    expect(introSource.includes("__zenithIntroCommitted")).toBe(true);
    expect(introSource.includes("__zenithIntroComplete")).toBe(true);
    expect(introSource.includes("__zenithIntroTimelineActive")).toBe(true);
    expect(introSource.includes("__zenithIntroPlayed")).toBe(true);
    expect(introSource.includes("__zenithIntroStarted")).toBe(true);
    expect(introSource).toContain("timeline?.kill()");
    expect(introSource.includes('matchMedia("(prefers-reduced-motion: reduce)")')).toBe(true);
    expect(introSource).toContain("if (finished) return;");
    expect(introSource).toContain("ctx.cleanup(");
  });

  test("shares selector-free ScrollTrigger setup with scoped cleanup", () => {
    expect(motionSource.includes('from "gsap/ScrollTrigger"')).toBe(true);
    expect(motionSource.includes("gsap.registerPlugin(ScrollTrigger)")).toBe(true);
    expect(motionSource.includes("gsap.context(")).toBe(true);
    expect(motionSource.includes("scrollTrigger:")).toBe(true);
    expect(motionSource.includes("context.revert()")).toBe(true);
    expect(motionSource.includes("prefers-reduced-motion: reduce")).toBe(true);
    expect(motionSource.includes("querySelector")).toBe(false);
  });

  test("covers every approved route with restrained motion boundaries", () => {
    const routeSources = [
      "src/pages/blog/index.zen",
      "src/pages/docs/index.zen",
      "src/pages/about/index.zen",
    ].map(readSource);

    routeSources.forEach((source) => {
      expect(source.includes("MotionController")).toBe(true);
      expect(source.includes("data-motion-section")).toBe(true);
    });
  });

  test("keeps docs articles on one reader template so the router can swap only #app", () => {
    const reader = readSource("src/pages/docs/[...slug].zen");
    expect(reader).toContain("<DocumentationArticle view={data.view}");
    expect(readSource("src/pages/docs/getting-started/index.zen")).toBe("");
    const post = readSource("src/pages/blog/[slug].zen");
    expect(post).toContain("<BlogArticle post={data.post}");
    const article = readSource("src/components/DocumentationArticle.zen");
    expect(article.includes("<DocsArticleTransition")).toBe(true);
    expect(article.includes("ref={documentationArticleRegionRef} data-docs-article-region")).toBe(true);
  });
});

describe("shared transition composition", () => {
  test("TransitionIdentity owns the artwork and label structure", () => {
    expect(transitionIdentitySource.includes('data-transition-identity="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-artwork="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-ring="outer"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-ring="middle"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-ring="inner"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-glow="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-mark-ring="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-mark-core="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-label-frame="true"')).toBe(true);
    expect(transitionIdentitySource.includes('data-transition-label="true"')).toBe(true);
    expect(transitionIdentitySource.includes("<slot />")).toBe(true);
    expect(transitionIdentitySource.includes("<ZenithNavigationMark />")).toBe(false);
  });

  test("both intro and route transition use TransitionIdentity", () => {
    expect(introSource.includes('from "@/components/transition/TransitionIdentity.zen"')).toBe(true);
    expect(introSource.includes("<TransitionIdentity")).toBe(true);
    expect(transitionSource.includes('from "@/components/transition/TransitionIdentity.zen"')).toBe(true);
    expect(transitionSource.includes("<TransitionIdentity")).toBe(true);
  });

  test("both systems use shared timing constants", () => {
    expect(introSource.includes('transitionTiming')).toBe(true);
    expect(transitionSource.includes('transitionTiming')).toBe(true);
    expect(transitionTimingSource.includes("transitionTiming")).toBe(true);
    expect(transitionTimingSource.includes("labelHoldShort")).toBe(true);
    expect(transitionTimingSource.includes("labelHoldMedium")).toBe(true);
    expect(transitionTimingSource.includes("labelHoldLong")).toBe(true);
    expect(transitionTimingSource.includes("labelHoldFor")).toBe(true);
    expect(transitionTimingSource.includes("labelTierFor")).toBe(true);
  });

  test("artwork dimensions match between intro and route via shared component", () => {
    // Both use the same artwork stage with the same dimensions
    expect(transitionIdentitySource.includes("aspect-square")).toBe(true);
    expect(transitionIdentitySource.includes("w-[min(19rem,calc(100vw-3rem))]")).toBe(true);
    // Both use the same ring insets
    expect(transitionIdentitySource.includes("inset-0")).toBe(true);
    expect(transitionIdentitySource.includes("inset-12")).toBe(true);
    expect(transitionIdentitySource.includes("inset-20")).toBe(true);
    // Both use the same mark ring and core dimensions
    expect(transitionIdentitySource.includes("h-36 w-36")).toBe(true);
    expect(transitionIdentitySource.includes("h-24 w-24")).toBe(true);
    // Both use the same gap between artwork and label
    expect(transitionIdentitySource.includes("gap-8")).toBe(true);
  });

  test("label frame reserves stable height to prevent layout shift", () => {
    expect(transitionIdentitySource.includes("min-h-[3rem]")).toBe(true);
    expect(transitionIdentitySource.includes("overflow-hidden")).toBe(true);
  });

  test("uses the same responsive font and tracking for both transition labels", () => {
    expect(transitionIdentitySource).toContain("font-heading text-xl font-medium tracking-tight");
    expect(transitionIdentitySource).toContain("sm:text-2xl");
    expect(introSource).not.toContain("label.className");
    expect(transitionSource).not.toContain("label.className");
  });
});

describe("text-flip and readability timing", () => {
  test("intro uses SplitText for phrase labels with masked entrance and exit", () => {
    expect(introSource.includes("phraseSplit")).toBe(true);
    expect(introSource.includes("disposePhraseSplit")).toBe(true);
    expect(introSource.includes("playPhrase")).toBe(true);
    expect(introSource.includes('type: "words"')).toBe(true);
    expect(introSource.includes('mask: "words"')).toBe(true);
  });

  test("label timing uses shared constants with readable hold phases", () => {
    expect(introSource.includes("introWordIn")).toBe(true);
    expect(introSource.includes("introWordOut")).toBe(true);
    expect(introSource.includes("introPhraseHold")).toBe(true);
    expect(transitionSource.includes("labelEntrance")).toBe(true);
    expect(transitionSource.includes("labelExit")).toBe(true);
    expect(transitionSource.includes("labelHoldFor")).toBe(true);
  });

  test("route transition uses timing tiers for different label lengths", () => {
    expect(transitionSource.includes("labelHoldFor")).toBe(true);
    expect(transitionTimingSource.includes('chars > 16')).toBe(true);
    expect(transitionTimingSource.includes('chars > 8')).toBe(true);
  });

  test("holds the complete intro phrase between its masked entrance and exit", () => {
    const enter = introSource.indexOf("duration: transitionTiming.introWordIn");
    const hold = introSource.indexOf("duration: transitionTiming.introPhraseHold");
    const exit = introSource.indexOf("duration: transitionTiming.introWordOut");
    expect(enter).toBeGreaterThan(-1);
    expect(hold).toBeGreaterThan(enter);
    expect(exit).toBeGreaterThan(hold);
  });
});
