#!/usr/bin/env node

import { readFileSync } from "node:fs";

const ENV_PATH = new URL("../.env", import.meta.url);
const DOCS_INDEX_PATH = new URL("../../docs/public/ai/docs.index.jsonl", import.meta.url);

const CATEGORY_STATUS_CHOICES = [{ text: "Active", value: "active", icon: "folder_open" }, { text: "Archived", value: "archived", icon: "inventory_2" }];
const CATEGORY_SCOPE_CHOICES = [{ text: "Documentation", value: "documentation" }, { text: "Posts", value: "posts" }, { text: "Changelogs", value: "changelogs" }];

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
    if (!response.ok) throw new Error(`Login failed: ${JSON.stringify(payload)}`);
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
    if (!response.ok) throw new Error(`${method} ${path} failed: ${text}`);
    return payload?.data ?? null;
  }

  async listCollections() {
    return this.request("GET", "/collections?limit=-1");
  }

  async listFields(collection) {
    return this.request("GET", `/fields/${collection}?fields=*.*`);
  }

  async listRelations(collection) {
    return this.request("GET", `/relations/${collection}`);
  }

  async queryItems(collection, query = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? -1));
    for (const field of query.fields || []) params.append("fields[]", field);
    for (const [key, value] of Object.entries(query.filter || {})) {
      params.set(key, String(value));
    }
    return this.request("GET", `/items/${collection}?${params.toString()}`);
  }

  async ensureCollection(spec) {
    const collections = await this.listCollections();
    const existing = collections.find((entry) => entry.collection === spec.collection);
    const payload = { collection: spec.collection, meta: spec.meta, schema: { name: spec.collection } };
    if (existing) return this.request("PATCH", `/collections/${spec.collection}`, payload);
    return this.request("POST", "/collections", payload);
  }

  async ensureField(collection, spec) {
    const fields = await this.listFields(collection);
    const existing = fields.find((entry) => entry.field === spec.field);
    if (existing) return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
    try {
      return await this.request("POST", `/fields/${collection}`, spec);
    } catch (error) {
      if (String(error.message || error).includes("already exists")) {
        return this.request("PATCH", `/fields/${collection}/${spec.field}`, spec);
      }
      throw error;
    }
  }

  async ensureRelation(spec) {
    const existing = await this.listRelations(spec.collection);
    const match = existing.find((entry) => entry.field === spec.field);
    const payload = {
      collection: spec.collection,
      field: spec.field,
      related_collection: spec.related_collection,
      meta: spec.meta,
      schema: spec.schema,
    };
    if (match) return this.request("PATCH", `/relations/${spec.collection}/${spec.field}`, payload);
    return this.request("POST", "/relations", payload);
  }

  async upsertByFilters(collection, filters, payload) {
    const existing = await this.queryItems(collection, { limit: 1, fields: ["id"], filter: filters });
    if (existing[0]) {
      await this.request("PATCH", `/items/${collection}/${existing[0].id}`, payload);
      return existing[0].id;
    }
    const created = await this.request("POST", `/items/${collection}`, payload);
    return typeof created === "object" && created !== null ? created.id : created;
  }
}

function groupAliasMeta(interfaceId, extra = {}) {
  return { interface: interfaceId, special: ["alias", "no-data", "group"], ...extra };
}

function readonlyWhenRepoSync() {
  return [{ name: "Readonly when source_kind = repo_sync", readonly: true, rule: { _and: [{ source_kind: { _eq: "repo_sync" } }] } }];
}

function visibleCollectionMeta(collection, icon, note, sortField = "order") {
  return {
    collection,
    meta: {
      icon,
      note,
      hidden: false,
      singleton: false,
      sort_field: sortField,
      display_template: "{{title}}",
      accountability: "all",
      group: "website",
      collapse: "open",
      archive_field: "status",
      archive_app_filter: true,
      archive_value: "archived",
      unarchive_value: "active",
    },
  };
}

function hiddenCollectionMeta(collection, icon, note, sortField = "sort") {
  return {
    collection,
    meta: {
      icon,
      note,
      hidden: true,
      singleton: false,
      sort_field: sortField,
      display_template: null,
      accountability: "all",
      group: "website",
      collapse: "closed",
    },
  };
}

function taxonomyTabField(sort) {
  return {
    field: "meta_taxonomy",
    type: "alias",
    meta: groupAliasMeta("group-raw", {
      sort,
      width: "full",
      group: "meta_tabs",
      translations: [{ language: "en-US", translation: "Taxonomy" }],
    }),
  };
}

function relationField(field, sort, scope, note) {
  return {
    field,
    type: "integer",
    meta: {
      interface: "select-dropdown-m2o",
      display: "related-values",
      sort,
      width: "half",
      group: "meta_taxonomy",
      note,
      options: {
        template: "{{ title }}",
        filter: { _and: [{ scope: { _eq: scope } }, { status: { _neq: "archived" } }] },
      },
      conditions: scope === "documentation" || scope === "changelogs" ? readonlyWhenRepoSync() : undefined,
    },
    schema: { data_type: "integer", is_nullable: true, foreign_key_table: "categories", foreign_key_column: "id" },
  };
}

function tagsField(sort) {
  return {
    field: "tags",
    type: "alias",
    meta: {
      interface: "list-m2m",
      special: ["m2m"],
      display: "related-values",
      sort,
      width: "full",
      group: "meta_taxonomy",
      note: "Shared reusable taxonomy tags.",
      options: { layout: "list" },
      conditions: readonlyWhenRepoSync(),
    },
  };
}

function categoryCollectionFields() {
  return [
    { field: "slug", type: "string", meta: { interface: "input", sort: 1, width: "half", note: "Stable route-oriented category slug." }, schema: { data_type: "character varying", max_length: 255, is_nullable: false } },
    { field: "title", type: "string", meta: { interface: "input", sort: 2, width: "half", note: "Editor-facing category title." }, schema: { data_type: "character varying", max_length: 255, is_nullable: false } },
    { field: "scope", type: "string", meta: { interface: "select-dropdown", display: "labels", sort: 3, width: "half", options: { choices: CATEGORY_SCOPE_CHOICES }, note: "Which content surface this category belongs to." }, schema: { data_type: "character varying", max_length: 32, is_nullable: false, default_value: "documentation" } },
    { field: "route_base", type: "string", meta: { interface: "input", sort: 4, width: "half", note: "Route base used when building public paths." }, schema: { data_type: "character varying", max_length: 255, is_nullable: false, default_value: "/docs" } },
    { field: "description", type: "text", meta: { interface: "input-multiline", sort: 5, width: "full", note: "Optional description for future navigation and filtering." }, schema: { data_type: "text", is_nullable: true } },
    { field: "order", type: "integer", meta: { interface: "numeric", sort: 6, width: "half", note: "Canonical ordering within the scoped category list." }, schema: { data_type: "integer", is_nullable: true } },
    { field: "status", type: "string", meta: { interface: "select-dropdown", display: "labels", sort: 7, width: "half", options: { choices: CATEGORY_STATUS_CHOICES }, note: "Archive categories without deleting their history." }, schema: { data_type: "character varying", max_length: 32, is_nullable: false, default_value: "active" } },
    { field: "documentation_items", type: "alias", meta: { interface: "list-o2m", special: ["o2m"], display: "related-values", sort: 8, width: "full", note: "Documentation linked to this category.", options: { layout: "list" } } },
    { field: "post_items", type: "alias", meta: { interface: "list-o2m", special: ["o2m"], display: "related-values", sort: 9, width: "full", note: "Posts linked to this category.", options: { layout: "list" } } },
    { field: "changelog_items", type: "alias", meta: { interface: "list-o2m", special: ["o2m"], display: "related-values", sort: 10, width: "full", note: "Changelog entries linked to this category.", options: { layout: "list" } } },
  ];
}

function tagCollectionFields() {
  return [
    { field: "slug", type: "string", meta: { interface: "input", sort: 1, width: "half" }, schema: { data_type: "character varying", max_length: 255, is_nullable: false } },
    { field: "title", type: "string", meta: { interface: "input", sort: 2, width: "half" }, schema: { data_type: "character varying", max_length: 255, is_nullable: false } },
    { field: "color", type: "string", meta: { interface: "input", sort: 3, width: "half", note: "Optional tag chip color." }, schema: { data_type: "character varying", max_length: 64, is_nullable: true } },
    { field: "order", type: "integer", meta: { interface: "numeric", sort: 4, width: "half" }, schema: { data_type: "integer", is_nullable: true } },
    { field: "status", type: "string", meta: { interface: "select-dropdown", display: "labels", sort: 5, width: "half", options: { choices: CATEGORY_STATUS_CHOICES } }, schema: { data_type: "character varying", max_length: 32, is_nullable: false, default_value: "active" } },
    { field: "documentation_items", type: "alias", meta: { interface: "list-m2m", special: ["m2m"], display: "related-values", sort: 6, width: "full", options: { layout: "list" } } },
    { field: "post_items", type: "alias", meta: { interface: "list-m2m", special: ["m2m"], display: "related-values", sort: 7, width: "full", options: { layout: "list" } } },
  ];
}

function junctionFields(contentField, contentType) {
  return [
    { field: contentField, type: contentType, meta: { interface: "select-dropdown-m2o", special: ["m2o"], sort: 1, width: "half", options: { template: "{{ title }}" } }, schema: { data_type: contentType === "uuid" ? "uuid" : "integer", is_nullable: true } },
    { field: "tag", type: "integer", meta: { interface: "select-dropdown-m2o", special: ["m2o"], sort: 2, width: "half", options: { template: "{{ title }}" } }, schema: { data_type: "integer", is_nullable: true } },
    { field: "sort", type: "integer", meta: { interface: "numeric", sort: 3, width: "half", hidden: true }, schema: { data_type: "integer", is_nullable: true } },
  ];
}

function categoryRelationSpec(collection, field, oneField) {
  return {
    collection,
    field,
    related_collection: "categories",
    meta: { many_collection: collection, many_field: field, one_collection: "categories", one_field: oneField, one_deselect_action: "nullify" },
    schema: { table: collection, column: field, foreign_key_schema: "public", foreign_key_table: "categories", foreign_key_column: "id", on_update: "NO ACTION", on_delete: "SET NULL" },
  };
}

function junctionRelationSpec(junctionCollection, contentField, contentCollection, contentOneField) {
  return {
    collection: junctionCollection,
    field: contentField,
    related_collection: contentCollection,
    meta: { many_collection: junctionCollection, many_field: contentField, one_collection: contentCollection, one_field: contentOneField, junction_field: "tag", sort_field: "sort", one_deselect_action: "delete" },
    schema: { table: junctionCollection, column: contentField, foreign_key_schema: "public", foreign_key_table: contentCollection, foreign_key_column: "id", on_update: "NO ACTION", on_delete: "CASCADE" },
  };
}

function tagRelationSpec(junctionCollection, contentField, tagOneField) {
  return {
    collection: junctionCollection,
    field: "tag",
    related_collection: "tags",
    meta: { many_collection: junctionCollection, many_field: "tag", one_collection: "tags", one_field: tagOneField, junction_field: contentField, sort_field: "sort", one_deselect_action: "delete" },
    schema: { table: junctionCollection, column: "tag", foreign_key_schema: "public", foreign_key_table: "tags", foreign_key_column: "id", on_update: "NO ACTION", on_delete: "CASCADE" },
  };
}

function readDocsIndexTagMap() {
  const raw = readFileSync(DOCS_INDEX_PATH, "utf8");
  const tagsByDoc = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = JSON.parse(trimmed);
    if (!record.doc || !Array.isArray(record.tags)) continue;
    const next = tagsByDoc.get(record.doc) || new Set();
    for (const tag of record.tags) {
      const normalized = slugify(tag);
      if (normalized) next.add(normalized);
    }
    tagsByDoc.set(record.doc, next);
  }
  return new Map([...tagsByDoc.entries()].map(([doc, set]) => [doc, [...set].sort((a, b) => a.localeCompare(b))]));
}

function slugify(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function humanize(value) {
  return String(value || "").split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const client = new DirectusClient(env.PUBLIC_URL, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  await client.login();

  await client.ensureCollection(visibleCollectionMeta("categories", "folder_copy", "Shared route-aware categories for documentation, posts, and changelogs."));
  await client.ensureCollection(visibleCollectionMeta("tags", "sell", "Shared reusable tags for documentation and posts."));
  await client.ensureCollection(hiddenCollectionMeta("documentation_tags", "join_inner", "Junction collection linking documentation items to shared tags."));
  await client.ensureCollection(hiddenCollectionMeta("post_tags", "join_inner", "Junction collection linking posts to shared tags."));

  for (const spec of categoryCollectionFields()) await client.ensureField("categories", spec);
  for (const spec of tagCollectionFields()) await client.ensureField("tags", spec);
  for (const spec of junctionFields("documentation", "integer")) await client.ensureField("documentation_tags", spec);
  for (const spec of junctionFields("post", "uuid")) await client.ensureField("post_tags", spec);

  await client.ensureField("documentation", taxonomyTabField(4));
  await client.ensureField("posts", taxonomyTabField(3));
  await client.ensureField("changelogs", taxonomyTabField(4));

  await client.ensureField("documentation", relationField("category_ref", 1, "documentation", "Route-aware category relation for this doc."));
  await client.ensureField("posts", relationField("category_ref", 7, "posts", "Primary category relation for this post."));
  await client.ensureField("changelogs", relationField("category_ref", 1, "changelogs", "Grouping category for release notes."));
  await client.ensureField("documentation", tagsField(2));
  await client.ensureField("posts", tagsField(8));

  await client.ensureRelation(categoryRelationSpec("documentation", "category_ref", "documentation_items"));
  await client.ensureRelation(categoryRelationSpec("posts", "category_ref", "post_items"));
  await client.ensureRelation(categoryRelationSpec("changelogs", "category_ref", "changelog_items"));
  await client.ensureRelation(junctionRelationSpec("documentation_tags", "documentation", "documentation", "tags"));
  await client.ensureRelation(tagRelationSpec("documentation_tags", "documentation", "documentation_items"));
  await client.ensureRelation(junctionRelationSpec("post_tags", "post", "posts", "tags"));
  await client.ensureRelation(tagRelationSpec("post_tags", "post", "post_items"));

  await seedCategories(client);
  await backfillDocumentationCategories(client);
  await backfillDocumentationTags(client);
  await backfillChangelogCategories(client);

  console.log("Applied live taxonomy schema and backfilled categories/tags.");
}

async function seedCategories(client) {
  const docs = await client.queryItems("documentation", { fields: ["category", "category_label", "category_order", "status"], limit: -1 });
  const categories = summarizeDocumentationCategories(docs);
  for (const entry of categories.values()) {
    await client.upsertByFilters("categories", { "filter[scope][_eq]": "documentation", "filter[slug][_eq]": entry.slug }, {
      slug: entry.slug,
      title: entry.title,
      description: null,
      scope: "documentation",
      route_base: "/docs",
      order: entry.order,
      status: entry.status,
    });
  }

  for (const seed of [
    ["engineering", "Engineering", "/blog"],
    ["guides", "Guides", "/blog"],
    ["announcements", "Announcements", "/blog"],
    ["releases", "Releases", "/blog"],
  ]) {
    await client.upsertByFilters("categories", { "filter[scope][_eq]": "posts", "filter[slug][_eq]": seed[0] }, {
      slug: seed[0],
      title: seed[1],
      description: null,
      scope: "posts",
      route_base: seed[2],
      order: null,
      status: "active",
    });
  }

  await client.upsertByFilters("categories", { "filter[scope][_eq]": "changelogs", "filter[slug][_eq]": "release-notes" }, {
    slug: "release-notes",
    title: "Release Notes",
    description: "Repo-synced framework release notes and changelog entries.",
    scope: "changelogs",
    route_base: "/blog",
    order: 10,
    status: "active",
  });
}

async function backfillDocumentationCategories(client) {
  const docs = await client.queryItems("documentation", { fields: ["id", "category", "category_label", "category_order", "status"], limit: -1 });
  const categories = summarizeDocumentationCategories(docs);
  for (const entry of docs) {
    const slug = String(entry.category || "").trim();
    if (!slug) continue;
    const summary = categories.get(slug);
    const categoryId = await client.upsertByFilters("categories", { "filter[scope][_eq]": "documentation", "filter[slug][_eq]": slug }, {
      slug,
      title: summary?.title || entry.category_label || humanize(slug),
      description: null,
      scope: "documentation",
      route_base: "/docs",
      order: summary?.order ?? entry.category_order ?? null,
      status: summary?.status || "active",
    });
    await client.request("PATCH", `/items/documentation/${entry.id}`, { category_ref: categoryId });
  }
}

async function backfillDocumentationTags(client) {
  const docs = await client.queryItems("documentation", { fields: ["id", "slug"], limit: -1 });
  const tagsByDoc = readDocsIndexTagMap();
  const existingJunctions = await client.queryItems("documentation_tags", { fields: ["id", "documentation", "tag"], limit: -1 });
  const tagIdBySlug = new Map();
  const existingTags = await client.queryItems("tags", { fields: ["id", "slug", "title"], limit: -1 });
  for (const tag of existingTags) tagIdBySlug.set(tag.slug, tag.id);

  for (const doc of docs) {
    const desired = tagsByDoc.get(doc.slug) || [];
    const desiredIds = [];
    for (const tagSlug of desired) {
      let tagId = tagIdBySlug.get(tagSlug);
      if (!tagId) {
        tagId = await client.upsertByFilters("tags", { "filter[slug][_eq]": tagSlug }, {
          slug: tagSlug,
          title: humanize(tagSlug),
          color: null,
          order: null,
          status: "active",
        });
        tagIdBySlug.set(tagSlug, tagId);
      }
      desiredIds.push(Number(tagId));
    }

    const current = existingJunctions.filter((entry) => Number(entry.documentation) === Number(doc.id));
    const currentIds = new Set(current.map((entry) => Number(entry.tag)));
    for (const [index, tagId] of desiredIds.entries()) {
      if (currentIds.has(tagId)) continue;
      await client.request("POST", "/items/documentation_tags", {
        documentation: doc.id,
        tag: tagId,
        sort: (index + 1) * 10,
      });
    }
    for (const junction of current) {
      if (!desiredIds.includes(Number(junction.tag))) {
        await client.request("DELETE", `/items/documentation_tags/${junction.id}`);
      }
    }
  }
}

async function backfillChangelogCategories(client) {
  const categoryId = await client.upsertByFilters("categories", { "filter[scope][_eq]": "changelogs", "filter[slug][_eq]": "release-notes" }, {
    slug: "release-notes",
    title: "Release Notes",
    description: "Repo-synced framework release notes and changelog entries.",
    scope: "changelogs",
    route_base: "/blog",
    order: 10,
    status: "active",
  });
  const changelogs = await client.queryItems("changelogs", { fields: ["id"], limit: -1 });
  for (const entry of changelogs) {
    await client.request("PATCH", `/items/changelogs/${entry.id}`, { category_ref: categoryId });
  }
}

function summarizeDocumentationCategories(docs) {
  const categories = new Map();
  for (const entry of docs) {
    const slug = String(entry.category || "").trim();
    if (!slug) continue;
    const current = categories.get(slug) || { slug, title: entry.category_label || humanize(slug), order: entry.category_order ?? null, status: "archived" };
    current.title = current.title || entry.category_label || humanize(slug);
    if (current.order == null && entry.category_order != null) current.order = entry.category_order;
    current.status = slug === "legacy" ? "archived" : mergeCategoryStatus(current.status, entry.status === "archived" ? "archived" : "active");
    categories.set(slug, current);
  }
  return categories;
}

function mergeCategoryStatus(existingStatus, nextStatus) {
  return existingStatus === "active" || nextStatus === "active" ? "active" : "archived";
}

main().catch((error) => { console.error(error); process.exit(1); });
