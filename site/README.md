# zenith-site ⚡

The official landing page and documentation site for the Zenith framework.

## Overview

`zenith-site` is built using Zenith itself, serving as both the official presence for the framework and a high-performance demonstration of its capabilities.

## Features

- **Built with Zenith**: Showcasing real-world usage of components, state, and layouts.
- **High Performance**: Optimized for speed and SEO.
- **Interactive Documentation**: (Work in Progress) Deep dives into Zenith's architecture and usage.

## Development

```bash
# Install dependencies
bun install

# Start the development server
bun run dev

# Build for production
bun run build

# Preview build
bun run preview
```

The normal public site reads committed repository files and does not require TinaCMS or Tina Cloud to be running.

## TinaCMS editing

Tina is an editing layer over the repository, not the public rendering dependency. Its config is `site/tina/config.ts`, and `localContentPath: "../.."` makes the repository root the content root.

```bash
cd site
bun install
cp .env.example .env.local
bun run cms:dev
```

Open `/admin/index.html` on the Zenith development origin. The command starts Tina's local editing service and the Zenith dev server together.

Editing flow:

1. Open **Documentation** and edit an existing document. Tina writes the original file under `docs/documentation`; no copy is created.
2. Open **Blog** to edit or create Markdown under `site/src/content/blog`.
3. Open **About page**, **Sponsorship**, **People**, or **Site settings** to edit their Git-backed JSON files.
4. Save and verify the repository diff before committing.
5. Reload the corresponding Zenith route. Public routes read the changed local file directly.

Generate the schema, client, and static admin without Tina Cloud:

```bash
bun run cms:build
bun run cms:audit
```

Generated Tina client/types are under `site/tina/__generated__`; the static admin is emitted to `site/src/public/admin`.

### Documentation ownership and filtering

- Public source of truth: `docs/documentation/**/*.md`.
- Tina excludes underscore-prefixed files/directories and `_legacy/**`.
- The public Zenith loader remains `site/src/server/documentationSource.ts` and reads committed docs plus the generated docs navigation manifest.
- The broader repository audits, plans, RFCs, trackers, and `docs/_internal` are outside the Tina collection and public routes.
- Canonical docs remain public; draft, internal, deprecated, archived, and legacy material is not added to public navigation.

### Editorial content paths

- Blog: `site/src/content/blog/*.md`
- About: `site/src/content/pages/about.json`
- People: `site/src/content/people/*.json`
- Sponsorship: `site/src/content/sponsors/*.json`
- Selected settings: `site/src/content/site/settings.json`

Navigation, footer structure, layouts, animation choreography, route policy, compiler examples, validation, and rendering adapters remain code-owned.

### Deployment

Content is read during server rendering/build from committed files. A saved Tina edit must be committed and deployed through the repository's normal deployment trigger. Tina Cloud is optional for hosted editing; it is not queried by normal Blog, Docs, About, Sponsorship, People, or metadata rendering. Editing credentials are build-time/admin values and must never be imported into `.zen` client scripts.

## Directus Changelog Reads

The public changelog surface supports an explicit source switch:

- `ZENITH_CHANGELOG_SOURCE=local`
- `ZENITH_CHANGELOG_SOURCE=directus`

The public blog surface defaults to Git-backed Tina-managed files:

- `ZENITH_BLOG_SOURCE=git` (default)
- `ZENITH_BLOG_SOURCE=local`
- `ZENITH_BLOG_SOURCE=directus`

Documentation prep follows the same explicit contract:

- `ZENITH_DOCUMENTATION_SOURCE=local`
- `ZENITH_DOCUMENTATION_SOURCE=directus`

For `directus` reads, the canonical site-read auth path is:

- `ZENITH_DIRECTUS_TOKEN`

Temporary local fallback remains supported for verification only:

- `ZENITH_DIRECTUS_EMAIL`
- `ZENITH_DIRECTUS_PASSWORD`

Site reads stay server-only. No Directus client/auth code should be imported into browser bundles.

## Directus Documentation Reads

The docs surface follows the same explicit source switch:

- `ZENITH_DOCUMENTATION_SOURCE=local`
- `ZENITH_DOCUMENTATION_SOURCE=directus`

The public route shape is intentionally category-aware:

- docs landing: `/docs`
- root docs: `/docs/install-compatibility`, `/docs/cli-contract`, `/docs/zenith-contract`
- grouped docs: `/docs/[section]/[slug]`

The site adapter expects a token-first Directus read path. For local development, use a static token from the API-only `Frontend Bot` user rather than admin credentials.

## Technologies

- **Core**: `@zenithbuild/core`
- **Builder**: `zen-dev` / `zen-build`
- **Styling**: Vanilla CSS / CSS Variables

## License

MIT
# zenith-site
