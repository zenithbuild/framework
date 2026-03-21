---
title: "Latest Nuxt Validated Run"
description: "Latest validated run resolved by selector for Nuxt."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Benchmark Results 20260319T180451Z-matrix (Nuxt, Matrix)

## Caveats
- This page is a direct rendering of validated benchmark result JSON.
- Numbers shown here come from recorded samples, medians, and spreads already present in the source files.
- Missing frameworks, tracks, or cases indicate that no validated result file for that cell was included in this run.
- Hydration/runtime output mixes shared browser metrics with framework-specific sidecars; those categories are labeled separately.

## Run Metadata
| Field | Value |
| --- | --- |
| Run ID | `20260319T180451Z-matrix` |
| Runner | `matrix` |
| Generated At | 2026-03-19T18:05:46.929Z |
| Source JSON | `apps/benchmarks/results/20260319T180451Z-matrix/matrix.json` |
| Frameworks | nuxt |
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
| nuxt | static-marketing | `88fbf5096f77a37aa7475b1fe8a8951ed88165068c1914ff8e3a12ff514243b3` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/static-marketing/nuxt/package-lock.json` |
| nuxt | content-index | `68257729d18c245607929dcbfcec37f0bae9c36beccf4153fd523dd067a8ff14` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/content-index/nuxt/package-lock.json` |
| nuxt | interactive-filter | `d6d376f2352a979247908edaa43f014f839e3f4040a1e3c2c14e4b514b327c23` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/interactive-filter/nuxt/package-lock.json` |

## Rebuild
Recorded rebuild durations are shown exactly as captured by the harness.

These rows carry an explicit rebuild measurement contract and are not treated as flat cross-framework comparison claims unless the contract says they are directly comparable.

### Measurement Contract
| Framework | Settle Method | Signal Source | Freshness Proof | Route Probe Role | Directly Comparable |
| --- | --- | --- | --- | --- | --- |
| nuxt | browser-probe | route reload + expected DOM state | observed post-mutation page state | primary freshness proof and route verification | false |

### Contract Caveats
- This rebuild metric settles on route reload and observed DOM freshness. It is not directly comparable to dev-state-settled rebuild metrics.

| Framework | Case | Mutation Track | Sample Durations | Median | Spread | Restore Match | Restore Durations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nuxt | static-marketing | template-text | 275.66, 666.33 | 471.00 ms | 390.67 ms | true, true | 300.22 ms, 272.47 ms |
| nuxt | static-marketing | style | 276.47, 275.42 | 275.95 ms | 1.05 ms | true, true | 286.47 ms, 275.34 ms |
| nuxt | content-index | template-text | 313.32, 272.16 | 292.74 ms | 41.16 ms | true, true | 671.53 ms, 302.59 ms |
| nuxt | content-index | style | 276.00, 274.98 | 275.49 ms | 1.02 ms | true, true | 284.34 ms, 274.95 ms |
| nuxt | interactive-filter | template-text | 306.56, 310.92 | 308.74 ms | 4.36 ms | true, true | 295.65 ms, 279.98 ms |
| nuxt | interactive-filter | style | 280.71, 684.43 | 482.57 ms | 403.72 ms | true, true | 295.27 ms, 274.64 ms |
| nuxt | interactive-filter | interactive-logic | 666.53, 271.81 | 469.17 ms | 394.72 ms | true, true | 662.00 ms, 318.91 ms |

### Artifact Pointers
- `nuxt` / `static-marketing / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/template-text/sample-1.restore.browser-probe.json)
- `nuxt` / `static-marketing / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/static-marketing__nuxt/style/sample-1.restore.browser-probe.json)
- `nuxt` / `content-index / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/template-text/sample-1.restore.browser-probe.json)
- `nuxt` / `content-index / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/content-index__nuxt/style/sample-1.restore.browser-probe.json)
- `nuxt` / `interactive-filter / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/template-text/sample-1.restore.browser-probe.json)
- `nuxt` / `interactive-filter / style`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/style/sample-1.restore.browser-probe.json)
- `nuxt` / `interactive-filter / interactive-logic`: [install stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/interactive-logic/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/interactive-logic/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/interactive-logic/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/interactive-logic/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T180451Z-matrix/rebuild/interactive-filter__nuxt/interactive-logic/sample-1.restore.browser-probe.json)

