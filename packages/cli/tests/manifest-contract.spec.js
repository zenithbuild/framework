import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeBuildOutputManifest } from "../src/build-output-manifest.js";

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
});
