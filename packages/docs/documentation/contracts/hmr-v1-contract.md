---
title: "HMR V1 Contract"
description: "Canonical development HMR contract between zenith-cli and zenith-runtime."
version: "0.5"
status: "canonical"
last_updated: "2026-02-28"
tags: ["contracts", "hmr", "dev-server", "runtime"]
---

# HMR V1 Contract

## ZEN-RULE-350: Runtime Owns Dev Client, CLI Owns Dev Endpoints

Contract: runtime injects and executes the V1 dev client; CLI serves deterministic V1 HMR endpoints only.

Invariant:
- `@zenithbuild/runtime` is the only source of dev client logic.
- `@zenithbuild/cli` must never inject a separate HMR script.

## Required Endpoints (`@zenithbuild/cli`)

- `GET /__zenith_dev/events`
- `GET /__zenith_dev/state`
- `GET /__zenith_dev/styles.css`

All three endpoints must use `Cache-Control: no-store`. Dev endpoints must not enable permissive CORS.

## `/__zenith_dev/state` Contract

State payload is deterministic and includes:
- `buildId` (monotonic integer)
- `status` (`ok` | `building` | `error`)
- `lastBuildMs`
- `durationMs`
- `cssHref`
- `error`

`cssHref` must always use the stable V1 URL form:
- `/__zenith_dev/styles.css?buildId=<n>`

## SSE Event Contract

Stream on `/__zenith_dev/events` emits framed SSE events (`event: <name>\n data: {...}\n\n`).

Required invariants:
- Every `build_start` is followed by exactly one `build_complete` or `build_error` with the same `buildId`.
- `css_update` and `reload` are emitted only after `build_complete`.
- `buildId` is monotonic across builds.

## CSS Safety Contract

For CSS-only edits:
- CLI must ensure CSS is available before emitting `css_update`.
- Runtime must treat `/state.cssHref` as canonical.
- Runtime must apply stylesheet changes atomically:
  - keep old stylesheet until new stylesheet fires `load`
  - on `error`, preserve old stylesheet and retry by refetching `/__zenith_dev/state`

This prevents 404-driven unstyled flashes and keeps HMR deterministic.

## Build Error Recovery

Build errors must not crash dev server:
- emit `build_error`
- keep SSE connection alive
- allow subsequent successful builds to emit normal `build_complete` and `css_update`/`reload`

## Migration Note

V0 path `/__zenith_hmr` is legacy-only compatibility. V1 consumers must use `/__zenith_dev/events` and `/__zenith_dev/state`, with runtime-driven CSS updates via `/__zenith_dev/styles.css?buildId=<n>`.

Canonical sources:
- `/Users/judahsullivan/Personal/zenith/zenith-cli/CLI_CONTRACT.md`
- `/Users/judahsullivan/Personal/zenith/zenith-runtime/src/template.js`
