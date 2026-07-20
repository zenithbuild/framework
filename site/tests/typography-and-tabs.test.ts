import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dir, "..");

function readSource(path: string) {
  const absolutePath = resolve(siteRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const heroSource = readSource("src/components/Hero.zen");
const workbenchSource = readSource("src/components/home/CodeWorkbench.zen");
const contributorsSource = readSource("src/components/ContributorsSection.zen");
const aboutSectionSource = readSource("src/components/AboutSection.zen");
const displayTitleSource = readSource("src/components/typography/DisplayTitle.zen");
const pageHeaderSource = readSource("src/components/layout/PageHeader.zen");
const footerCtaSource = readSource("src/components/globals/footer/FooterCTA.zen");
const featureShowcaseSource = readSource("src/components/FeatureShowcase.zen");

describe("typography weight consistency", () => {
  test("all section titles use font-semibold (not font-bold or font-black)", () => {
    expect(contributorsSource.includes("font-black")).toBe(false);
    expect(aboutSectionSource.includes("font-black")).toBe(false);
    expect(featureShowcaseSource.includes("font-black")).toBe(false);
  });

  test("DisplayTitle uses font-semibold for all variants", () => {
    expect(displayTitleSource.includes("font-semibold")).toBe(true);
    expect(displayTitleSource.includes("font-black")).toBe(false);
    expect(displayTitleSource.includes("font-bold")).toBe(false);
  });

  test("PageHeader title uses font-semibold", () => {
    expect(pageHeaderSource.includes("font-semibold")).toBe(true);
    expect(pageHeaderSource.includes("font-black")).toBe(false);
  });

  test("FooterCTA title uses font-semibold", () => {
    expect(footerCtaSource.includes("font-semibold")).toBe(true);
    expect(footerCtaSource.includes("font-black")).toBe(false);
  });

  test("Hero title uses font-semibold", () => {
    expect(heroSource.includes("font-semibold")).toBe(true);
    expect(heroSource.includes("font-black")).toBe(false);
    expect(heroSource.includes("font-bold")).toBe(false);
  });
});

describe("code-example tab interaction", () => {
  test("Hero has activeExample state with route as default", () => {
    expect(workbenchSource.includes('state activeExample')).toBe(true);
    expect(workbenchSource.includes('state activeView')).toBe(true);
    expect(workbenchSource.includes('"route"')).toBe(true);
  });

  test("Hero has multiple code examples", () => {
    expect(workbenchSource.includes("const route")).toBe(true);
    expect(workbenchSource.includes("const state")).toBe(true);
    expect(workbenchSource.includes("const server")).toBe(true);
    expect(workbenchSource.includes("const events")).toBe(true);
  });

  test("Hero has selectExample function with animation", () => {
    expect(workbenchSource.includes("function select")).toBe(true);
    expect(workbenchSource.includes("timeline?.kill()")).toBe(true);
    expect(workbenchSource.includes("gsap.timeline(")).toBe(true);
  });

  test("Hero tabs use accessible semantics", () => {
    expect(workbenchSource.includes('role="tablist"')).toBe(true);
    expect(workbenchSource.includes('role="tab"')).toBe(true);
    expect(workbenchSource.includes("ariaSelected")).toBe(true);
    expect(workbenchSource.includes('role="tabpanel"')).toBe(true);
  });

  test("Hero tabs use on:click with function-valued handler", () => {
    expect(workbenchSource.includes("onPress={() => select")).toBe(true);
  });

  test("Hero handles rapid-click collisions", () => {
    expect(workbenchSource.includes("timeline?.kill()")).toBe(true);
    expect(workbenchSource.includes("generation++")).toBe(true);
    expect(workbenchSource.includes("zenMount")).toBe(true);
    expect(workbenchSource.includes("clearProps")).toBe(true);
  });

  test("Hero handles reduced motion for tab switching", () => {
    expect(workbenchSource.includes("prefers-reduced-motion")).toBe(true);
  });

  test("Hero code examples use factual Zenith syntax", () => {
    expect(workbenchSource.includes("export const load")).toBe(true);
    expect(workbenchSource.includes("export const guard")).toBe(true);
    expect(workbenchSource.includes("state ")).toBe(true);
    expect(workbenchSource.includes("ref<")).toBe(true);
    expect(workbenchSource.includes("on:click=")).toBe(true);
    expect(workbenchSource.includes("on:esc=")).toBe(true);
    expect(workbenchSource.includes("on:hoverin=")).toBe(true);
  });

  test("Hero tab switching preserves layout stability", () => {
    expect(workbenchSource.includes("min-h-[34rem]")).toBe(true);
  });
});
