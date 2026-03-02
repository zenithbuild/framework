---
title: "SSR Transport Contract"
description: "Inline SSR payload transport, serialization rules, and forbidden channels."
version: "0.3"
status: "canonical"
last_updated: "2026-02-22"
tags: ["ssr", "transport", "contracts"]
---

# SSR Transport Contract

## Contract: Inline SSR Channel

Contract: SSR payload is injected inline exactly once per response using `#zenith-ssr-data`.

Invariant: The payload is request-scoped and not reused across unrelated routes.

Definition of Done:
- Exactly one SSR data script exists in the HTML.
- Payload is JSON-safe and parseable by client runtime.

Failure Modes:
- Duplicate SSR script tags.
- Missing SSR script tag on server-rendered responses.
- Payload content from a different route appears in response.

Evidence:
- SSR route tests assert one inline payload script and parse validity.

## Contract: Forbidden SSR Channels

Banned:
- Query-param SSR transport.
- Runtime channels that bypass server-rendered request context.

Invariant: SSR data is not accepted from URL parameters.

Definition of Done:
- No query-key based SSR hydration path exists.
- Runtime initializes from inline payload only.

Failure Modes:
- URL-carried payload mutates hydration state.
- Runtime proceeds when inline payload is absent and fallback source is uncontrolled.

Evidence:
- Drift checks confirm query-channel strings are absent from framework outputs.
