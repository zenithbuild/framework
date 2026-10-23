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

The site has no CMS. Every public route reads committed repository files directly during server rendering and build; there is no admin UI, editing service, or remote content API.

## Content

Edit the files below, review the repository diff, and commit. The change ships through the repository's normal deployment trigger.

- Documentation: `docs/documentation/**/*.md` (read by `site/src/server/localDocumentationSource.ts`)
- Blog: `site/src/content/blog/*.md` (read by `site/src/server/gitBlogSource.ts`)
- About: `site/src/content/pages/about.json`
- People: `site/src/content/people/*.json`
- Sponsorship: `site/src/content/sponsors/*.json`
- Selected settings: `site/src/content/site/settings.json`

Navigation, footer structure, layouts, animation choreography, route policy, compiler examples, validation, and rendering adapters remain code-owned.

### Documentation ownership and filtering

- Public source of truth: `docs/documentation/**/*.md`.
- Underscore-prefixed files/directories and `_legacy/**` are not public.
- The broader repository audits, plans, RFCs, trackers, and `docs/_internal` stay outside the public routes.
- Canonical docs remain public; draft, internal, deprecated, archived, and legacy material is not added to public navigation.

The public route shape is intentionally category-aware:

- docs landing: `/docs`
- root docs: `/docs/install-compatibility`, `/docs/cli-contract`, `/docs/zenith-contract`
- grouped docs: `/docs/[section]/[slug]`

### Source switches

- `ZENITH_BLOG_SOURCE=git` (default) reads `site/src/content/blog/*.md`.
- `ZENITH_BLOG_SOURCE=local` reads `site/src/content/pages/blog-posts.json`.
- `ZENITH_DOCUMENTATION_SOURCE=local` (default and only value) reads `docs/documentation`.

## Technologies

- **Core**: `@zenithbuild/core`
- **Builder**: `zen-dev` / `zen-build`
- **Styling**: Vanilla CSS / CSS Variables

## License

MIT
# zenith-site
