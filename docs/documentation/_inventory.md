---
title: "Docs Inventory"
description: "Classification and alignment status for legacy and canonical docs during migration to content collections."
version: "0.3"
status: "draft"
last_updated: "2026-05-25"
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
| guides/deployment-targets | Deployment Targets Guide | guide | keep | Canonical target matrix, preview behavior, and deployment limits |
| guides/troubleshooting | Troubleshooting Guide | guide | keep | Operational diagnosis |
| contributing/drift-gates | Drift Gates | contributing | keep | CI + docs integrity checks |
| routing/navigation-shell | Navigation Shell | routing | keep | Canonical tiny visual shell utility on existing lifecycle |
| routing/global-middleware | Global Middleware | routing | keep | TypeScript-only root middleware contract |
| reactivity/dom-and-environment | DOM and Environment | reactivity | keep | Refs, zenWindow/zenDocument, zenOn, zenResize, collectRefs |
| reactivity/effects-vs-mount | zenEffect vs zenMount | reactivity | keep | When to use zenEffect vs zenMount |
| reactivity/presence | Presence | reactivity | keep | Canonical ref-owned presence helper and phase model |
| reactivity/overlay-sheet-pattern | Overlay and Sheet Pattern | reactivity | keep | Canonical always-mounted overlay and sheet composition pattern |

## Legacy Docs (Deleted)

All `documentation/_legacy` files have been permanently deleted to prevent false syntax teaching (like `onclick=` and `querySelector`) and to establish a single truth surface.
