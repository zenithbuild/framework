# zenith-site-v0

Zenith site with Directus-powered docs/blog content.

## Directus SSR Pipeline

Docs/blog are loaded via `<script server>` only:
- `/docs` (docs index)
- `/docs/:section/:slug` (doc detail route)
- `/blog` (post list)
- `/blog/:slug` (post detail route)
- `/documentation` (alias page that links to docs)

No per-item route files are generated.
No browser-side Directus fetch is used for initial docs/blog content.

## Server-only CMS config

Create `.zenithrc.json` in the project root to override Directus settings.
If `.zenithrc.json` is missing, `src/server/cms-config.ts` uses canonical defaults
from `zenith-cms` templates (`docs_pages` + `posts` mappings).

`.zenithrc.json` is server-only and gitignored.

Directus collection defaults are:
- docs: `docs_pages`
- blog: `posts`

Schema interfaces live in `src/server/directus-schema.ts`.

## Development

```bash
npm install
npm run dev
```

`zenith-site-v0` consumes the sibling local Zenith packages during development.
`npm run dev` and `npm run build` automatically refresh:
- `../zenith-cli/dist`
- `../zenith-runtime/dist`
- `../zenith-bundler/target/release/zenith-bundler`

No npm publish is required for local site validation.

## Verification

```bash
npm run build
bun test tests/cms-ssr.test.ts
```
