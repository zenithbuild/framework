---
title: "Latest Astro Validated Run"
description: "Latest validated run resolved by selector for Astro."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Benchmark Results 20260319T183700Z-astro-rebuild-contract (Astro, Matrix)

## Caveats
- This page is a direct rendering of validated benchmark result JSON.
- Numbers shown here come from recorded samples, medians, and spreads already present in the source files.
- Missing frameworks, tracks, or cases indicate that no validated result file for that cell was included in this run.
- Hydration/runtime output mixes shared browser metrics with framework-specific sidecars; those categories are labeled separately.

## Run Metadata
| Field | Value |
| --- | --- |
| Run ID | `20260319T183700Z-astro-rebuild-contract` |
| Runner | `matrix` |
| Generated At | 2026-03-19T18:32:11.580Z |
| Source JSON | `apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/matrix.json` |
| Frameworks | astro |
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
| astro | static-marketing | `a6d807be1365d86b0506f6cbbcdff8cf3a2c89eab0ca245c75f84af1729af7fb` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/static-marketing/astro/package-lock.json` |
| astro | content-index | `d519c94a545680496e43256f8d15a52b224cdb3c2b971f001fe2a98b6cb7527f` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/content-index/astro/package-lock.json` |
| astro | interactive-filter | `53705f628cc2af6453731ec2abc93476ef33357a51d53fb80cfdcde51ccb38dd` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/interactive-filter/astro/package-lock.json` |

## Rebuild
Recorded rebuild durations are shown exactly as captured by the harness.

These rows carry an explicit rebuild measurement contract and are not treated as flat cross-framework comparison claims unless the contract says they are directly comparable.

### Measurement Contract
| Framework | Settle Method | Signal Source | Freshness Proof | Route Probe Role | Directly Comparable |
| --- | --- | --- | --- | --- | --- |
| astro | browser-probe | route reload + expected DOM state | observed post-mutation page state | primary freshness proof and route verification | false |

### Contract Caveats
- This rebuild metric settles on route reload and observed DOM freshness. It is not directly comparable to dev-state-settled rebuild metrics.

| Framework | Case | Mutation Track | Sample Durations | Median | Spread | Restore Match | Restore Durations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| astro | static-marketing | template-text | 823.52, 318.15 | 570.84 ms | 505.37 ms | true, true | 301.35 ms, 313.90 ms |
| astro | static-marketing | style | 509.20, 308.60 | 408.90 ms | 200.60 ms | true, true | 603.14 ms, 350.97 ms |
| astro | content-index | template-text | 673.46, 307.31 | 490.38 ms | 366.15 ms | true, true | 306.45 ms, 315.64 ms |
| astro | content-index | style | 309.18, 324.11 | 316.64 ms | 14.93 ms | true, true | 280.00 ms, 313.00 ms |
| astro | interactive-filter | template-text | 656.02, 647.40 | 651.71 ms | 8.62 ms | true, true | 271.16 ms, 266.71 ms |
| astro | interactive-filter | style | 271.10, 883.70 | 577.40 ms | 612.60 ms | true, true | 269.41 ms, 272.47 ms |
| astro | interactive-filter | interactive-logic | 273.58, 662.78 | 468.18 ms | 389.20 ms | true, true | 286.29 ms, 275.07 ms |

### Artifact Pointers
- `astro` / `static-marketing / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/template-text/sample-1.restore.browser-probe.json)
- `astro` / `static-marketing / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/static-marketing__astro/style/sample-1.restore.browser-probe.json)
- `astro` / `content-index / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/template-text/sample-1.restore.browser-probe.json)
- `astro` / `content-index / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/content-index__astro/style/sample-1.restore.browser-probe.json)
- `astro` / `interactive-filter / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/template-text/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/template-text/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/template-text/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/template-text/sample-1.restore.browser-probe.json)
- `astro` / `interactive-filter / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/style/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/style/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/style/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/style/sample-1.restore.browser-probe.json)
- `astro` / `interactive-filter / interactive-logic`: [install stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/interactive-logic/sample-1.mutation.json), [sample-1 browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/interactive-logic/sample-1.browser-probe.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/interactive-logic/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/interactive-logic/sample-1.restore.json), [sample-1 restore browser probe](../../../../apps/benchmarks/results/20260319T183700Z-astro-rebuild-contract/rebuild/interactive-filter__astro/interactive-logic/sample-1.restore.browser-probe.json)

