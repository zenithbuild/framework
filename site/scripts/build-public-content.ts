import { mkdir, rename, writeFile } from "node:fs/promises";
import { loadSearchIndex } from "../src/server/searchIndexLoader";
import { discoverLocalDocumentationEntries } from "../src/server/localDocumentationSource";
import { loadGitBlogPosts } from "../src/server/gitBlogSource";
import { sitemapXml } from "../src/server/publicFeeds";

async function replaceFile(destination: URL, value: string) {
  const temporary = new URL(destination.href + "." + process.pid + ".tmp");
  await writeFile(temporary, value);
  await rename(temporary, destination);
}

const generated = new URL("../src/content/generated/", import.meta.url);
await mkdir(generated, { recursive: true });
const [docs, posts] = await Promise.all([discoverLocalDocumentationEntries(), loadGitBlogPosts()]);
await Promise.all([
  replaceFile(new URL("docs.json", generated), JSON.stringify(docs)),
  replaceFile(new URL("posts.json", generated), JSON.stringify(posts)),
]);

const output = new URL("../src/public/", import.meta.url);
await mkdir(output, { recursive: true });
const [search, sitemap] = await Promise.all([
  loadSearchIndex(),
  Array.fromAsync(sitemapXml()),
]);
await Promise.all([
  replaceFile(new URL("search-index.json", output), JSON.stringify(search)),
  replaceFile(new URL("sitemap.xml", output), sitemap.join("")),
]);
