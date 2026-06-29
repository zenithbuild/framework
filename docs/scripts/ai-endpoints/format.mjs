export function anchorize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function sectionChunks(body) {
  const lines = body.split("\n");
  const sections = [];
  let heading = "Overview";
  let bucket = [];

  const flush = () => {
    const text = bucket.join("\n").trim();
    if (!text) {
      bucket = [];
      return;
    }
    sections.push({ heading, text });
    bucket = [];
  };

  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      continue;
    }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flush();
      heading = h2[1].trim();
      continue;
    }
    bucket.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [{ heading: "Overview", text: body.trim() }];
  }

  return sections;
}

export function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function xmlEscape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRss(posts) {
  const published = posts
    .filter((post) => post.meta.status === "published")
    .sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));

  const items = published
    .map((post) => {
      const title = xmlEscape(post.meta.title);
      const description = xmlEscape(post.meta.description);
      const link = xmlEscape(post.url);
      const pubDate = new Date(`${post.meta.date}T00:00:00Z`).toUTCString();
      return [
        "    <item>",
        `      <title>${title}</title>`,
        `      <link>${link}</link>`,
        `      <guid>${link}</guid>`,
        `      <description>${description}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "  <channel>",
    "    <title>Zenith Blog</title>",
    "    <link>/blog</link>",
    "    <description>Zenith framework updates and release notes.</description>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function llmsTxt(nav) {
  const lines = [
    "# llms.txt for Zenith Docs",
    "Project: Zenith (compiler-first UI)",
    "Docs: /docs",
    "",
    "Start here (ordered):",
  ];

  for (const category of nav.categories) {
    lines.push(`- ${category.title}:`);
    for (const doc of category.docs) {
      lines.push(`  - ${doc.url}`);
    }
  }

  lines.push(
    "",
    "Machine-readable:",
    "- /ai/docs.manifest.json",
    "- /ai/docs.index.jsonl",
    "- /ai/docs.sitemap.json",
    "- /ai/docs.nav.json",
    "",
  );

  return lines.join("\n");
}
