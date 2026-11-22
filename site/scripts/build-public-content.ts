import { mkdir, writeFile } from "node:fs/promises";
import { loadSearchIndex } from "../src/server/searchIndexLoader";
import { sitemapXml } from "../src/server/publicFeeds";

const output = new URL("../src/public/", import.meta.url);
await mkdir(output, { recursive: true });
const [search, sitemap] = await Promise.all([
  loadSearchIndex(),
  Array.fromAsync(sitemapXml()),
]);
await Promise.all([
  writeFile(new URL("search-index.json", output), JSON.stringify(search)),
  writeFile(new URL("sitemap.xml", output), sitemap.join("")),
]);
