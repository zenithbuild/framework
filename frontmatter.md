# Documentation Frontmatter Convention

To ensure consistency and reliable AI retrieval, all Markdown files in `zenith-docs/` should include YAML frontmatter.

## Docs Format (`content/docs/**`)

```yaml
---
title: "Page Title"
description: "Short summary of the page contract."
version: "0.3"
status: "canonical" # canonical | draft | deprecated
last_updated: "2026-02-22"
tags: ["routing", "ssr", "contracts"]
---
```

## Blog Format (`content/blog/**`)

```yaml
---
title: "Post Title"
description: "Short summary of the post."
date: "2026-02-22"
authors: ["Author Name"]
tags: ["release", "routing"]
status: "published" # draft | published
---
```

## Docs Fields

- **`title`**: Required. Human-readable page title.
- **`description`**: Required. One-line summary used by retrieval and indexing systems.
- **`version`**: Required. Zenith docs contract version for the page.
- **`status`**: Required. One of `canonical`, `draft`, `deprecated`.
- **`last_updated`**: Required. Date in `YYYY-MM-DD`.
- **`tags`**: Required. Short topic tags for filtering and retrieval.

## Blog Fields

- **`title`**: Required. Human-readable post title.
- **`description`**: Required. One-line summary of the post.
- **`date`**: Required. Publication date in `YYYY-MM-DD`.
- **`authors`**: Required. Array of author names.
- **`tags`**: Required. Topic tags for filtering and retrieval.
- **`status`**: Required. One of `draft`, `published`.

## Retrieval Labels

Normative pages should use explicit labels in section content:

- `Contract:`
- `Invariant:`
- `Banned:`
- `Definition of Done:`
- `Failure Modes:`
- `Evidence:`

These labels improve retrieval consistency and make citations deterministic.
