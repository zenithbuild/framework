# Documentation Frontmatter Convention

To ensure consistency and reliable AI retrieval, all Markdown files in `zenith-docs/` should include YAML frontmatter.

## Docs Format (`documentation/**`)

```yaml
---
title: "Page Title"
status: "canonical" # canonical | draft | deprecated | internal | archived
description: "Short summary of the page contract." # recommended
version: "0.3" # optional (use either version or since)
since: "0.5.0-beta.2.19" # optional (use either since or version)
last_updated: "2026-02-22" # recommended
tags: ["routing", "ssr", "contracts"] # optional, if present must be an array
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
- **`status`**: Required. One of `canonical`, `draft`, `deprecated`, `internal`, `archived`.
- **`description`**: Recommended. One-line summary used by retrieval and indexing systems.
- **`version`** or **`since`**: Optional, but one is strongly recommended for public docs.
- **`last_updated`**: Recommended. Date in `YYYY-MM-DD`.
- **`tags`**: Optional. If present, it must be an array.

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

## Folder Policy

- `documentation/**` is public rendered docs.
- `documentation/_legacy/**` is archived/internal content and must not appear in nav, search, or AI indexes.
- `internal` and `archived` statuses are reserved for `_legacy`.
