#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  buildPostCoverSvg,
  resolvePostCoverFilename,
  resolvePostCoverTitle,
} from "./post-cover-assets.mjs";
import {
  authorHrefFieldSpec,
  authorNameFieldSpec,
  authorRoleFieldSpec,
  excerptFieldSpec,
  LEGACY_SAMPLE_POST_SLUGS,
  resolveCategorySlug,
} from "./post-sync-config.mjs";

const ENV_PATH = new URL("../.env", import.meta.url);
const POSTS_PATH = new URL("../../site/src/content/pages/blog-posts.json", import.meta.url);

function loadEnv(fileUrl) {
  return Object.fromEntries(
    readFileSync(fileUrl, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

function loadPosts() {
  const payload = JSON.parse(readFileSync(POSTS_PATH, "utf8"));
  return Array.isArray(payload.posts) ? payload.posts : [];
}

class DirectusClient {
  constructor(baseUrl, email, password) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.password = password;
    this.token = null;
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Login failed: ${JSON.stringify(payload)}`);
    }
    this.token = payload.data.access_token;
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${text}`);
    }
    return payload?.data ?? null;
  }

  async listFields(collection) {
    return this.request("GET", `/fields/${collection}?fields=*.*`);
  }

  async listCollections() {
    return this.request("GET", "/collections?limit=-1");
  }

  async queryItems(collection, query = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? -1));
    for (const field of query.fields || []) {
      params.append("fields[]", field);
    }
    for (const [key, value] of Object.entries(query.filter || {})) {
      params.set(key, String(value));
    }
    for (const sort of query.sort || []) {
      params.append("sort[]", sort);
    }
    return this.request("GET", `/items/${collection}?${params.toString()}`);
  }

  async queryFiles(query = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? -1));
    for (const field of query.fields || []) {
      params.append("fields[]", field);
    }
    for (const [key, value] of Object.entries(query.filter || {})) {
      params.set(key, String(value));
    }
    for (const sort of query.sort || []) {
      params.append("sort[]", sort);
    }
    return this.request("GET", `/files?${params.toString()}`);
  }

  async ensureField(collection, spec) {
    const fields = await this.listFields(collection);
    const existing = fields.find((entry) => entry.field === spec.field);
    if (existing) {
      return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
    }
    return this.request("POST", `/fields/${collection}`, spec);
  }

  async ensureCollectionMeta(collection, metaPatch) {
    const collections = await this.listCollections();
    const existing = collections.find((entry) => entry.collection === collection);
    if (!existing) {
      throw new Error(`Collection "${collection}" not found.`);
    }

    return this.request("PATCH", `/collections/${collection}`, {
      collection,
      meta: {
        ...(existing.meta || {}),
        ...metaPatch,
      },
      schema: {
        name: collection,
      },
    });
  }

  async updateFieldMeta(collection, field, metaPatch) {
    const fields = await this.listFields(collection);
    const existing = fields.find((entry) => entry.field === field);
    if (!existing) {
      throw new Error(`Field "${collection}.${field}" not found.`);
    }

    return this.request("PATCH", `/fields/${collection}/${field}`, {
      field,
      meta: {
        ...(existing.meta || {}),
        ...metaPatch,
      },
    });
  }

  async updateFile(id, payload) {
    return this.request("PATCH", `/files/${id}`, payload);
  }

  async uploadFile({ filename, title, folder, contents, mimeType }) {
    const form = new FormData();
    form.set("title", title);
    if (folder) {
      form.set("folder", folder);
    }
    form.append("file", new Blob([contents], { type: mimeType }), filename);

    const response = await fetch(`${this.baseUrl}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: form,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`POST /files failed: ${text}`);
    }

    return payload?.data ?? null;
  }

  async upsertByFilters(collection, filters, payload) {
    const existing = await this.queryItems(collection, {
      limit: 1,
      fields: ["id"],
      filter: filters,
    });
    if (existing[0]) {
      await this.request("PATCH", `/items/${collection}/${existing[0].id}`, payload);
      return existing[0].id;
    }
    const created = await this.request("POST", `/items/${collection}`, payload);
    return created.id;
  }

  async deleteItem(collection, id) {
    return this.request("DELETE", `/items/${collection}/${id}`);
  }
}

function renderSections(post) {
  const sections = Array.isArray(post.sections) ? post.sections : [];
  if (sections.length === 0) {
    return `<p>${escapeHtml(post.description || post.excerpt || post.title)}</p>`;
  }

  return sections
    .map((section) => {
      if (section.type === "quote") {
        return `<section><blockquote><p>${escapeHtml(section.quote || "")}</p>${section.attribution ? `<footer>${escapeHtml(section.attribution)}</footer>` : ""}</blockquote></section>`;
      }

      if (section.type === "points") {
        const items = (section.items || [])
          .map((item) => `<li><strong>${escapeHtml(item.title || "")}</strong> ${escapeHtml(item.description || "")}</li>`)
          .join("");

        return `<section>${section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}${section.intro ? `<p>${escapeHtml(section.intro)}</p>` : ""}<ul>${items}</ul></section>`;
      }

      const paragraphs = (section.paragraphs || [])
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");

      return `<section>${section.eyebrow ? `<p>${escapeHtml(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}${paragraphs}</section>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureTagIds(client, tagTitles) {
  const ids = [];

  for (const [index, title] of tagTitles.entries()) {
    const slug = slugify(title);
    const tagId = await client.upsertByFilters(
      "tags",
      {
        "filter[slug][_eq]": slug,
      },
      {
        slug,
        title,
        color: null,
        order: index,
        status: "active",
      },
    );
    ids.push(tagId);
  }

  return ids;
}

async function syncPostTags(client, postId, tagIds) {
  const existing = await client.queryItems("post_tags", {
    fields: ["id", "tag"],
    filter: {
      "filter[post][_eq]": postId,
    },
  });

  for (const entry of existing) {
    if (!tagIds.includes(entry.tag)) {
      await client.deleteItem("post_tags", entry.id);
    }
  }

  for (const [index, tagId] of tagIds.entries()) {
    await client.upsertByFilters(
      "post_tags",
      {
        "filter[post][_eq]": postId,
        "filter[tag][_eq]": tagId,
      },
      {
        post: postId,
        tag: tagId,
        sort: index + 1,
      },
    );
  }
}

async function ensureCategories(client) {
  const categories = await client.queryItems("categories", {
    fields: ["id", "slug", "scope", "route_base", "title", "status"],
    filter: {
      "filter[scope][_eq]": "posts",
    },
  });

  const bySlug = new Map(categories.map((entry) => [entry.slug, entry]));

  for (const [slug, title, order] of [
    ["engineering", "Engineering", 10],
    ["guides", "Guides", 20],
    ["announcements", "Announcements", 30],
    ["releases", "Releases", 40],
  ]) {
    if (!bySlug.has(slug)) {
      const id = await client.upsertByFilters(
        "categories",
        {
          "filter[scope][_eq]": "posts",
          "filter[slug][_eq]": slug,
        },
        {
          slug,
          title,
          scope: "posts",
          route_base: "/blog",
          order,
          status: "active",
        },
      );
      bySlug.set(slug, { id, slug, title, route_base: "/blog", status: "active" });
    }
  }

  await client.upsertByFilters(
    "categories",
    {
      "filter[scope][_eq]": "changelogs",
      "filter[slug][_eq]": "release-notes",
    },
    {
      slug: "release-notes",
      title: "Release Notes",
      scope: "changelogs",
      route_base: "/changelog",
      order: 10,
      status: "active",
      description: "Repo-synced framework release notes and changelog entries.",
    },
  );

  return bySlug;
}

async function resolvePostImageFolder(client) {
  const fields = await client.listFields("posts");
  const imageField = fields.find((entry) => entry.field === "image");
  const folder = imageField?.meta?.options?.folder;
  return typeof folder === "string" && folder.length > 0 ? folder : null;
}

function resolveSitePreviewBaseUrl(env) {
  return (env.ZENITH_SITE_PREVIEW_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function ensureCoverImageFile(client, post, folder) {
  const filename = resolvePostCoverFilename(post);
  const title = resolvePostCoverTitle(post);
  const existing = await client.queryFiles({
    limit: 1,
    fields: ["id", "title", "filename_download"],
    filter: {
      "filter[filename_download][_eq]": filename,
    },
  });

  if (existing[0]?.id) {
    await client.updateFile(existing[0].id, {
      title,
      folder,
    });
    return existing[0].id;
  }

  const created = await client.uploadFile({
    filename,
    title,
    folder,
    contents: buildPostCoverSvg(post),
    mimeType: "image/svg+xml",
  });

  return created?.id || null;
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const client = new DirectusClient(env.PUBLIC_URL, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  await client.login();

  await client.ensureCollectionMeta("posts", {
    preview_url: `${resolveSitePreviewBaseUrl(env)}/blog/{{slug}}?preview=true&version={{$version}}`,
  });
  await client.ensureField("posts", excerptFieldSpec());
  await client.ensureField("posts", authorNameFieldSpec());
  await client.ensureField("posts", authorRoleFieldSpec());
  await client.ensureField("posts", authorHrefFieldSpec());
  await client.updateFieldMeta("posts", "image", {
    group: "meta_content",
    sort: 13,
    width: "full",
    note: "Cover image asset used on the public blog index and post detail surfaces.",
  });
  await client.updateFieldMeta("posts", "category_ref", {
    group: "meta_taxonomy",
    note: "Primary editorial lane and future route grouping for this post.",
  });
  await client.updateFieldMeta("posts", "tags", {
    group: "meta_taxonomy",
    note: "Search, SEO, and discovery keywords for this post.",
  });

  const categoriesBySlug = await ensureCategories(client);
  const imageFolder = await resolvePostImageFolder(client);
  const posts = loadPosts();
  const syncedSlugs = new Set(posts.map((post) => post.slug));

  let syncedCount = 0;

  for (const post of posts) {
    const categorySlug = resolveCategorySlug(post);
    const category = categoriesBySlug.get(categorySlug);

    if (!category?.id) {
      throw new Error(`Missing posts category "${categorySlug}" in Directus.`);
    }

    const imageId = await ensureCoverImageFile(client, post, imageFolder);

    const postId = await client.upsertByFilters(
      "posts",
      {
        "filter[slug][_eq]": post.slug,
      },
      {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || post.description || post.title,
        description: post.description || post.excerpt || post.title,
        content: renderSections(post),
        published_at: post.publishedAt || null,
        status: "published",
        author_name: post.author?.name || "Zenith Team",
        author_role: post.author?.role || category.title,
        author_href: post.author?.href || null,
        category_ref: category.id,
        image: imageId,
      },
    );

    const tagIds = await ensureTagIds(client, Array.isArray(post.tags) ? post.tags : []);
    await syncPostTags(client, postId, tagIds);
    syncedCount += 1;
  }

  for (const slug of LEGACY_SAMPLE_POST_SLUGS) {
    if (syncedSlugs.has(slug)) {
      continue;
    }

    const existing = await client.queryItems("posts", {
      limit: 1,
      fields: ["id"],
      filter: {
        "filter[slug][_eq]": slug,
      },
    });

    if (existing[0]?.id) {
      await client.request("PATCH", `/items/posts/${existing[0].id}`, {
        status: "archived",
      });
    }
  }

  console.log(`Synced ${syncedCount} Zenith posts into Directus.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
