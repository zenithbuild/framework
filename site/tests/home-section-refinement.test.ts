import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const indexSource = readSource("src/pages/index.zen");
const aboutSource = readSource("src/components/AboutSection.zen");
const precisionSource = readSource("src/components/PrecisionRail.zen");
const sponsorshipSource = readSource("src/components/FeatureShowcase.zen");
const contributorsSource = readSource("src/components/ContributorsSection.zen");
const motionSource = readSource("src/components/motion/MotionGroup.zen");

describe("Home section refinement", () => {
  test("keeps the framework showcase, precision rail, sponsorship, and contributors as distinct Home sections", () => {
    expect(indexSource.includes('import FrameworkSurface from "@/components/FrameworkSurface.zen"')).toBe(false);
    expect(indexSource.includes('import AboutSection from "@/components/AboutSection.zen"')).toBe(true);
    expect(indexSource.includes('import PrecisionRail from "@/components/PrecisionRail.zen"')).toBe(true);
    expect(indexSource.includes('import FeatureShowcase from "@/components/FeatureShowcase.zen"')).toBe(true);
    expect(indexSource.includes('import ContributorsSection from "@/components/ContributorsSection.zen"')).toBe(true);
    expect(indexSource.includes("<AboutSection />")).toBe(true);
    expect(indexSource.includes("<PrecisionRail />")).toBe(true);
    expect(indexSource.includes("<FeatureShowcase sponsorship={data.editorial.sponsorship} />")).toBe(true);
    expect(indexSource.includes("<ContributorsSection people={data.editorial.people} />")).toBe(true);
    expect(indexSource.indexOf("<AboutSection />")).toBeLessThan(indexSource.indexOf("<PrecisionRail />"));
    expect(indexSource.indexOf("<PrecisionRail />")).toBeLessThan(indexSource.indexOf("<FeatureShowcase sponsorship="));
    expect(indexSource.indexOf("<FeatureShowcase sponsorship=")).toBeLessThan(indexSource.indexOf("<ContributorsSection people="));
  });

  test("shows every public Zenith package once in the accessible rail", () => {
    [
      "@zenithbuild/bundler",
      "@zenithbuild/cli",
      "@zenithbuild/compiler",
      "@zenithbuild/core",
      "create-zenith",
      "@zenithbuild/extension-registry",
      "@zenithbuild/language-server",
      "@zenithbuild/language",
      "@zenithbuild/router",
      "@zenithbuild/runtime",
      "zenithbuild",
    ].forEach((packageName) => expect(precisionSource.includes(packageName)).toBe(true));
    expect(precisionSource.includes("bundler-darwin-arm64")).toBe(false);
    expect(precisionSource.includes('aria-hidden="true"')).toBe(true);
    expect(precisionSource.includes("startRailMotion")).toBe(true);
    expect(precisionSource.includes("railTimeline?.kill()")).toBe(true);
  });

  test("restores the original PrecisionRail composition around the approved package loop", () => {
    expect(precisionSource.includes("Engineered for precision")).toBe(true);
    expect(precisionSource.includes("text-left text-sm font-semibold uppercase tracking-[0.08em]")).toBe(true);
    expect(precisionSource.includes("Every package. One release train.")).toBe(false);
    expect(precisionSource.includes("precisionCopyRef")).toBe(false);
    expect(precisionSource.includes('variant="home-precision"')).toBe(true);
  });

  test("uses a single factual framework sponsorship invitation rather than a feature tab surface", () => {
    expect(indexSource.includes("<FrameworkSurface")).toBe(false);
    expect(sponsorshipSource.includes("Become Zenith’s first sponsor.")).toBe(true);
    expect(sponsorshipSource.includes("https://github.com/sponsors/zenithbuild")).toBe(true);
    expect(sponsorshipSource.includes("Your name here")).toBe(true);
    expect(sponsorshipSource.includes("Reserved / 01")).toBe(true);
    expect(sponsorshipSource.includes("text-5xl font-semibold leading-[0.9]")).toBe(true);
    expect(sponsorshipSource.includes("text-[clamp(3rem,7vw,6.5rem)]")).toBe(false);
    expect(sponsorshipSource.includes("Compiler ownership")).toBe(false);
    expect(sponsorshipSource.includes("MotionGroup")).toBe(true);
    expect(sponsorshipSource.includes('variant="home-sponsor"')).toBe(true);
  });

  test("represents audited human contributors as one compact linked avatar group", () => {
    expect(contributorsSource.includes("Judah Sullivan")).toBe(true);
    expect(contributorsSource.includes("Jonathan Streetman")).toBe(true);
    expect(contributorsSource.includes("https://github.com/Jstreetman")).toBe(true);
    expect(contributorsSource.includes("https://github.com/judahbsullivan")).toBe(true);
    expect(contributorsSource.includes("https://github.com/colinwilliams91")).toBe(true);
    expect(contributorsSource.includes("github-actions[bot]")).toBe(false);
    expect(contributorsSource.includes("data-contributor-avatar-group")).toBe(true);
    expect(contributorsSource.includes("Primary contributor")).toBe(false);
    expect(contributorsSource.includes("Repository contributor")).toBe(false);
    expect(contributorsSource.includes('variant="home-contributors"')).toBe(true);
  });

  test("shares one motion token set across every refined section", () => {
    expect(motionSource.includes("sectionMotion")).toBe(true);
    expect(motionSource.includes("power4.out")).toBe(true);
    expect(motionSource.includes("power3.out")).toBe(true);
    [aboutSource, precisionSource, sponsorshipSource, contributorsSource].forEach((source) => {
      expect(source.includes("MotionGroup")).toBe(true);
      expect(source.includes("data-motion-section")).toBe(true);
    });
    [precisionSource, sponsorshipSource, contributorsSource].forEach((source) => {
      expect(source.includes('variant="home-')).toBe(true);
    });
    expect(aboutSource.includes('data-motion-section="home-about"')).toBe(true);
    expect(precisionSource.includes('data-motion-section="home-precision"')).toBe(true);
    expect(sponsorshipSource.includes('data-motion-section="home-sponsorship"')).toBe(true);
    expect(contributorsSource.includes('data-motion-section="home-community"')).toBe(true);
  });

  test("marks only intended motion targets as unprepared before shared motion mounts", () => {
    [aboutSource, precisionSource, sponsorshipSource, contributorsSource].forEach((source) => {
      expect(source.includes('data-motion-ready="false"')).toBe(true);
      expect(source.includes('data-motion-target="true"')).toBe(true);
    });
    expect(motionSource.includes("data-motion-state")).toBe(true);
    expect(motionSource.includes("Section preparation failed; content was revealed.")).toBe(true);
  });
});
