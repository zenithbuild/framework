const PALETTES = {
  blue: {
    background: "#E7F2FF",
    panel: "#F7FBFF",
    border: "#82B7F8",
    ink: "#0F2238",
    accent: "#2F6FD1",
  },
  gold: {
    background: "#F8EFD9",
    panel: "#FFF9ED",
    border: "#D9B257",
    ink: "#2F220B",
    accent: "#8A5B00",
  },
  magenta: {
    background: "#F7E6F5",
    panel: "#FFF6FD",
    border: "#D28CCA",
    ink: "#34142E",
    accent: "#8B2979",
  },
  red: {
    background: "#FBE8E3",
    panel: "#FFF6F2",
    border: "#E29A89",
    ink: "#3B1710",
    accent: "#A63F26",
  },
};

function escapeSvg(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(value, maxChars, maxLines) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current.length > 0 ? `${current} ${word}` : word;
    if (next.length <= maxChars || current.length === 0) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (current.length > 0 && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

export function resolvePostCoverFilename(post) {
  return `zenith-post-${post.slug}.svg`;
}

export function resolvePostCoverTitle(post) {
  return post.cover?.title || post.title;
}

export function buildPostCoverSvg(post) {
  const palette = PALETTES[post.cover?.tone] || PALETTES.blue;
  const eyebrow = escapeSvg(post.cover?.eyebrow || "Zenith Journal");
  const titleLines = wrapLines(resolvePostCoverTitle(post), 18, 3);
  const descriptionLines = wrapLines(
    post.cover?.description || post.excerpt || post.description || "",
    40,
    3,
  );
  const tagLine = wrapLines(Array.isArray(post.tags) ? post.tags.slice(0, 3).join(" / ") : "", 42, 1)[0] || "";

  const titleText = titleLines
    .map(
      (line, index) =>
        `<tspan x="120" dy="${index === 0 ? 0 : 94}">${escapeSvg(line)}</tspan>`,
    )
    .join("");
  const descriptionText = descriptionLines
    .map(
      (line, index) =>
        `<tspan x="120" dy="${index === 0 ? 0 : 38}">${escapeSvg(line)}</tspan>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${escapeSvg(resolvePostCoverTitle(post))}</title>
  <desc id="desc">${escapeSvg(post.cover?.description || post.excerpt || post.description || post.title)}</desc>
  <rect width="1600" height="900" fill="${palette.background}" />
  <rect x="68" y="68" width="1464" height="764" rx="46" fill="${palette.panel}" stroke="${palette.border}" stroke-width="4" />
  <rect x="120" y="118" width="1360" height="664" rx="32" fill="none" stroke="${palette.border}" stroke-opacity="0.35" />
  <rect x="120" y="118" width="184" height="36" rx="18" fill="${palette.accent}" />
  <text x="148" y="142" fill="${palette.panel}" font-family="system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="0.2em">${eyebrow.toUpperCase()}</text>
  <text x="120" y="278" fill="${palette.ink}" font-family="Georgia, serif" font-size="82" font-weight="700">${titleText}</text>
  <text x="120" y="566" fill="${palette.ink}" fill-opacity="0.86" font-family="system-ui, sans-serif" font-size="28">${descriptionText}</text>
  <line x1="120" y1="690" x2="1480" y2="690" stroke="${palette.border}" stroke-width="2" stroke-opacity="0.55" />
  <text x="120" y="740" fill="${palette.accent}" font-family="system-ui, sans-serif" font-size="22" font-weight="700">Zenith</text>
  <text x="252" y="740" fill="${palette.ink}" fill-opacity="0.72" font-family="system-ui, sans-serif" font-size="22">${escapeSvg(post.author?.name || "Zenith Team")}</text>
  <text x="120" y="790" fill="${palette.ink}" fill-opacity="0.68" font-family="system-ui, sans-serif" font-size="22">${escapeSvg(tagLine)}</text>
</svg>`;
}
