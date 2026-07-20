import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const introSource = readSource("src/components/IntroLoader.zen");
const heroSource = readSource("src/components/Hero.zen");
const motionSource = readSource("src/components/motion/MotionController.zen");
const navigationSource = readSource("src/components/ui/Navigation.zen");
const navigationMarkSource = readSource("src/components/ZenithNavigationMark.zen");
const transitionIdentitySource = readSource("src/components/transition/TransitionIdentity.zen");
const transitionTimingSource = readSource("src/components/transition/transitionTiming.ts");
const transitionSource = readSource("src/components/route-transition/RouteTransition.zen");

describe("Zenith animation contract", () => {
  test("reveals the real mark through a stable clipping mask without 3D rotation on the logo", () => {
    expect(introSource.includes('data-intro-logo-mask="true"')).toBe(true);
    expect(introSource.includes("clipPath")).toBe(true);
    expect(introSource.includes("inset(0 100% 0 0)")).toBe(true);
    expect(introSource.includes("inset(0 0% 0 0)")).toBe(true);
    // Logo mask must not use 3D rotation
    const maskSection = introSource.substring(
      introSource.indexOf("data-intro-logo-mask"),
      introSource.indexOf("data-intro-logo-mask") + 200,
    );
    expect(maskSection.includes("rotateX")).toBe(false);
    expect(maskSection.includes("rotateY")).toBe(false);
    // Label text-flip may use rotationX and transformPerspective — that is intentional
    expect(introSource.includes("rotationX")).toBe(true);
    expect(introSource.includes("transformPerspective")).toBe(true);
  });

  test("uses official Flip state capture and the rendered navigation target", () => {
    expect(introSource.includes('from "gsap/Flip"')).toBe(true);
    expect(introSource.includes("gsap.registerPlugin(Flip, SplitText)")).toBe(true);
    expect(introSource.includes("Flip.getState(markTraveler")).toBe(true);
    expect(introSource.includes("Flip.fit(markTraveler, logoTarget")).toBe(true);
    expect(introSource.includes("Flip.from(firstState")).toBe(true);
    expect(introSource.includes("Flip.isFlipping(markTraveler)")).toBe(true);
    expect(introSource.includes("getBoundingClientRect")).toBe(false);
  });

  test("uses one shared visual and reveals the destination before hiding the traveler", () => {
    expect(navigationMarkSource.includes('data-shared-nav-mark="true"')).toBe(true);
    expect(introSource.includes("<ZenithNavigationMark />")).toBe(true);
    expect(navigationSource.includes("<ZenithNavigationMark />")).toBe(true);

    const destinationVisible = introSource.indexOf("gsap.set(logoTarget, { autoAlpha: 1 });", introSource.indexOf("function settleLogo"));
    const travelerHidden = introSource.indexOf("gsap.set(markTraveler, { autoAlpha: 0 });", introSource.indexOf("function settleLogo"));
    expect(destinationVisible).toBeGreaterThan(-1);
    expect(travelerHidden).toBeGreaterThan(destinationVisible);
  });

  test("splits only the hero title into clipped lines and reverts cleanly", () => {
    expect(introSource.includes('from "gsap/SplitText"')).toBe(true);
    expect(heroSource.includes('data-hero-split-title="true"')).toBe(true);
    expect(introSource.includes('type: "lines"')).toBe(true);
    expect(introSource.includes('mask: "lines"')).toBe(true);
    expect(introSource.includes("autoSplit: true")).toBe(true);
    expect(introSource.includes("split.lines")).toBe(true);
    expect(introSource.includes("heroSplit.revert()")).toBe(true);
    expect(introSource.includes("heroSplit.kill()")).toBe(true);
  });

  test("keeps the corrected intro label and timeline order", () => {
    const primeIndex = introSource.indexOf('"Prime trusted runtime"');
    const compileIndex = introSource.indexOf('"Compile route graph"');
    const placeIndex = introSource.indexOf('"Place Zenith mark"');

    expect(primeIndex).toBeGreaterThan(-1);
    expect(compileIndex).toBeGreaterThan(primeIndex);
    expect(placeIndex).toBeGreaterThan(compileIndex);
    expect(introSource.includes("phrase = phrases[1]")).toBe(true);
    expect(introSource.includes("phrase = phrases[2]")).toBe(true);
  });

  test("keeps replay and HMR initialization idempotent", () => {
    expect(introSource.includes("sessionStorage")).toBe(false);
    expect(introSource.includes("introStorageKey")).toBe(false);
    expect(introSource.includes("__zenithIntroCommitted")).toBe(true);
    expect(introSource.includes("__zenithIntroComplete")).toBe(true);
    expect(introSource.includes("__zenithIntroTimelineActive")).toBe(true);
    expect(introSource.includes("__zenithIntroPlayed")).toBe(true);
    expect(introSource.includes("__zenithIntroStarted")).toBe(true);
    expect(introSource.includes("Flip.killFlipsOf(markTraveler, false)")).toBe(true);
    expect(introSource.includes('matchMedia("(prefers-reduced-motion: reduce)")')).toBe(true);
    expect(introSource.includes('if (ownsTimeline && introPhase !== "complete") completeImmediately()')).toBe(true);
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
      "src/pages/blog/building-zenith-0-8/index.zen",
      "src/pages/docs/index.zen",
      "src/pages/docs/getting-started/index.zen",
      "src/pages/about/index.zen",
    ].map(readSource);

    routeSources.forEach((source) => {
      expect(source.includes("MotionController")).toBe(true);
      expect(source.includes("data-motion-section")).toBe(true);
    });
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

  test("intro labels use larger typography than route labels", () => {
    // Intro label class is set in IntroLoader.zen
    expect(introSource.includes("text-2xl")).toBe(true);
    expect(introSource.includes("sm:text-3xl")).toBe(true);
    // Route label class is set in RouteTransition.zen
    expect(transitionSource.includes("text-xl")).toBe(true);
    expect(transitionSource.includes("sm:text-2xl")).toBe(true);
    // Both use the same font family
    expect(introSource.includes("font-heading")).toBe(true);
    expect(transitionSource.includes("font-heading")).toBe(true);
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
    expect(introSource.includes("labelEntrance")).toBe(true);
    expect(introSource.includes("labelExit")).toBe(true);
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

  test("label entrance and exit durations are at least 0.7s for readability", () => {
    expect(transitionTimingSource.includes("labelEntrance: 0.72")).toBe(true);
    expect(transitionTimingSource.includes("labelExit: 0.72")).toBe(true);
  });
});
