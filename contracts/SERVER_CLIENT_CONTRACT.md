# Server/Client Contract (Zenith V0)

Status: FROZEN

## Purpose

Lock the boundary between `<script server>` execution and browser hydration.

## Compile-Time Rules

- `<script server>` is extracted by compiler and excluded from browser JS bundles.
- Compiler emits `server_script`, `prerender`, and optional `ssr_data` fields in the IR envelope.
- Compiler emits deterministic graph identity fields: `graph_hash` and `graph_edges`.
- `prerender=true` routes must resolve deterministic `ssr_data` during build.

## Bundler Rules

- Bundler consumes compiler IR from stdin only.
- Bundler validates payload integrity by recomputing `graph_hash` from deterministic graph fields.
- Bundler serializes `ssr_data` into page modules as `__zenith_static_ssr_data`.
- Bundler never evaluates browser expressions and never performs runtime lookup.

## Preview Rules

- Preview serves `/dist` only (no compilation).
- For manifest-backed non-prerender routes, preview executes `server_script` at request time with route params.
- Server script execution is request-isolated:
  - each request uses a fresh VM module context,
  - no Node module cache reuse,
  - no shared mutable globals between requests.
- Preview injects request-scoped SSR payload into page module URL as `__zenith_ssr=<encoded-json>`.
- Route rewrites are manifest-driven only; unknown paths return 404.
- Allowed server exports are `ssr_data` and `props` (legacy `ssr` alias accepted for V0 compatibility).
- Preview rejects non-serializable server values (functions, symbols, class instances, proxies, circular references).
- Injected SSR payloads are deep-frozen before URL serialization.

## Runtime Rules

- Runtime accepts `ssr_data` and `params` via `hydrate(payload)`.
- Runtime resolves only explicit literal prefixes:
  - `params.*`
  - `ssr.*`
- No eval/new Function/identifier lookup by string.

## Forbidden

- CLI-side HTML mutation.
- Runtime server-script execution.
- Implicit fallback from browser to server evaluation.
- Bare internal package imports in emitted browser assets.
