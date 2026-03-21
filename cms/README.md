# Zenith Studio CMS

Local Directus studio for Zenith editorial work. The current public site still reads its existing repo-side content boundary; this `cms/` workspace is for schema, editorial UX, AI workflows, and sync refinement.

## Current Focus

- Repo-synced `documentation` and `changelogs` stay markdown-first.
- `markdown_raw` is canonical for imported docs/changelogs.
- `html_rendered` stays derived and hidden/readonly in Studio.
- CMS-authored `posts` and `documentation` can use either Markdown or WYSIWYG.

## Useful Commands

From `/Users/judahsullivan/Personal/zenithbuild-monorepo/cms`:

```bash
bun run build-extensions
bun run refine:documentation
node ./scripts/apply-repo-sync.mjs
node ./scripts/apply-live-taxonomy.mjs
node ./scripts/run-repo-sync.mjs documentation
node ./scripts/run-repo-sync.mjs changelogs
```

`refine:documentation` patches the local Directus metadata in `database/data.db` to keep the documentation collection aligned with the current editorial UX rules.

`apply-repo-sync.mjs` provisions the hidden sync fields plus the manual/scheduled Directus flows for repo-backed documentation and changelog imports.

`apply-live-taxonomy.mjs` provisions the visible shared `categories` and `tags` collections, the docs/post tag junctions, and the category relation fields used by documentation, posts, and changelogs.

`run-repo-sync.mjs` manually triggers one sync scope at a time for verification. It prefers the clean `/zenith-sync/...` endpoint and falls back to the older scoped endpoint only if the server still returns `404` during a rollout window.

## Repo Sync Workflows

### Documentation sync

- Source of truth: `docs/documentation/**/*.md`
- Included: current docs plus `_legacy/**`
- Excluded intentionally: `docs/documentation/_inventory.md`
- Legacy category behavior:
  - `_legacy/deep-dive/**` and `_legacy/performance/**` stay included
  - legacy one-off root files like `_legacy/onboarding.md` sync into the `legacy` bucket instead of becoming fake categories
- Canonical ordering:
  1. `docs/public/ai/docs.nav.json`
  2. `_category.yml`
  3. frontmatter order hints / numeric filename prefixes
  4. stable fallback ordering
- Upsert key: `source_path` on items where `source_kind=repo_sync`
- Stale repo-owned items are archived, not deleted, and do not count as sync errors

Stored fields:

- `markdown_raw`: cleaned markdown body only
- `html_rendered`: derived HTML, hidden/readonly
- `category`, `category_label`, `category_order`, `doc_order`
- `source_path`, `source_sha`, `source_url`
- `last_synced_at`, `sync_error`

### Changelog sync

- Source of truth: `docs/changelog/*.md`
- Root `CHANGELOG.md` is metadata input only and is used to derive release dates
- Ordering: semantic version descending
- Upsert key: `source_path` on items where `source_kind=repo_sync`
- Stale repo-owned items are archived, not deleted, and do not count as sync errors

Stored fields:

- `markdown_raw`: cleaned markdown body only
- `html_rendered`: derived HTML, hidden/readonly
- `version`, `sort`, `published_at`
- `source_path`, `source_sha`, `source_url`
- `last_synced_at`, `sync_error`

### Frontmatter cleanup

Repo sync strips only the canonical top frontmatter block:

- if a markdown file starts with `---` and has a matching closing `---`, that YAML block is parsed and removed from `markdown_raw`
- structured frontmatter values are mapped into fields like `title`, `description`, status/order hints, and dates where applicable
- thematic breaks or later `---` content inside the document body are preserved

### Ownership and overwrite rules

- Repo sync only creates/updates items with `source_kind=repo_sync`
- CMS-authored items (`cms_manual`, `cms_ai`) are never overwritten by repo sync
- If a CMS-owned item already claims a source path that repo sync wants to create, the sync skips it and records a sync error instead of taking ownership
- `sync_error` is reserved for actual fetch/parse/upsert failures or CMS ownership conflicts, not routine stale-item archival

### Manual, endpoint, and scheduled triggers

- Manual script:
  - `node ./scripts/run-repo-sync.mjs documentation`
  - `node ./scripts/run-repo-sync.mjs changelogs`
- Directus endpoint:
  - preferred: `POST /zenith-sync/documentation`
  - preferred: `POST /zenith-sync/changelogs`
  - rollout fallback only: `POST /@zenithbuild/zenith-sync/documentation` and `POST /@zenithbuild/zenith-sync/changelogs`
- Directus flows:
  - `Repo Sync: Documentation`
  - `Repo Sync Schedule: Documentation`
  - `Repo Sync: Changelogs`
  - `Repo Sync Schedule: Changelogs`
- Cron env:
  - `DOCS_SYNC_CRON`
  - `CHANGELOG_SYNC_CRON`

## Documentation Editing Rules

### Repo-owned documentation

- `source_kind=repo_sync`
- `editor_mode=markdown`
- Body and editorial fields stay read-only in Studio
- Edit the source markdown in the repo, not in Directus
- AI draft-improvement actions are intentionally hidden for these items

### CMS-authored documentation

- `source_kind=cms_manual` or `source_kind=cms_ai`
- Editors can choose `editor_mode=markdown` or `editor_mode=wysiwyg`
- Markdown mode shows `markdown_raw`
- WYSIWYG mode shows `wysiwyg_content`
- `html_rendered` remains derived/hidden

## Documentation Taxonomy

Documentation taxonomy uses:

- visible shared `categories`
- visible shared `tags`
- `category_ref` as the real category relation
- `tags` as relational shared taxonomy
- `category`, `category_label`, `category_order`, and `doc_order` as canonical docs IA metadata from repo sync for compatibility

Category records are route-aware and include:

- `slug`
- `title`
- `scope`
- `route_base`
- `order`
- `status`

For docs, `route_base=/docs` and category slugs map cleanly to paths like `/docs/reactivity/...` and `/docs/contracts/...`.

Slug responsibilities are now explicit:

- category records own the parent route segment through `slug` + `route_base`
- documentation items own the final leaf `slug`
- public docs routes therefore read as `/docs/<category-slug>/<doc-slug>`
- tags stay relational search/filter/SEO helpers and do not own route segments

The shared `categories` collection is now the first-class visible grouping layer for:

- `documentation`
- `posts`
- `changelogs`

Docs/post/changelog forms use `category_ref` as the relation field. The older flat docs IA fields stay in place only for repo-sync ordering compatibility and current site adapter compatibility.

These fields are intended for future docs navigation and ordered site queries. They are not decorative metadata.

## Documentation AI Actions

For CMS-authored documentation items, the Studio super header exposes:

- `Improve Draft`
- `Generate Summary/Excerpt`

These actions are wired through Directus manual flows and remain subordinate to the existing ownership rules.

## SEO

Documentation now has a real SEO field/interface inside the SEO group. It is intended for future docs rendering and search metadata, not as a replacement for repo-owned markdown truth.

## Next Safe Step

After repo sync is stable, the next safe product step is one narrow Directus read path into the site, preferably changelog or documentation first. Do not replace the public site's full JSON/repo content boundary in one jump.
