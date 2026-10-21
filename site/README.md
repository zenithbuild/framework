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

## Testing against the framework candidate

The site suite (`bun test`, including the Playwright browser tests) runs against the
framework candidate built from this repository, not the published npm toolchain:
published `@zenithbuild/*@0.8.0` cannot build this site (vendor bundling fails with
`Unterminated string`). The browser tests start `zenith dev` through
`tests/helpers/dev-server.ts`, which uses `ZENITH_SITE_CLI_ENTRY`.

Verified candidate: `f504c98d` (train `0.8.0`), the base commit of this batch on GitHub's `integration/v1`.
From the repository root:

```bash
bun install --frozen-lockfile
export ZENITH_TRAIN_VERSION="$(cat TRAIN_VERSION)"
for p in runtime router extension-registry core cli; do bun run --cwd packages/$p build; done
cargo build --locked --release --manifest-path packages/compiler/Cargo.toml   # rustc >= 1.88
bun run --cwd packages/compiler build
bun run --cwd packages/bundler build
bun run --cwd apps/integration-tests playwright install chromium

cd site
bun install --frozen-lockfile
export ZENITH_SITE_CLI_ENTRY="$PWD/../packages/cli/dist/index.js"
export ZENITH_COMPILER_BIN="$PWD/../packages/compiler/target/release/zenith-compiler"
export ZENITH_BUNDLER_BIN="$PWD/../packages/bundler/target/release/zenith-bundler"
node "$ZENITH_SITE_CLI_ENTRY" build   # production build with the candidate
bun test                              # full suite, about 15 minutes
```

This mirrors the `site` gate in `.github/workflows/qualify-candidate.yml`. Result at
`f504c98d` with the JUD-48 site changes applied: 260 pass, 0 fail (30 files, about 14
minutes). Plain `f504c98d` without these changes fails 13 tests. At that SHA, nine browser
tests spawn `npx zenith` directly, so they run published 0.8.0 and ignore
`ZENITH_SITE_CLI_ENTRY`. JUD-48 routes them through `tests/helpers/dev-server.ts`.

Root causes of the six original candidate failures (JUD-48):

| Test | Cause | Resolution |
| --- | --- | --- |
| destination entrance replay | Test drift: it navigated to `/blog`, whose scroll-mode motion has no `[data-route-entrance]` targets. | Navigates to `/about` (page-mode `PageHeader`). |
| Tina-managed committed content routes | Test drift: stale Blog heading, TOC label (`On this page`), and a repo path the reader no longer renders. | Asserts the committed content (`blog.json`, frontmatter description). |
| documentation reader path | Site bugs: `DocsArticleTransition` was never mounted, and `docs/getting-started` wrapped the reader in different outer markup from `[...slug]`, so soft navigation between them hit `MARKER_MISSING` and fell back to a full load. | Mounted the transition; both routes render the same `DocumentationArticle` template (contract test added). The framework's unchecked `#app` swap is reported separately. |
| Home scroll-motion readiness | Test drift: expected the retired Framework Surface section (`home-section-refinement.test.ts` asserts it is gone). | Checks the sponsorship section instead. |
| Home section refinement playback | Same retired Framework Surface. | Checks sponsorship motion targets after SPA return and under reduced motion. |
| route-transition lifecycle | Site bug: workbench tabs never updated `aria-selected`/`tabIndex` because props are not reactive (ZEN-RULE-104). Plus test drift in panel ids and strings. | `syncTabSelection()` in `CodeWorkbench.zen` (unit test in `workbench-tab-selection.test.ts`); updated selectors. |

Not in the original six: `route transition playback` was flaky. It sampled the phase at a
fixed 2.5 seconds, but the router fires `navigation:before-leave` only after the route check
and HTML fetch finish (about 3 seconds on a cold dev server). It now waits for the phase.

Environment notes:

- Each browser test starts its own dev server on a fixed port between 4010 and 4033. The
  harness refuses a port that is already in use instead of testing against another server,
  so stop other dev servers on those ports first.
- The Home contributor and route-lifecycle tests load GitHub avatars and profile pages, so
  the suite needs outbound network access. Offline runs fail those two tests with
  `ERR_INTERNET_DISCONNECTED`.
- On hosts with a low inotify watch limit the dev server can exit with
  `ENOSPC: System limit for number of file watchers reached`.

## Technologies

- **Core**: `@zenithbuild/core`
- **Builder**: `zen-dev` / `zen-build`
- **Styling**: Vanilla CSS / CSS Variables

## License

MIT
# zenith-site
