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
  const result = spawnSync(compilerBinary, ["--stdin", fixtureFile], {
    encoding: "utf8",
    input: expandedSource,
  });

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
<Links href="${href}">Docs</Links>`,
  );
}

describe("site link surface compile contract", () => {
  test("compiles Links through the canonical soft-nav anchor path for proven route entries", () => {
    const result = compileSiteLinksFixture("/docs");

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
    const hashResult = compileSiteLinksFixture("/docs#routing");

    expect(externalResult.status).toBe(0);
    expect(hashResult.status).toBe(0);
  });

  test("keeps the navigation menu on the canonical clickable site link surface", () => {
    const navigationSource = readFileSync(resolve(import.meta.dir, "../src/components/ui/Navigation.zen"), "utf8");
    const result = compileZenFixture(
      "__navigation-fixture__.zen",
      `<script lang="ts">
import Navigation from "../components/ui/Navigation.zen";

const navigationFixtureContent = {
  mainLinks: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Docs", href: "/docs" },
    { label: "Blog", href: "/blog" },
    { label: "GitHub", href: "https://github.com/zenithbuild/framework" },
  ],
  footerLinks: [
    { label: "Twitter", href: "https://twitter.com/zenithbuild" },
    { label: "GitHub", href: "https://github.com/zenithbuild/framework" },
    { label: "Contract", href: "/docs#editor-contract" },
  ],
};
</script>
<Navigation content={navigationFixtureContent} />`,
    );

    expect(navigationSource.includes('class="pointer-events-auto flex-1 flex flex-col justify-center"')).toBe(true);
    expect(navigationSource.includes("href={navAboutLink.href}")).toBe(true);
    expect(navigationSource.includes("href={navDocsLink.href}")).toBe(true);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout);
    expect(payload.html.includes("site-menu-panel")).toBe(true);
    expect(payload.html.includes("pointer-events-auto flex-1 flex flex-col justify-center")).toBe(true);
    expect(
      payload.html.includes('data-zen-link="true"') ||
      payload.html.includes("data-zx-data-zen-link="),
    ).toBe(true);
  });

  test("locks the route transition shell to a fixed bottom-cover-top overlay contract", () => {
    const result = compileZenFixture(
      "__route-transition-shell-fixture__.zen",
      `<script lang="ts">
import RouteTransitionShell from "../components/globals/RouteTransitionShell.zen";

const transitionFixtureContent = {
  routes: ["/", "/about", "/blog", "/docs"],
};

const transitionFixtureFrameRef = ref<HTMLDivElement>();
</script>
<div ref={transitionFixtureFrameRef}>
  <RouteTransitionShell content={transitionFixtureContent} frameRef={transitionFixtureFrameRef} />
</div>`,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout);
    expect(payload.html.includes("data-transition-state")).toBe(true);
    expect(payload.html.includes("fixed inset-0")).toBe(true);
    expect(payload.html.includes("translate3d(0, 100%, 0)")).toBe(true);
    expect(payload.html.includes("bg-border/80")).toBe(true);
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
