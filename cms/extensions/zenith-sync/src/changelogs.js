import semver from "semver";

import { parseFrontmatter, renderMarkdown, extractTitle, extractSummary, excerpt } from "./markdown.js";
import { toBlobUrl } from "./config.js";
import { createTaxonomySync } from "./taxonomy.js";

export async function syncChangelogs({ accountability, services, getSchema, config, source, changelogDates }) {
  const schema = await getSchema();
  const items = new services.ItemsService("changelogs", {
    accountability,
    schema,
  });
  const taxonomy = await createTaxonomySync({
    accountability,
    services,
    schema,
  });
  const categoryRef = await taxonomy.ensureCategory({
    scope: "changelogs",
    slug: "release-notes",
    title: "Release Notes",
    description: "Repo-synced framework release notes and changelog entries.",
    routeBase: "/blog",
    order: 10,
    status: "active",
  });

  const files = await source.listChangelogFiles(config);
  const existing = await items.readByQuery({
    limit: -1,
    fields: ["id", "source_path", "source_kind", "status"],
  });

  const existingByPath = new Map(
    (existing || [])
      .filter((item) => item.source_kind === "repo_sync" && item.source_path)
      .map((item) => [item.source_path, item]),
  );

  const orderedFiles = files
    .map((file) => ({ ...file, version: extractVersion(file.path) }))
    .sort((left, right) => semver.rcompare(normalizeVersion(left.version), normalizeVersion(right.version)));

  const seenPaths = new Set();
  const result = {
    scope: "changelogs",
    totalFiles: orderedFiles.length,
    created: 0,
    updated: 0,
    archived: 0,
    skippedConflicts: 0,
    errors: [],
  };

  for (const [index, file] of orderedFiles.entries()) {
    seenPaths.add(file.path);

    try {
      const raw = await source.githubText(config, file.path);
      const { data, content } = parseFrontmatter(raw);
      const cleaned = content.trimStart();
      const title = data.title || extractTitle(cleaned, `Zenith ${file.version}`);
      const summary = data.summary || data.description || extractSummary(cleaned, "");
      const description = excerpt(summary, 180);
      const payload = {
        title,
        slug: deriveChangelogSlug(file.path),
        version: file.version,
        description,
        markdown_raw: cleaned,
        wysiwyg_content: null,
        html_rendered: renderMarkdown(cleaned),
        source_kind: "repo_sync",
        source_path: file.path,
        source_sha: file.sha,
        source_url: toBlobUrl(config, file.path),
        status: "published",
        editor_mode: "markdown",
        category_ref: categoryRef,
        sort: (index + 1) * 10,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        published_at: changelogDates.get(file.version) || null,
        seo: {
          title: `${title} | Zenith Changelog`,
          meta_description: description,
        },
      };

      const existingItem = existingByPath.get(file.path);
      if (existingItem) {
        await items.updateOne(existingItem.id, payload);
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
        await items.createOne(payload);
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

function extractVersion(path) {
  const fileName = path.split("/").pop() || "";
  return fileName.replace(/\.md$/, "").replace(/^v/i, "");
}

function normalizeVersion(version) {
  return semver.coerce(version)?.version || version;
}

function deriveChangelogSlug(path) {
  const fileName = path.split("/").pop() || "";
  return fileName.replace(/\.md$/, "").replace(/\./g, "-");
}
