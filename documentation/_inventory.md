---
title: "Docs Inventory"
description: "Classification and alignment status for legacy and canonical docs during migration to content collections."
version: "0.3"
status: "draft"
last_updated: "2026-02-22"
tags: ["inventory", "migration", "docs"]
---

# Docs Inventory

## Contract: Inventory Scope

Contract: Inventory tracks canonical docs and legacy docs that require rewrite, deprecation, or deletion.

Invariant: Canonical docs under `content/docs` are the source of truth for contracts.

Definition of Done:
- Canonical contract/reference/guide docs are listed as keep.
- Legacy contradictory docs are marked rewrite or deprecate.

## Canonical Docs (Keep)

| slug | title | type | status | note |
| --- | --- | --- | --- | --- |
| contracts/routing | Routing Contract | contract | keep | Current routing and navigation policy |
| contracts/ssr-transport | SSR Transport Contract | contract | keep | Inline payload and forbidden channels |
| contracts/navigation | Navigation Contract | contract | keep | Hard reload default and opt-in marker |
| contracts/security-drift-gates | Security and Drift Gates | contract | keep | Security and determinism gates |
| contracts/hmr-v1-contract | HMR V1 Contract | contract | keep | Canonical dev endpoint and css update contract |
| contracts/no-magic | No Magic Contract | contract | keep | Explicit behavior only |
| contracts/dsl-syntax | DSL Syntax Contract | contract | keep | Event binding and expression rules |
| contracts/server-data | Server Data Contract | contract | keep | Server export + serialization rules |
| reference/zenlink | ZenLink Reference | reference | keep | Marker-based opt-in link behavior |
| reference/script-server | Script Server Reference | reference | keep | Server script usage |
| reference/markers | Marker Reference | reference | keep | Marker guarantees |
| reference/server-data-api | Server Data API | reference | keep | Public API summary |
| guides/cms-unified-site | CMS Unified Site Guide | guide | keep | Unified route view model |
| guides/troubleshooting | Troubleshooting Guide | guide | keep | Operational diagnosis |
| contributing/drift-gates | Drift Gates | contributing | keep | CI + docs integrity checks |
| reactivity/dom-and-environment | DOM and Environment | reactivity | keep | Refs, zenWindow/zenDocument, zenOn, zenResize, collectRefs |
| reactivity/effects-vs-mount | zenEffect vs zenMount | reactivity | keep | When to use zenEffect vs zenMount |

## Legacy Docs (Rewrite or Deprecate)

| path | current issue | action |
| --- | --- | --- |
| documentation/router/introduction.md | Contradicts hard reload default policy | rewrite |
| documentation/router/zenlink.md | Outdated link API details | rewrite |
| documentation/router/api.md | Legacy runtime assumptions | rewrite |
| documentation/reference/hooks-reference.md | Old API naming and behavior | rewrite |
| documentation/zenith-spec.md | Mixed historical and current contract language | rewrite |
