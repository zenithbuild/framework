# Zenith Documentation

The canonical source of truth for Zenith documentation, changelogs, and release alignment.

## Structure

- **`documentation/`**: Filesystem docs source (contracts, references, guides, contributing, legacy inventory).
- **`blog/`**: Filesystem blog source (`.mdx` posts).
- **`frontmatter.md`**: Required metadata schema for docs/blog content.
- **`documentation/`**: Legacy docs backlog being rewritten/deprecated by inventory policy.
- **`public/llms.txt`**: AI retrieval entrypoint.
- **`public/ai/`**: Deterministic AI index artifacts.
- **`VERSIONING.md`**: Conceptual overview of version visibility.

## Frontmatter Convention

All Markdown files should include YAML frontmatter:

```yaml
---
title: "Page Title"
description: "What this page defines."
version: "0.3"
status: "canonical" # canonical | draft | deprecated
last_updated: "2026-02-22"
tags: ["contracts", "routing"]
---
```

## AI Endpoints

Generate AI retrieval artifacts with:

```sh
node scripts/generate-ai-endpoints.mjs
```

This writes:

- `public/llms.txt`
- `public/ai/docs.manifest.json`
- `public/ai/docs.index.jsonl`
- `public/ai/docs.sitemap.json`
- `public/ai/docs.nav.json`
- `public/rss.xml`

For CI drift checks:

```sh
node scripts/generate-ai-endpoints.mjs --check
node scripts/check-docs-integrity.mjs
```

The integrity check validates:

- Required frontmatter on every canonical docs/blog file.
- `llms.txt` links resolve to existing docs files.
- Canonical docs are present in manifest and section index chunks.
- Forbidden legacy syntax does not appear in canonical content.

## Contributing

Please follow `CONTRIBUTING.md` and `STYLEGUIDE.md` when adding or modifying documentation.

## License

This project is licensed under the MIT License.
