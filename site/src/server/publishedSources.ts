import { readFile } from "node:fs/promises";
import type { BlogPost } from "./postSource";
import type { DocumentationDetail } from "./documentationSource";

let blog: Promise<BlogPost[]> | undefined;
let docs: Promise<DocumentationDetail[]> | undefined;
const useBuiltContent = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

export async function publishedBlogPosts(): Promise<BlogPost[]> {
  if (!useBuiltContent) return (await import("./gitBlogSource")).loadGitBlogPosts();
  blog ??= readFile(new URL("../content/generated/posts.json", import.meta.url), "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => { blog = undefined; throw error; });
  return blog;
}

export async function publishedDocumentation(): Promise<DocumentationDetail[]> {
  if (!useBuiltContent) return (await import("./localDocumentationSource")).discoverLocalDocumentationEntries();
  docs ??= readFile(new URL("../content/generated/docs.json", import.meta.url), "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => { docs = undefined; throw error; });
  return docs;
}
