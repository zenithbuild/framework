import { parseFrontmatter, renderMarkdown, extractTitle, extractSummary, excerpt } from "./markdown.js";
import { toBlobUrl } from "./config.js";
import { createTaxonomySync } from "./taxonomy.js";

export async function syncDocumentation({ accountability, services, getSchema, config, source, ordering }) {
  const schema = await getSchema();
  const items = new services.ItemsService("documentation", {
    accountability,
    schema,
  });
  const taxonomy = await createTaxonomySync({
    accountability,
    services,
    schema,
  });

  const files = await source.listDocumentationFiles(config);
  const tagsByDoc = await source.loadDocumentationTagMap(config);
  const existing = await items.readByQuery({
    limit: -1,
    fields: ["id", "source_path", "source_kind", "status"],
  });

  const existingByPath = new Map(
    (existing || [])
      .filter((item) => item.source_kind === "repo_sync" && item.source_path)
      .map((item) => [item.source_path, item]),
  );

  const seenPaths = new Set();
  const result = {
    scope: "documentation",
    totalFiles: files.length,
    created: 0,
    updated: 0,
    archived: 0,
    skippedConflicts: 0,
    errors: [],
  };

  for (const file of files) {
    seenPaths.add(file.path);

    try {
      const raw = await source.githubText(config, file.path);
      const { data, content } = parseFrontmatter(raw);
      const cleaned = content.trimStart();
      const category = await ordering.categoryFor(file.path);
      const routeKey = deriveDocRouteKey(file.path);
      const title = data.title || extractTitle(cleaned, fallbackTitle(file.path));
      const summary = data.summary || data.description || extractSummary(cleaned, "");
      const description = excerpt(summary, 180);
      const docOrder = ordering.docOrderFor(file.path, data, title);
      const publishedAt = data.last_updated || data.published_at || null;
      const legacy = file.path.includes("/_legacy/");
      const slug = deriveDocLeafSlug(routeKey);
      const categoryRef = await taxonomy.ensureCategory({
        scope: "documentation",
        slug: category.slug,
        title: category.title,
        description: category.summary || null,
        routeBase: "/docs",
        order: category.order,
        status: legacy ? "archived" : "active",
      });
      const payload = {
        title,
        slug,
        description,
        markdown_raw: cleaned,
        wysiwyg_content: null,
        html_rendered: renderMarkdown(cleaned),
        source_kind: "repo_sync",
        source_path: file.path,
        source_sha: file.sha,
        source_url: toBlobUrl(config, file.path),
        status: mapDocStatus(data.status, legacy),
        editor_mode: "markdown",
        category: category.slug,
        category_label: category.title,
        category_order: category.order,
        category_ref: categoryRef,
        doc_order: docOrder,
        sort: category.order * 1000 + docOrder,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        published_at: publishedAt,
        seo: {
          title: `${title} | Zenith Documentation`,
          meta_description: description,
        },
      };

      const existingItem = existingByPath.get(file.path);
      if (existingItem) {
        await items.updateOne(existingItem.id, payload);
        await taxonomy.syncDocumentationTags(existingItem.id, tagsByDoc.get(routeKey) || data.tags || []);
        result.updated += 1;
      } else {
        const conflicts = (existing || []).filter(
          (item) => item.source_kind !== "repo_sync" && item.source_path === file.path,
        );
        if (conflicts.length > 0) {
          result.skippedConflicts += 1;
          result.errors.push({
            path: file.path,
            message: "Skipped because a CMS-owned item already uses this source_path.",
          });
          continue;
        }
        const created = await items.createOne(payload);
        const createdId = typeof created === "object" && created !== null ? created.id : created;
        await taxonomy.syncDocumentationTags(createdId, tagsByDoc.get(routeKey) || data.tags || []);
        result.created += 1;
      }
    } catch (error) {
      result.errors.push({
        path: file.path,
        message: String(error.message || error),
      });
      const existingItem = existingByPath.get(file.path);
      if (existingItem) {
        await items.updateOne(existingItem.id, {
          sync_error: String(error.message || error),
          last_synced_at: new Date().toISOString(),
        });
      }
    }
  }

  for (const item of existingByPath.values()) {
    if (seenPaths.has(item.source_path)) continue;
    await items.updateOne(item.id, {
      status: "archived",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    });
    result.archived += 1;
  }

  return result;
}

function fallbackTitle(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapDocStatus(status, legacy) {
  if (legacy) return "archived";
  if (status === "draft") return "draft";
  if (status === "archived") return "archived";
  return "published";
}

function deriveDocRouteKey(path) {
  const relative = path.replace(/^docs\/documentation\//, "").replace(/\.md$/, "");
  if (relative.startsWith("_legacy/")) {
    return `legacy/${relative.replace(/^_legacy\//, "")}`;
  }
  return relative;
}

function deriveDocLeafSlug(routeKey) {
  const parts = String(routeKey || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}
