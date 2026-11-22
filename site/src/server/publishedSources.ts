import { readFile } from "node:fs/promises";
import type { BlogPost } from "./postSource";
import type { DocumentationDetail } from "./documentationSource";

let blog: Promise<BlogPost[]> | undefined;
let docs: Promise<DocumentationDetail[]> | undefined;
const immutableBuild = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

export async function publishedBlogPosts(): Promise<BlogPost[]> {
  if (immutableBuild && blog) return blog;
  blog = readFile(new URL("../content/generated/posts.json", import.meta.url), "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => { blog = undefined; throw error; });
  return blog;
}

export async function publishedDocumentation(): Promise<DocumentationDetail[]> {
  if (immutableBuild && docs) return docs;
  docs = readFile(new URL("../content/generated/docs.json", import.meta.url), "utf8")
    .then((text) => JSON.parse(text))
    .catch((error) => { docs = undefined; throw error; });
  return docs;
}
