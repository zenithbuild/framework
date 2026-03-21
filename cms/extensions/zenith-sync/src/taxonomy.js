export async function createTaxonomySync({ accountability, services, schema }) {
  const capabilities = {
    categories: hasCollection(schema, "categories"),
    tags: hasCollection(schema, "tags"),
    documentationTags: hasCollection(schema, "documentation_tags"),
  };

  if (!capabilities.categories && !capabilities.tags) {
    return noopTaxonomy();
  }

  const categories = capabilities.categories
    ? new services.ItemsService("categories", { accountability, schema })
    : null;
  const tags = capabilities.tags
    ? new services.ItemsService("tags", { accountability, schema })
    : null;
  const documentationTags = capabilities.documentationTags
    ? new services.ItemsService("documentation_tags", { accountability, schema })
    : null;

  const categoryCache = new Map();
  const tagCache = new Map();
  const categoriesByKey = capabilities.categories
    ? await loadCategoryCache(categories)
    : new Map();
  const tagsBySlug = capabilities.tags
    ? await loadTagCache(tags)
    : new Map();

  return {
    async ensureCategory(record) {
      if (!categories) return null;
      const key = `${record.scope}:${record.slug}`;
      if (categoryCache.has(key)) return categoryCache.get(key);
      const existing = categoriesByKey.get(key);
      const payload = {
        slug: record.slug,
        title: record.title,
        description: record.description || null,
        scope: record.scope,
        route_base: record.routeBase,
        order: record.order ?? null,
        status: mergeCategoryStatus(existing?.status, record.status),
      };
      if (existing) {
        await categories.updateOne(existing.id, payload);
        categoriesByKey.set(key, { id: existing.id, status: payload.status });
        categoryCache.set(key, existing.id);
        return existing.id;
      }
      const created = await categories.createOne(payload);
      const id = typeof created === "object" && created !== null ? created.id : created;
      categoriesByKey.set(key, { id, status: payload.status });
      categoryCache.set(key, id);
      return id;
    },

    async syncDocumentationTags(documentationId, rawTags) {
      if (!tags || !documentationTags) return;
      const desiredIds = [];
      for (const value of normalizeTags(rawTags)) {
        let existing = tagCache.get(value.slug) || tagsBySlug.get(value.slug);
        if (!existing) {
          const created = await tags.createOne({
            slug: value.slug,
            title: value.title,
            color: null,
            order: null,
            status: "active",
          });
          const id = typeof created === "object" && created !== null ? created.id : created;
          existing = { id };
          tagsBySlug.set(value.slug, existing);
        }
        tagCache.set(value.slug, existing);
        desiredIds.push(Number(existing.id));
      }

      const current = await documentationTags.readByQuery({
        limit: -1,
        fields: ["id", "documentation", "tag"],
        filter: { documentation: { _eq: documentationId } },
      });
      const currentIds = new Map((current || []).map((entry) => [Number(entry.tag), entry.id]));

      for (const [index, tagId] of desiredIds.entries()) {
        if (currentIds.has(tagId)) continue;
        await documentationTags.createOne({
          documentation: documentationId,
          tag: tagId,
          sort: (index + 1) * 10,
        });
      }

      for (const [tagId, junctionId] of currentIds.entries()) {
        if (!desiredIds.includes(tagId)) {
          await documentationTags.deleteOne(junctionId);
        }
      }
    },
  };
}

function noopTaxonomy() {
  return {
    ensureCategory: async () => null,
    syncDocumentationTags: async () => {},
  };
}

function hasCollection(schema, collection) {
  return Boolean(schema?.collections?.[collection] || schema?.[collection]);
}

async function loadCategoryCache(service) {
  const items = await service.readByQuery({ limit: -1, fields: ["id", "slug", "scope", "status"] });
  return new Map((items || []).map((item) => [`${item.scope}:${item.slug}`, { id: item.id, status: item.status }]));
}

async function loadTagCache(service) {
  const items = await service.readByQuery({ limit: -1, fields: ["id", "slug"] });
  return new Map((items || []).map((item) => [item.slug, { id: item.id }]));
}

function normalizeTags(rawTags) {
  return [...new Set((rawTags || []).map((value) => slugify(value)).filter(Boolean))].map((slug) => ({
    slug,
    title: humanize(slug),
  }));
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mergeCategoryStatus(existingStatus, nextStatus) {
  if (existingStatus === "active" || nextStatus === "active") return "active";
  if (existingStatus === "archived" || nextStatus === "archived") return "archived";
  return nextStatus || existingStatus || "active";
}
