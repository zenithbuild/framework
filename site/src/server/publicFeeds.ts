import { configuredSiteOrigin, indexablePublicRoutes } from "../content/site/metadata";
import { loadDocumentationIndexSource } from "./documentationSource";
import { loadBlogIndexSource } from "./postSource";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function absolute(path: string) {
  return escapeXml(new URL(path, configuredSiteOrigin()).href);
}

async function publishedPosts() {
  const { featuredPost, archivePosts } = await loadBlogIndexSource();
  return featuredPost ? [featuredPost, ...archivePosts] : archivePosts;
}

export async function* sitemapXml() {
  const [docs, posts] = await Promise.all([loadDocumentationIndexSource(), publishedPosts()]);
  const paths = new Set(indexablePublicRoutes().map((route) => route.path));
  for (const section of docs.sections) for (const entry of section.entries) paths.add(entry.path);
  for (const post of posts) paths.add(post.path);
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const path of [...paths].sort()) yield "  <url><loc>" + absolute(path) + "</loc></url>\n";
  yield "</urlset>\n";
}

export async function* blogRss() {
  const posts = await publishedPosts();
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>';
  yield "<title>Zenith Blog</title><link>" + absolute("/blog") + "</link><description>Engineering notes from the Zenith framework.</description>";
  yield '<atom:link href="' + absolute("/blog/rss.xml") + '" rel="self" type="application/rss+xml"/>';
  for (const post of posts) {
    const link = absolute(post.canonicalPath || post.path);
    yield "<item><title>" + escapeXml(post.title) + "</title><link>" + link + "</link><guid>" + link + "</guid>";
    yield "<description>" + escapeXml(post.description) + "</description>";
    if (post.publishedAt) yield "<pubDate>" + new Date(post.publishedAt).toUTCString() + "</pubDate>";
    yield "</item>";
  }
  yield "</channel></rss>\n";
}
