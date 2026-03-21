const ROOT_CATEGORY = {
  title: "Core",
  summary: "Root-level documentation and high-signal entry points.",
  order: 5,
};

const LEGACY_CATEGORY = {
  title: "Legacy",
  summary: "Legacy or historical documentation retained for reference.",
  order: 900,
};

export async function createDocumentationOrdering(config, source) {
  const nav = await source.loadDocsNav(config);
  const categoryMeta = new Map();
  const docMeta = new Map();
  let nextCategoryOrder = 1000;

  categoryMeta.set("root", ROOT_CATEGORY);
  categoryMeta.set("legacy", LEGACY_CATEGORY);

  for (const [index, category] of (nav.categories || []).entries()) {
    const order = category.order ?? (index + 1) * 10;
    categoryMeta.set(category.slug, {
      title: category.title,
      summary: category.summary || "",
      order,
    });

    for (const [docIndex, doc] of (category.docs || []).entries()) {
      const sourcePath = `docs/${doc.source_path}`;
      docMeta.set(sourcePath, {
        category: category.slug,
        order: doc.order ?? (docIndex + 1) * 10,
        title: doc.title,
      });
    }
  }

  return {
    async categoryFor(path) {
      const info = deriveCategory(path);
      if (!categoryMeta.has(info.slug)) {
        const dynamic = await source.loadCategoryMeta(config, info.slug);
        if (dynamic) {
          categoryMeta.set(info.slug, {
            title: dynamic.title || titleize(info.slug),
            summary: dynamic.summary || "",
            order: dynamic.order ?? nextCategoryOrder,
          });
          nextCategoryOrder += 10;
        } else {
          categoryMeta.set(info.slug, {
            title: titleize(info.slug),
            summary: "",
            order: nextCategoryOrder,
          });
          nextCategoryOrder += 10;
        }
      }

      return {
        ...info,
        ...(categoryMeta.get(info.slug) || {
          title: titleize(info.slug),
          summary: "",
          order: nextCategoryOrder,
        }),
      };
    },

    docOrderFor(path, frontmatter, title) {
      const navMatch = docMeta.get(path);
      if (navMatch) {
        return navMatch.order;
      }

      const hinted = frontmatter?.nav?.order ?? frontmatter?.nav_order ?? frontmatter?.order;
      if (Number.isFinite(Number(hinted))) return Number(hinted);

      const fileName = path.split("/").pop() || "";
      const prefix = fileName.match(/^(\d+)[-_]/);
      if (prefix) return Number(prefix[1]);

      return title ? stableOrder(title) : stableOrder(path);
    },
  };
}

function deriveCategory(path) {
  const relative = path.replace(/^docs\/documentation\//, "");
  if (!relative.includes("/")) return { slug: "root", legacy: false };

  const parts = relative.split("/");
  if (parts[0] === "_legacy") {
    if (parts.length < 3 || parts[1].endsWith(".md")) {
      return {
        slug: "legacy",
        legacy: true,
      };
    }
    return {
      slug: parts[1] || "legacy",
      legacy: true,
    };
  }

  return {
    slug: parts[0],
    legacy: false,
  };
}

function titleize(slug) {
  return slug
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stableOrder(value) {
  return value
    .toLowerCase()
    .split("")
    .reduce((sum, char, index) => sum + char.charCodeAt(0) + index, 0);
}

export function parseChangelogDates(rootChangelog) {
  const map = new Map();
  const regex = /^## \[(.+?)\] - (\d{4}-\d{2}-\d{2})$/gm;
  let match = regex.exec(rootChangelog);

  while (match) {
    map.set(match[1], match[2]);
    match = regex.exec(rootChangelog);
  }

  return map;
}
