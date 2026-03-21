import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const contentRoot = path.dirname(fileURLToPath(import.meta.url));

function readJson<T>(relativePath: string): T {
  const filePath = path.join(contentRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const pageIndex = readJson("./pages/index.json");
const pageDocs = readJson("./pages/docs.json");
const pageBlog = readJson("./pages/blog.json");
const pageChangelog = readJson("./pages/changelog.json");
const pageBlogPosts = readJson("./pages/blog-posts.json");
const pageAbout = readJson("./pages/about.json");

const siteNavigation = readJson("./site/navigation.json");
const siteFooter = readJson("./site/footer.json");

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
