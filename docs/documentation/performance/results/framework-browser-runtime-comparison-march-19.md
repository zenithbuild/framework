---
title: "Framework Browser Runtime Comparison (March 19, 2026)"
description: "Validated browser runtime capture across Zenith, Astro, Next App Router, and Nuxt using the shared benchmark fixtures."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Framework Browser Runtime Comparison (March 19, 2026)

Validated browser runtime capture across Zenith, Astro, Next App Router, and Nuxt using the shared benchmark fixtures.

## Caveats
- This page is generated from multiple validated benchmark result files listed below.
- Tables show recorded samples, medians, and spread only. They do not add ranking or winner language.
- If a requested track or case is missing from one or more runs, the page shows the available rows and the overlap checks instead of filling missing values.

## Compared Runs
| Framework | Run ID | Runner | Generated At | Source JSON |
| --- | --- | --- | --- | --- |
| zenith | `20260319T152955Z-matrix` | `matrix` | 2026-03-19T15:31:21.732Z | `apps/benchmarks/results/20260319T152955Z-matrix/matrix.json` |
| astro | `20260319T152712Z-matrix` | `matrix` | 2026-03-19T15:27:36.672Z | `apps/benchmarks/results/20260319T152712Z-matrix/matrix.json` |
| next-app-router | `20260319T152739Z-matrix` | `matrix` | 2026-03-19T15:28:13.557Z | `apps/benchmarks/results/20260319T152739Z-matrix/matrix.json` |
| nuxt | `20260319T152816Z-matrix` | `matrix` | 2026-03-19T15:28:55.579Z | `apps/benchmarks/results/20260319T152816Z-matrix/matrix.json` |

## Environment Summary
| Field | Values |
| --- | --- |
| Frameworks | `zenith`, `astro`, `next-app-router`, `nuxt` |
| Tracks | `hydration-runtime` |
| Cases | `static-marketing`, `content-index`, `interactive-filter` |
| Git Commits | `c8923eedb15a86835b234fc1daf9b0ad742446a0` |
| Warmup / Samples | 1/2 |

## Comparability Checks
| Check | Status | Detail |
| --- | --- | --- |
| Git commit | match | `c8923eedb15a86835b234fc1daf9b0ad742446a0` |
| Machine fingerprint | match | darwin|25.3.0|arm64|Apple M2|8|16384 |
| Runtime fingerprint | match | v24.11.1|11.9.0|1.3.5 |
| Warmup/sample counts | match | 1/2 |
| Framework count | match | `zenith`, `astro`, `next-app-router`, `nuxt` |
| Requested tracks | match | `hydration-runtime` |
| Track coverage by framework | match | Each selected framework covers every requested track. |
| Run shape compatibility | match | Runners: `matrix` |
| Sparse comparison cells | match | Every requested track/case cell contains one row per framework. |
| Duplicate framework inputs | match | Each selected input contributes a distinct framework. |
| Hydration measurement contract | match | Contracts match for hydration/runtime rows. |
| Rebuild measurement contract | not-applicable | Rebuild is not part of this comparison page. |

## Hydration Runtime
Comparable metrics in this section come from the shared browser runtime contract. Framework-specific sidecars remain in artifact links and raw metric files.

### Static Marketing
| Framework | Browser Ready Samples | Median | Spread | DOM Interactive Samples | FCP Samples | Script Count Samples | Long Task Count Samples | Page Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| astro | 369.50, 615.90 | 492.70 ms | 246.40 ms | 12.50, 24.00 | 64.00, 88.00 | 20.00, 20.00 | 0.00, 0.00 | 0 |
| next-app-router | 865.70, 1227.10 | 1046.40 ms | 361.40 ms | 112.00, 234.20 | 164.00, 144.00 | 14.00, 14.00 | 1.00, 1.00 | 0 |
| nuxt | 913.70, 492.20 | 702.95 ms | 421.50 ms | 409.50, 57.70 | 444.00, 96.00 | 69.00, 89.00 | 0.00, 0.00 | 0 |
| zenith | 365.70, 348.80 | 357.25 ms | 16.90 ms | 12.10, 11.90 | 60.00, 68.00 | 4.00, 4.00 | 0.00, 0.00 | 0 |

#### Artifact Pointers
- `astro`: [metrics](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/static-marketing__astro/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/static-marketing__astro/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/static-marketing__astro/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/static-marketing__astro/sample-1.console.json)
- `next-app-router`: [metrics](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/static-marketing__next-app-router/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/static-marketing__next-app-router/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/static-marketing__next-app-router/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/static-marketing__next-app-router/sample-1.console.json)
- `nuxt`: [metrics](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/static-marketing__nuxt/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/static-marketing__nuxt/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/static-marketing__nuxt/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/static-marketing__nuxt/sample-1.console.json)
- `zenith`: [metrics](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/static-marketing__zenith/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/static-marketing__zenith/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/static-marketing__zenith/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/static-marketing__zenith/sample-1.console.json)

### Content Index
| Framework | Browser Ready Samples | Median | Spread | DOM Interactive Samples | FCP Samples | Script Count Samples | Long Task Count Samples | Page Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| astro | 362.30, 340.20 | 351.25 ms | 22.10 ms | 12.30, 11.60 | 60.00, 76.00 | 20.00, 20.00 | 0.00, 0.00 | 0 |
| next-app-router | 1057.40, 1078.90 | 1068.15 ms | 21.50 ms | 74.80, 205.20 | 100.00, 188.00 | 14.00, 14.00 | 1.00, 1.00 | 0 |
| nuxt | 694.80, 522.40 | 608.60 ms | 172.40 ms | 391.70, 55.50 | 424.00, 100.00 | 34.00, 66.00 | 0.00, 0.00 | 0 |
| zenith | 298.10, 405.30 | 351.70 ms | 107.20 ms | 8.50, 29.40 | 44.00, 108.00 | 4.00, 4.00 | 0.00, 0.00 | 0 |

#### Artifact Pointers
- `astro`: [metrics](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/content-index__astro/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/content-index__astro/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/content-index__astro/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/content-index__astro/sample-1.console.json)
- `next-app-router`: [metrics](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/content-index__next-app-router/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/content-index__next-app-router/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/content-index__next-app-router/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/content-index__next-app-router/sample-1.console.json)
- `nuxt`: [metrics](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/content-index__nuxt/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/content-index__nuxt/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/content-index__nuxt/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/content-index__nuxt/sample-1.console.json)
- `zenith`: [metrics](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/content-index__zenith/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/content-index__zenith/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/content-index__zenith/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/content-index__zenith/sample-1.console.json)

### Interactive Filter
| Framework | Browser Ready Samples | Median | Spread | DOM Interactive Samples | FCP Samples | Script Count Samples | Long Task Count Samples | Page Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| astro | 514.90, 313.00 | 413.95 ms | 201.90 ms | 20.10, 22.00 | 80.00, 56.00 | 20.00, 20.00 | 0.00, 0.00 | 0 |
| next-app-router | 794.80, 929.40 | 862.10 ms | 134.60 ms | 59.40, 97.70 | 96.00, 136.00 | 16.00, 16.00 | 1.00, 1.00 | 0 |
| nuxt | 822.10, 511.30 | 666.70 ms | 310.80 ms | 432.50, 60.10 | 476.00, 104.00 | 32.00, 95.00 | 0.00, 0.00 | 0 |
| zenith | 292.90, 287.60 | 290.25 ms | 5.30 ms | 9.50, 8.30 | 56.00, 52.00 | 4.00, 4.00 | 0.00, 0.00 | 0 |

#### Artifact Pointers
- `astro`: [metrics](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/interactive-filter__astro/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/interactive-filter__astro/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/interactive-filter__astro/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152712Z-matrix/hydration-runtime/interactive-filter__astro/sample-1.console.json)
- `next-app-router`: [metrics](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/interactive-filter__next-app-router/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/interactive-filter__next-app-router/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/interactive-filter__next-app-router/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152739Z-matrix/hydration-runtime/interactive-filter__next-app-router/sample-1.console.json)
- `nuxt`: [metrics](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/interactive-filter__nuxt/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/interactive-filter__nuxt/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/interactive-filter__nuxt/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152816Z-matrix/hydration-runtime/interactive-filter__nuxt/sample-1.console.json)
- `zenith`: [metrics](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/interactive-filter__zenith/sample-1.metrics.json), [trace](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/interactive-filter__zenith/sample-1.trace.zip), [screenshot](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/interactive-filter__zenith/sample-1.screenshot.png), [console](../../../../apps/benchmarks/results/20260319T152955Z-matrix/hydration-runtime/interactive-filter__zenith/sample-1.console.json)

