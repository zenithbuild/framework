---
title: "Latest Zenith Validated Run"
description: "Latest validated run resolved by selector for Zenith."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Benchmark Results 20260319T183500Z-zenith-rebuild-contract (Zenith, Matrix)

## Caveats
- This page is a direct rendering of validated benchmark result JSON.
- Numbers shown here come from recorded samples, medians, and spreads already present in the source files.
- Missing frameworks, tracks, or cases indicate that no validated result file for that cell was included in this run.
- Hydration/runtime output mixes shared browser metrics with framework-specific sidecars; those categories are labeled separately.

## Run Metadata
| Field | Value |
| --- | --- |
| Run ID | `20260319T183500Z-zenith-rebuild-contract` |
| Runner | `matrix` |
| Generated At | 2026-03-19T18:31:54.239Z |
| Source JSON | `apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/matrix.json` |
| Frameworks | zenith |
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
| zenith | static-marketing | `c43e5374aa4af8a95a8a2e52acc8fbabcf175461562a59a5f67dd81de9c06ae5` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/static-marketing/zenith/package-lock.json` |
| zenith | content-index | `43d1d4fad02433499cef63a444cc53cfc58b47c4eeb3e902b50979e122746dc9` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/content-index/zenith/package-lock.json` |
| zenith | interactive-filter | `0569aa9073f2bec58b610364d43fb74fc85e175371f2ca38d9623f524e1b6e34` | `/Users/judahsullivan/Personal/zenithbuild-monorepo/apps/benchmarks/fixtures/interactive-filter/zenith/package-lock.json` |

## Rebuild
Recorded rebuild durations are shown exactly as captured by the harness.

These rows carry an explicit rebuild measurement contract and are not treated as flat cross-framework comparison claims unless the contract says they are directly comparable.

### Measurement Contract
| Framework | Settle Method | Signal Source | Freshness Proof | Route Probe Role | Directly Comparable |
| --- | --- | --- | --- | --- | --- |
| zenith | dev-state | /__zenith_dev/state | buildId advancement + ok status | secondary route verification after framework settle | false |

### Contract Caveats
- This rebuild metric settles on Zenith dev-state/build-id progression, then re-probes the route. It is not directly comparable to browser-probe rebuild metrics.

| Framework | Case | Mutation Track | Sample Durations | Median | Spread | Restore Match | Restore Durations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| zenith | static-marketing | template-text | 1326.65, 1919.11 | 1622.88 ms | 592.46 ms | true, true | 979.80 ms, 1165.25 ms |
| zenith | static-marketing | style | 2534.36, 758.52 | 1646.44 ms | 1775.84 ms | true, true | 654.46 ms, 763.05 ms |
| zenith | content-index | template-text | 988.81, 768.16 | 878.48 ms | 220.65 ms | true, true | 1068.80 ms, 756.66 ms |
| zenith | content-index | style | 803.56, 644.17 | 723.87 ms | 159.39 ms | true, true | 751.36 ms, 866.94 ms |
| zenith | interactive-filter | template-text | 703.95, 559.05 | 631.50 ms | 144.90 ms | true, true | 677.39 ms, 552.61 ms |
| zenith | interactive-filter | style | 792.83, 558.74 | 675.79 ms | 234.09 ms | true, true | 556.95 ms, 539.53 ms |
| zenith | interactive-filter | interactive-logic | 641.24, 658.80 | 650.02 ms | 17.56 ms | true, true | 534.86 ms, 1308.13 ms |

### Artifact Pointers
- `zenith` / `static-marketing / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/template-text/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/template-text/sample-1.restore.json)
- `zenith` / `static-marketing / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/style/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/static-marketing__zenith/style/sample-1.restore.json)
- `zenith` / `content-index / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/template-text/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/template-text/sample-1.restore.json)
- `zenith` / `content-index / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/style/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/content-index__zenith/style/sample-1.restore.json)
- `zenith` / `interactive-filter / template-text`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/template-text/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/template-text/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/template-text/sample-1.restore.json)
- `zenith` / `interactive-filter / style`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/style/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/style/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/style/sample-1.restore.json)
- `zenith` / `interactive-filter / interactive-logic`: [install stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stdout.log), [install stderr](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/install.stderr.log), [sample-1 mutation](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/interactive-logic/sample-1.mutation.json), [sample-1 stdout](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/interactive-logic/sample-1.stdout.log), [sample-1 restore](../../../../apps/benchmarks/results/20260319T183500Z-zenith-rebuild-contract/rebuild/interactive-filter__zenith/interactive-logic/sample-1.restore.json)

