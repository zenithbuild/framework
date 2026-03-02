import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPreviewServer } from "../../cli/src/preview.js";

const projectRoot = resolve(import.meta.dir, "..");
const distDir = join(projectRoot, "dist");

function extractMainText(html: string): string {
  const match = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (!match) {
    return "";
  }
  return match[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("zenith-docs catch-all site", () => {
  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error("dist/ is missing. Run `npx zenith build` then `node scripts/stage-public.mjs` first.");
    }
  });

  test("routes render expected pages via optional catch-all", { timeout: 30000 }, async () => {
    const preview = await createPreviewServer({ distDir, port: 0 });
    const base = `http://127.0.0.1:${preview.port}`;

    try {
      const checks: Array<{ path: string; marker: string }> = [
        { path: "/docs", marker: "Documentation" },
        { path: "/docs/contracts/routing", marker: "Routing Contract" },
        { path: "/blog", marker: "Blog" },
        { path: "/blog/routing-awareness", marker: "Routing Awareness Fix" },
        { path: "/tags/routing", marker: "Tag: routing" },
        { path: "/search", marker: "Search" },
        { path: "/showcase", marker: "Not Found" }
      ];

      for (const check of checks) {
        const response = await fetch(`${base}${check.path}`);
        const html = await response.text();
        expect(response.status).toBe(200);
        expect((html.match(/<script id="zenith-ssr-data">/g) ?? []).length).toBe(1);
        expect(html).not.toContain("\"__zenith_error\"");
        expect(extractMainText(html).length).toBeGreaterThan(20);
        expect(html).not.toContain("__z_frag_");
        expect(html).not.toContain(".map((");
        expect(html).not.toContain("[object Object]");
        expect(html).toContain(check.marker);
      }
    } finally {
      preview.close();
    }
  });

  test("AI endpoints are served from staged public output", async () => {
    const preview = await createPreviewServer({ distDir, port: 0 });
    const base = `http://127.0.0.1:${preview.port}`;

    try {
      const llms = await fetch(`${base}/llms.txt`);
      const manifest = await fetch(`${base}/ai/docs.manifest.json`);
      const index = await fetch(`${base}/ai/docs.index.jsonl`);
      const sitemap = await fetch(`${base}/ai/docs.sitemap.json`);
      const nav = await fetch(`${base}/ai/docs.nav.json`);
      const rss = await fetch(`${base}/rss.xml`);

      expect(llms.status).toBe(200);
      expect(manifest.status).toBe(200);
      expect(index.status).toBe(200);
      expect(sitemap.status).toBe(200);
      expect(nav.status).toBe(200);
      expect(rss.status).toBe(200);

      expect(await llms.text()).toContain("Start here (ordered):");
      expect(await manifest.text()).toContain("\"project\": \"Zenith\"");
      expect((await index.text()).split("\n").filter(Boolean).length).toBeGreaterThan(5);
      expect(await sitemap.text()).toContain("/docs/contracts/routing");
      expect(await nav.text()).toContain("\"categories\"");
      expect(await rss.text()).toContain("<rss version=\"2.0\">");
    } finally {
      preview.close();
    }
  });

  test("/assets/* serves built asset bytes and does not route through SSR catch-all", async () => {
    const assetsDir = join(distDir, "assets");
    const assetName = readdirSync(assetsDir)
      .filter((name) => name.endsWith(".css") || name.endsWith(".js"))
      .sort()[0];

    expect(typeof assetName).toBe("string");
    expect(assetName.length).toBeGreaterThan(0);

    const preview = await createPreviewServer({ distDir, port: 0 });
    const base = `http://127.0.0.1:${preview.port}`;

    try {
      const response = await fetch(`${base}/assets/${assetName}`);
      const body = await response.text();
      const contentType = response.headers.get("content-type") || "";

      expect(response.status).toBe(200);
      expect(contentType.includes("text/css") || contentType.includes("application/javascript")).toBe(true);
      expect(body).not.toContain("<script id=\"zenith-ssr-data\">");
      expect(body.length).toBeGreaterThan(40);
    } finally {
      preview.close();
    }
  });
});
