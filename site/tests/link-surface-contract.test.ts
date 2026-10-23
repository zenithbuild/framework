import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expandComponents, buildComponentRegistry } from "../../packages/cli/src/resolve-components.js";

const siteSrcDir = resolve(import.meta.dir, "../src");
const compilerBinary = resolve(import.meta.dir, "../../packages/compiler/target/release/zenith-compiler");
const componentRegistry = buildComponentRegistry(siteSrcDir);

function compileZenFixture(fixtureName: string, fixtureSource: string) {
  const fixtureFile = resolve(import.meta.dir, `../src/pages/${fixtureName}`);
  const { expandedSource } = expandComponents(fixtureSource, componentRegistry, fixtureFile);
  const result = spawnSync(
    compilerBinary,
    ["--stdin", fixtureFile, "--internal-allow-unbound-markup"],
    {
    encoding: "utf8",
    input: expandedSource,
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function compileSiteLinksFixture(href: string) {
  return compileZenFixture(
    "__link-surface-fixture__.zen",
    `<script lang="ts">
import Links from "../components/ui/Links.zen";
</script>
<Links href="${href}">About</Links>`,
  );
}

describe("site link surface compile contract", () => {
  test("compiles Links through the canonical soft-nav anchor path for proven route entries", () => {
    const result = compileSiteLinksFixture("/about");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout);
    expect(
      payload.html.includes('data-zen-link="true"') ||
      payload.html.includes("data-zx-data-zen-link="),
    ).toBe(true);
  });

  test("keeps external and deep-hash site surfaces compile-safe without widening soft-nav policy", () => {
    const externalResult = compileSiteLinksFixture("https://github.com/zenithbuild/framework");
    const hashResult = compileSiteLinksFixture("/about#routing");

    expect(externalResult.status).toBe(0);
    expect(hashResult.status).toBe(0);
  });

  test("keeps the simplified navigation on the canonical clickable site link surface", () => {
    const navigationSource = readFileSync(resolve(import.meta.dir, "../src/components/ui/Navigation.zen"), "utf8");
    const result = compileZenFixture(
      "__navigation-fixture__.zen",
      `<script lang="ts">
import Navigation from "../components/ui/Navigation.zen";

const navigationFixtureContent = {
  mainLinks: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "GitHub", href: "https://github.com/zenithbuild/framework" },
  ],
  footerLinks: [
    { label: "Twitter", href: "https://twitter.com/zenithbuild" },
    { label: "GitHub", href: "https://github.com/zenithbuild/framework" },
  ],
};
</script>
<Navigation content={navigationFixtureContent} />`,
    );

    expect(navigationSource.includes('data-nav-logo-target="true"')).toBe(true);
    expect(navigationSource.includes('NavDropdown label="Docs"')).toBe(true);
    expect(navigationSource.includes('NavDropdown label="Framework"')).toBe(false);
    expect(navigationSource.includes('NavDropdown label="Resources"')).toBe(false);
    expect(navigationSource.includes("href={navHomeLink.href}")).toBe(true);
    expect(navigationSource.includes("href={navBlogLink.href}")).toBe(true);
    expect(navigationSource.includes("href={navAboutLink.href}")).toBe(true);
    expect(navigationSource.includes("documentationDropdownItems[0].href")).toBe(true);
    expect(navigationSource.includes("href={navChangelogLink.href}")).toBe(false);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout);
    expect(payload.html.includes("mobile-navigation")).toBe(true);
    expect(payload.html.includes("data-nav-logo-target")).toBe(true);
    expect(
      payload.html.includes('data-zen-link="true"') ||
      payload.html.includes("data-zx-data-zen-link="),
    ).toBe(true);
  });

  test("keeps Button bindings on component-scoped aliases instead of bare runtime identifiers", () => {
    const result = compileZenFixture(
      "__button-fixture__.zen",
      `<script lang="ts">
import Button from "../components/ui/Button.zen";
</script>
<Button type="button" ariaLabel="Demo" ariaPressed="false">Demo</Button>`,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout);
    expect(Array.isArray(payload.expressions)).toBe(true);
    expect(payload.expressions.includes("buttonControlType")).toBe(true);
    expect(payload.expressions.includes("buttonAriaPressedValue")).toBe(true);
    expect(payload.expressions.includes("buttonResolvedClass")).toBe(true);
    expect(payload.expressions.includes("buttonType")).toBe(false);
    expect(payload.expressions.includes("ariaPressedValue")).toBe(false);
    expect(payload.expressions.includes("ariaLabelValue")).toBe(false);
  });
});
