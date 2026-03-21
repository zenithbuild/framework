import YAML from "yaml";

export async function githubJson(config, path) {
  const url = `${config.github.apiBase}${path}`;
  const response = await fetch(url, {
    headers: githubHeaders(config),
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

export async function githubText(config, path) {
  const url = `https://raw.githubusercontent.com/${config.github.owner}/${config.github.repo}/${config.github.ref}/${path}`;
  const response = await fetch(url, {
    headers: githubHeaders(config),
  });
  if (!response.ok) {
    throw new Error(`GitHub raw request failed (${response.status}) for ${path}`);
  }
  return response.text();
}

function githubHeaders(config) {
  const headers = {
    "User-Agent": "zenith-directus-sync",
    Accept: "application/vnd.github+json",
  };

  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }

  return headers;
}

export async function listDocumentationFiles(config) {
  const tree = await githubJson(
    config,
    `/repos/${config.github.owner}/${config.github.repo}/git/trees/${encodeURIComponent(config.github.ref)}?recursive=1`,
  );

  return (tree.tree || [])
    .filter((entry) => entry.type === "blob")
    .filter((entry) => entry.path.startsWith("docs/documentation/"))
    .filter((entry) => entry.path.endsWith(".md"))
    .filter((entry) => entry.path !== "docs/documentation/_inventory.md")
    .map((entry) => ({
      path: entry.path,
      sha: entry.sha,
    }));
}

export async function listChangelogFiles(config) {
  const tree = await githubJson(
    config,
    `/repos/${config.github.owner}/${config.github.repo}/git/trees/${encodeURIComponent(config.github.ref)}?recursive=1`,
  );

  return (tree.tree || [])
    .filter((entry) => entry.type === "blob")
    .filter((entry) => entry.path.startsWith("docs/changelog/"))
    .filter((entry) => entry.path.endsWith(".md"))
    .map((entry) => ({
      path: entry.path,
      sha: entry.sha,
    }));
}

export async function loadDocsNav(config) {
  const raw = await githubText(config, "docs/public/ai/docs.nav.json");
  return JSON.parse(raw);
}

export async function loadDocumentationTagMap(config) {
  const raw = await githubText(config, "docs/public/ai/docs.index.jsonl");
  const tagsByDoc = new Map();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = JSON.parse(trimmed);
    if (!record.doc || !Array.isArray(record.tags)) continue;
    const next = tagsByDoc.get(record.doc) || new Set();
    for (const tag of record.tags) {
      const normalized = String(tag || "").trim().toLowerCase();
      if (normalized) next.add(normalized);
    }
    tagsByDoc.set(record.doc, next);
  }

  return new Map([...tagsByDoc.entries()].map(([doc, tags]) => [doc, [...tags].sort((a, b) => a.localeCompare(b))]));
}

export async function loadCategoryMeta(config, category) {
  if (!category || category === "root" || category === "legacy") return null;
  try {
    const raw = await githubText(config, `docs/documentation/${category}/_category.yml`);
    return YAML.parse(raw) || null;
  } catch {
    return null;
  }
}

export async function loadRootChangelog(config) {
  return githubText(config, "CHANGELOG.md");
}
