---
title: "Latest Next App Router Validated Run"
description: "Latest validated matrix run resolved by selector for Next App Router."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Benchmark Results 20260319T180355Z-matrix (Next App Router, Matrix)

## Caveats
- This page is a direct rendering of validated benchmark result JSON.
- Numbers shown here come from recorded samples, medians, and spreads already present in the source files.
- Missing frameworks, tracks, or cases indicate that no validated result file for that cell was included in this run.
- Hydration/runtime output mixes shared browser metrics with framework-specific sidecars; those categories are labeled separately.

## Run Metadata
| Field | Value |
| --- | --- |
| Run ID | `20260319T180355Z-matrix` |
| Runner | `matrix` |
| Generated At | 2026-03-19T18:04:47.482Z |
| Source JSON | `apps/benchmarks/results/20260319T180355Z-matrix/matrix.json` |
| Frameworks | next-app-router |
| Cases | static-marketing, content-index, interactive-filter |
| Tracks | rebuild |
| Warmups | 1 |
| Recorded Samples | 2 |
| Git Commit | `c8923eedb15a86835b234fc1daf9b0ad742446a0` |

## Environment
| Field | Value |
| --- | --- |
| Platform | darwin, 25.3.0, arm64 |
| CPU | Apple M2, 8 cores |
| Memory | 16384 MiB |
| Node | v24.11.1 |
| npm | 11.9.0 |
| bun | 1.3.5 |

## Fixture Coverage
| Framework | Case | Lockfile SHA-256 | Lockfile |
| --- | --- | --- | --- |
| next-app-router | static-marketing | `0c68e5fe919d1c37d6792a131e84043f56630d8a885bb034b9eaa6da6262008f` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/static-marketing/next-app-router/package-lock.json` |
| next-app-router | content-index | `47e950dea2b1c1a505b09774f979515f5c08620bbc8ab43586a17365da145df0` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/content-index/next-app-router/package-lock.json` |
| next-app-router | interactive-filter | `1d4bd62736ac86a47c8ebab9a808c1a41832baa36b9a2259617a2fb0b54d8496` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/interactive-filter/next-app-router/package-lock.json` |

## Rebuild
Recorded rebuild durations are shown exactly as captured by the harness.

These rows carry an explicit rebuild measurement contract and are not treated as flat cross-framework comparison claims unless the contract says they are directly comparable.

### Measurement Contract
| Framework | Settle Method | Signal Source | Freshness Proof | Route Probe Role | Directly Comparable |
| --- | --- | --- | --- | --- | --- |
| next-app-router | browser-probe | route reload + expected DOM state | observed post-mutation page state | primary freshness proof and route verification | false |

### Contract Caveats
- This rebuild metric settles on route reload and observed DOM freshness. It is not directly comparable to dev-state-settled rebuild metrics.

| Framework | Case | Mutation Track | Sample Durations | Median | Spread | Restore Match | Restore Durations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| next-app-router | static-marketing | template-text | 761.52, 730.64 | 746.08 ms | 30.88 ms | true, true | 735.01 ms, 726.69 ms |
| next-app-router | static-marketing | style | 316.09, 320.09 | 318.09 ms | 4.00 ms | true, true | 312.19 ms, 315.98 ms |
| next-app-router | content-index | template-text | 765.08, 740.55 | 752.82 ms | 24.53 ms | true, true | 762.21 ms, 722.91 ms |
| next-app-router | content-index | style | 317.04, 313.53 | 315.28 ms | 3.51 ms | true, true | 313.63 ms, 311.51 ms |
| next-app-router | interactive-filter | template-text | 733.74, 736.74 | 735.24 ms | 3.00 ms | true, true | 736.51 ms, 720.18 ms |
| next-app-router | interactive-filter | style | 311.63, 312.24 | 311.94 ms | 0.61 ms | true, true | 312.99 ms, 312.21 ms |
| next-app-router | interactive-filter | interactive-logic | 320.31, 341.41 | 330.86 ms | 21.10 ms | true, true | 316.91 ms, 323.15 ms |

### Artifact Pointers
- `next-app-router` / `static-marketing / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/template-text/sample-1.restore.browser-probe.json)
- `next-app-router` / `static-marketing / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/static-marketing__next-app-router/style/sample-1.restore.browser-probe.json)
- `next-app-router` / `content-index / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/template-text/sample-1.restore.browser-probe.json)
- `next-app-router` / `content-index / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/content-index__next-app-router/style/sample-1.restore.browser-probe.json)
- `next-app-router` / `interactive-filter / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/template-text/sample-1.restore.browser-probe.json)
- `next-app-router` / `interactive-filter / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/style/sample-1.restore.browser-probe.json)
- `next-app-router` / `interactive-filter / interactive-logic`: [install stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/interactive-logic/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/interactive-logic/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/interactive-logic/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/interactive-logic/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180355Z-matrix/rebuild/interactive-filter__next-app-router/interactive-logic/sample-1.restore.browser-probe.json)

