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

## Directus Changelog Reads

The public changelog surface supports an explicit source switch:

- `ZENITH_CHANGELOG_SOURCE=local`
- `ZENITH_CHANGELOG_SOURCE=directus`

The public blog surface follows the same explicit contract:

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
