import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const displayTitleSource = readSource("src/components/typography/DisplayTitle.zen");
const eyebrowLabelSource = readSource("src/components/typography/EyebrowLabel.zen");
const bodyTextSource = readSource("src/components/typography/BodyText.zen");
const motionGroupSource = readSource("src/components/motion/MotionGroup.zen");
const motionPresetsSource = readSource("src/components/motion/motionPresets.ts");
const pageHeaderSource = readSource("src/components/layout/PageHeader.zen");
const footerCtaSource = readSource("src/components/globals/footer/FooterCTA.zen");
const featureShowcaseSource = readSource("src/components/FeatureShowcase.zen");
const contributorsSource = readSource("src/components/ContributorsSection.zen");
const precisionRailSource = readSource("src/components/PrecisionRail.zen");
const aboutSectionSource = readSource("src/components/AboutSection.zen");

describe("typography primitives", () => {
  test("DisplayTitle supports size variants and motion registration", () => {
    expect(displayTitleSource.includes("hero")).toBe(true);
    expect(displayTitleSource.includes("page")).toBe(true);
    expect(displayTitleSource.includes("section")).toBe(true);
    expect(displayTitleSource.includes("article")).toBe(true);
    expect(displayTitleSource.includes("docs")).toBe(true);
    expect(displayTitleSource.includes("data-route-title")).toBe(true);
    expect(displayTitleSource.includes("data-route-entrance")).toBe(true);
    expect(displayTitleSource.includes("font-heading")).toBe(true);
  });

  test("EyebrowLabel supports tone variants", () => {
    expect(eyebrowLabelSource.includes("primary")).toBe(true);
    expect(eyebrowLabelSource.includes("blue")).toBe(true);
    expect(eyebrowLabelSource.includes("gold")).toBe(true);
    expect(eyebrowLabelSource.includes("magenta")).toBe(true);
    expect(eyebrowLabelSource.includes("muted")).toBe(true);
    expect(eyebrowLabelSource.includes("font-mono")).toBe(true);
    expect(eyebrowLabelSource.includes("uppercase")).toBe(true);
    expect(eyebrowLabelSource.includes("tracking-[0.2em]")).toBe(true);
  });

  test("BodyText supports size and tone variants", () => {
    expect(bodyTextSource.includes("lead")).toBe(true);
    expect(bodyTextSource.includes("body")).toBe(true);
    expect(bodyTextSource.includes("small")).toBe(true);
    expect(bodyTextSource.includes("feature")).toBe(true);
    expect(bodyTextSource.includes("primary")).toBe(true);
    expect(bodyTextSource.includes("muted")).toBe(true);
    expect(bodyTextSource.includes("soft")).toBe(true);
  });
});

describe("motion primitives", () => {
  test("MotionGroup supports page and scroll modes with route-entrance tagging", () => {
    expect(motionGroupSource.includes("page")).toBe(true);
    expect(motionGroupSource.includes("scroll")).toBe(true);
    expect(motionGroupSource.includes("data-route-entrance")).toBe(true);
    expect(motionGroupSource.includes("ScrollTrigger")).toBe(true);
    expect(motionGroupSource.includes("prefers-reduced-motion")).toBe(true);
    expect(motionGroupSource.includes("context.revert()")).toBe(true);
  });

  test("motionPresets defines approved animation configurations", () => {
    expect(motionPresetsSource.includes("maskedTitle")).toBe(true);
    expect(motionPresetsSource.includes("fadeUp")).toBe(true);
    expect(motionPresetsSource.includes("staggeredActions")).toBe(true);
    expect(motionPresetsSource.includes("mediaSettle")).toBe(true);
    expect(motionPresetsSource.includes("groupedCards")).toBe(true);
    expect(motionPresetsSource.includes("MotionMode")).toBe(true);
    expect(motionPresetsSource.includes("MotionPreset")).toBe(true);
  });
});

describe("component migration", () => {
  test("PageHeader uses shared typography and motion primitives", () => {
    expect(pageHeaderSource.includes('from "@/components/typography/EyebrowLabel.zen"')).toBe(true);
    expect(pageHeaderSource.includes('from "@/components/typography/BodyText.zen"')).toBe(true);
    expect(pageHeaderSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(pageHeaderSource.includes("EyebrowLabel")).toBe(true);
    expect(pageHeaderSource.includes("BodyText")).toBe(true);
    expect(pageHeaderSource.includes("MotionGroup")).toBe(true);
    expect(pageHeaderSource.includes("data-route-title")).toBe(true);
    expect(pageHeaderSource.includes("data-page-header")).toBe(true);
  });

  test("FooterCTA uses shared typography and motion primitives", () => {
    expect(footerCtaSource.includes('from "@/components/typography/EyebrowLabel.zen"')).toBe(true);
    expect(footerCtaSource.includes('from "@/components/typography/BodyText.zen"')).toBe(true);
    expect(footerCtaSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(footerCtaSource.includes("MotionGroup")).toBe(true);
  });

  test("FeatureShowcase uses shared typography and motion primitives", () => {
    expect(featureShowcaseSource.includes('from "@/components/typography/EyebrowLabel.zen"')).toBe(true);
    expect(featureShowcaseSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(featureShowcaseSource.includes("EyebrowLabel")).toBe(true);
    expect(featureShowcaseSource.includes("MotionGroup")).toBe(true);
  });

  test("ContributorsSection uses MotionGroup", () => {
    expect(contributorsSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(contributorsSource.includes("MotionGroup")).toBe(true);
    expect(contributorsSource.includes("MotionController")).toBe(false);
  });

  test("PrecisionRail uses MotionGroup", () => {
    expect(precisionRailSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(precisionRailSource.includes("MotionGroup")).toBe(true);
    expect(precisionRailSource.includes("MotionController")).toBe(false);
  });

  test("AboutSection uses MotionGroup", () => {
    expect(aboutSectionSource.includes('from "@/components/motion/MotionGroup.zen"')).toBe(true);
    expect(aboutSectionSource.includes("MotionGroup")).toBe(true);
    expect(aboutSectionSource.includes("MotionController")).toBe(false);
  });
});

describe("semantic heading hierarchy", () => {
  test("PageHeader renders h1 with data-route-title", () => {
    expect(pageHeaderSource.includes("<h1")).toBe(true);
    expect(pageHeaderSource.includes('data-route-title="true"')).toBe(true);
  });

  test("DisplayTitle renders h2 (section level default)", () => {
    expect(displayTitleSource.includes("<h2")).toBe(true);
  });
});
