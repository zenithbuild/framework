import { describe, expect, test } from "bun:test";
import { compileCmsBody, type DocsDemoRenderEntry } from "../src/server/content-render.ts";

describe("docs demo shortcode rendering", () => {
    test("renders whitelisted demo iframe from shortcode", () => {
        const registry = new Map<string, DocsDemoRenderEntry>();
        registry.set("counter-basic", {
            id: "counter-basic",
            name: "Counter",
            route: "/__docs-demo/counter-basic",
            height: 360,
            contracts: ["ZEN-RULE-023"],
        });

        const html = compileCmsBody(
            { body_md: "# Demo\n\n:::demo id=\"counter-basic\":::" },
            { mdxEnabled: true, demoRegistry: registry },
        );

        expect(html).toContain("/__docs-demo/counter-basic");
        expect(html).toContain("iframe");
        expect(html).toContain("Counter");
    });

    test("renders unavailable block for unknown shortcode id", () => {
        const html = compileCmsBody(
            { body_md: ":::demo id=\"unknown-demo\":::" },
            { mdxEnabled: true, demoRegistry: new Map() },
        );

        expect(html).toContain("Demo unavailable");
        expect(html).toContain("unknown-demo");
    });

    test("rewrites internal markdown links to canonical /docs hrefs", () => {
        const html = compileCmsBody(
            {
                body_md: [
                    "[Routing](../contracts/routing.md)",
                    "[Reference](documentation/reference/zenlink.md)",
                    "[Canonical](/docs/contracts/runtime-contract.md)",
                    "[External](https://example.com/docs)"
                ].join("\n\n"),
            },
            {
                mdxEnabled: true,
                sourcePath: "documentation/guides/interactive-demos.md"
            },
        );

        expect(html).toContain('href="/docs/contracts/routing"');
        expect(html).toContain('href="/docs/reference/zenlink"');
        expect(html).toContain('href="/docs/contracts/runtime-contract"');
        expect(html).toContain('href="https://example.com/docs"');
    });
});
