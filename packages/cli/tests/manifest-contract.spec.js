import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeBuildOutputManifest } from "../src/build-output-manifest.js";
import {
  collectImmutableAssetPaths,
  expandImmutableRequestPaths,
  isContentHashedAssetPath,
  mergeNetlifyHeaders,
} from "../src/immutable-assets.js";

async function writeFixtureFile(root, relativePath, contents) {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

describe("build manifest contract", () => {
  let projectRoot = null;

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = null;
    }
  });

  test("canonical manifest snapshot covers static, prerendered dynamic, and server-classified routes", async () => {
    projectRoot = join(
      tmpdir(),
      `zenith-manifest-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const coreOutputDir = join(projectRoot, ".zenith-output");
    const staticDir = join(coreOutputDir, "static");

    await writeFixtureFile(
      staticDir,
      "index.html",
      [
        "<!DOCTYPE html>",
        "<html><body>",
        '<script type="module" src="/docs/assets/index.contract.js"></script>',
        "</body></html>",
      ].join(""),
    );
    await writeFixtureFile(
      staticDir,
      "docs/__param_slug/index.html",
      [
        "<!DOCTYPE html>",
        "<html><body>",
        '<script type="module" src="/docs/assets/docs_slug.contract.js"></script>',
        "</body></html>",
      ].join(""),
    );
    await writeFixtureFile(
      staticDir,
      "account/index.html",
      [
        "<!DOCTYPE html>",
        "<html><body>",
        '<script type="module" src="/docs/assets/account.contract.js"></script>',
        "</body></html>",
      ].join(""),
    );
    await writeFixtureFile(
      staticDir,
      "manifest.json",
      `${JSON.stringify(
        {
          entry: "/docs/assets/runtime.contract.js",
          base_path: "/docs",
          vendor: null,
          router: null,
          css: "/docs/assets/styles.contract.css",
          core: "/docs/assets/core.contract.js",
          hash: "contract-hash",
          chunks: {
            "/": "/docs/assets/index.contract.js",
            "/docs/:slug": "/docs/assets/docs_slug.contract.js",
            "/account": "/docs/assets/account.contract.js",
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFixtureFile(
      staticDir,
      "assets/router-manifest.json",
      `${JSON.stringify(
        {
          base_path: "/docs",
          routes: [
            { path: "/", output: "/index.html" },
            { path: "/docs/:slug", output: "/docs/__param_slug/index.html" },
            { path: "/account", output: "/account/index.html" },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const manifest = await writeBuildOutputManifest({
      coreOutputDir,
      staticDir,
      target: "contract-fixture",
      basePath: "/docs",
      routeManifest: [
        {
          path: "/account",
          file: "account/index.zen",
          path_kind: "static",
          render_mode: "server",
          params: [],
        },
        {
          path: "/",
          file: "index.zen",
          path_kind: "static",
          render_mode: "prerender",
          params: [],
        },
        {
          path: "/docs/:slug",
          file: "docs/[slug].zen",
          path_kind: "dynamic",
          render_mode: "prerender",
          params: ["slug"],
          export_paths: ["/docs/guide", "/docs/api"],
        },
      ],
    });
    const fileManifest = JSON.parse(
      await readFile(join(coreOutputDir, "manifest.json"), "utf8"),
    );

    expect(fileManifest).toEqual(manifest);
    expect({
      ...manifest,
      zenith_version: "<version>",
    }).toMatchInlineSnapshot(`
     {
       "assets": {
         "css": [
           "/docs/assets/styles.contract.css",
         ],
         "immutable": [],
         "js": [
           "/docs/assets/account.contract.js",
           "/docs/assets/core.contract.js",
           "/docs/assets/docs_slug.contract.js",
           "/docs/assets/index.contract.js",
           "/docs/assets/runtime.contract.js",
         ],
         "vendor": null,
       },
       "base_path": "/docs",
       "content_hash": "contract-hash",
       "routes": [
         {
           "assets": [
             "/docs/assets/account.contract.js",
           ],
           "file": "account/index.zen",
           "html": "/account/index.html",
           "params": [],
           "path": "/account",
           "path_kind": "static",
           "render_mode": "server",
           "requires_hydration": true,
         },
         {
           "assets": [
             "/docs/assets/index.contract.js",
           ],
           "file": "index.zen",
           "html": "/index.html",
           "params": [],
           "path": "/",
           "path_kind": "static",
           "render_mode": "prerender",
           "requires_hydration": true,
         },
         {
           "assets": [
             "/docs/assets/docs_slug.contract.js",
           ],
           "export_paths": [
             "/docs/guide",
             "/docs/api",
           ],
           "file": "docs/[slug].zen",
           "html": "/docs/__param_slug/index.html",
           "params": [
             "slug",
           ],
           "path": "/docs/:slug",
           "path_kind": "dynamic",
           "render_mode": "prerender",
           "requires_hydration": true,
         },
       ],
       "schema_version": 1,
       "target": "contract-fixture",
       "zenith_version": "<version>",
     }
    `);
  });

  test("immutable allowlist follows manifest seeds and their hashed imports", async () => {
    projectRoot = join(
      tmpdir(),
      `zenith-immutable-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const staticDir = join(projectRoot, "static");
    const page = [
      'import { helper } from "./modules/src/helper.c3d4e5f6.js";',
      'import { extra } from "/docs/assets/vendor.aaaaaaaaaaaaaaaa.bbbbbbbb.cccccccc.js";',
      "export const page = helper + extra;",
    ].join("\n");
    const vendor = 'import { chunk } from "./vendor-chunks/lib-AbcdEfgh.js";\nexport const extra = chunk;\n';
    const css = '@import "./fonts/font.d4e5f6a7.css";\nbody{color:url("/docs/assets/fonts/mark.e5f6a7b8.woff2")}\n';
    await writeFixtureFile(staticDir, "assets/index.b2c3d4e5.js", page);
    await writeFixtureFile(staticDir, "assets/runtime.a1b2c3d4.js", "export const runtime = 1;\n");
    await writeFixtureFile(staticDir, "assets/styles.a1b2c3d4.css", css);
    await writeFixtureFile(staticDir, "assets/vendor.0123456789abcdef.a1b2c3d4.deadbeef.js", "export const vendor = 1;\n");
    await writeFixtureFile(staticDir, "assets/modules/src/helper.c3d4e5f6.js", "export const helper = 1;\n");
    await writeFixtureFile(staticDir, "assets/vendor.aaaaaaaaaaaaaaaa.bbbbbbbb.cccccccc.js", vendor);
    await writeFixtureFile(staticDir, "assets/vendor-chunks/lib-AbcdEfgh.js", "export const chunk = 1;\n");
    await writeFixtureFile(staticDir, "assets/fonts/font.d4e5f6a7.css", "/* font */\n");
    await writeFixtureFile(staticDir, "assets/fonts/mark.e5f6a7b8.woff2", "woff");
    await writeFixtureFile(staticDir, "assets/router.dev.js", "export const router = 1;\n");
    await writeFixtureFile(staticDir, "assets/evil.a1b2c3d4.js", "export const evil = 1;\n");
    await writeFixtureFile(staticDir, "assets/router-manifest.json", "{}\n");
    await writeFixtureFile(staticDir, "app.js", "export const app = 1;\n");

    const immutable = await collectImmutableAssetPaths({
      staticDir,
      basePath: "/docs",
      bundlerManifest: {
        entry: "/docs/assets/runtime.a1b2c3d4.js",
        css: "/docs/assets/styles.a1b2c3d4.css",
        vendor: "/docs/assets/vendor.0123456789abcdef.a1b2c3d4.deadbeef.js",
        router: "/docs/assets/router.dev.js",
        chunks: {
          "/": "/docs/assets/index.b2c3d4e5.js",
        },
      },
    });

    expect(isContentHashedAssetPath("/docs/assets/runtime.a1b2c3d4.js")).toBe(true);
    expect(isContentHashedAssetPath("/docs/assets/router.dev.js")).toBe(false);
    expect(isContentHashedAssetPath("/app.a1b2c3d4.js")).toBe(false);
    expect(immutable).toEqual([
      "/docs/assets/fonts/font.d4e5f6a7.css",
      "/docs/assets/fonts/mark.e5f6a7b8.woff2",
      "/docs/assets/index.b2c3d4e5.js",
      "/docs/assets/modules/src/helper.c3d4e5f6.js",
      "/docs/assets/runtime.a1b2c3d4.js",
      "/docs/assets/styles.a1b2c3d4.css",
      "/docs/assets/vendor-chunks/lib-AbcdEfgh.js",
      "/docs/assets/vendor.0123456789abcdef.a1b2c3d4.deadbeef.js",
      "/docs/assets/vendor.aaaaaaaaaaaaaaaa.bbbbbbbb.cccccccc.js",
    ]);

    const expanded = expandImmutableRequestPaths(immutable, "/docs");
    expect(expanded).toContain("/assets/modules/src/helper.c3d4e5f6.js");
    expect(expanded).toContain("/docs/assets/modules/src/helper.c3d4e5f6.js");

    const userHeaders = [
      "# keep me",
      "/custom",
      "  X-Zenith-Test: keep",
      "/docs/assets/runtime.a1b2c3d4.js",
      "  Cache-Control: public, max-age=60",
    ].join("\n");
    const merged = mergeNetlifyHeaders(userHeaders, expanded);
    expect(merged).toContain("# keep me");
    expect(merged).toContain("/custom");
    expect(merged).toContain("  X-Zenith-Test: keep");
    expect(merged).toContain("  Cache-Control: public, max-age=60");
    expect(merged).toContain("/docs/assets/modules/src/helper.c3d4e5f6.js\n  Cache-Control: public, max-age=31536000, immutable");
    expect(merged).toContain("/assets/modules/src/helper.c3d4e5f6.js\n  Cache-Control: public, max-age=31536000, immutable");
    expect(merged).not.toContain("/docs/assets/runtime.a1b2c3d4.js\n  Cache-Control: public, max-age=31536000, immutable");
    expect(merged.indexOf("/docs/assets/modules/src/helper.c3d4e5f6.js")).toBeLessThan(merged.indexOf("# keep me"));
    expect(merged.trimEnd().endsWith("/*\n  Cache-Control: public, max-age=0, must-revalidate")).toBe(true);
    expect(mergeNetlifyHeaders(merged, expanded)).toBe(merged);
    expect(merged).not.toContain("router-manifest.json");
  });
});
