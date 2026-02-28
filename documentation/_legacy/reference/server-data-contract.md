---
title: "Server Data Contract"
order: 11
---

# Server Data Contract

Zenith server data is strict by design:

- Initial content comes from `<script server lang="ts">`, not client fetch.
- Supported exports are `data`, `load(ctx)`, and optional `prerender`.
- SSR payload is injected inline via `#zenith-ssr-data`.
- Errors must be visible (no silent fallback arrays).
- Secrets must never reach client bundles or `window.__zenith_ssr_data`.

Canonical source contract:

- `/Users/judahsullivan/Personal/zenith/SERVER_API_CONTRACT.md`

Use that file as the normative rule-set for regression gates and CI checks.
