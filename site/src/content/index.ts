import { readFileSync } from "node:fs";

function readJson<T>(file: URL): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const pageIndex = readJson(new URL("./pages/index.json", import.meta.url));
const pageDocs = readJson(new URL("./pages/docs.json", import.meta.url));
const pageBlog = readJson(new URL("./pages/blog.json", import.meta.url));
const pageChangelog = readJson(new URL("./pages/changelog.json", import.meta.url));
const pageBlogPosts = readJson(new URL("./pages/blog-posts.json", import.meta.url));
const pageAbout = readJson(new URL("./pages/about.json", import.meta.url));
const siteNavigation = readJson(new URL("./site/navigation.json", import.meta.url));
const siteFooter = readJson(new URL("./site/footer.json", import.meta.url));

export const pageContent = {
  index: pageIndex,
  docs: pageDocs,
  blog: pageBlog,
  changelog: pageChangelog,
  about: pageAbout,
} as const;

export const blogPostContent = pageBlogPosts as const;

export const siteContent = {
  navigation: siteNavigation,
  footer: siteFooter,
} as const;
