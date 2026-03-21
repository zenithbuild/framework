---
title: "Framework Cold Build and Dev Startup Comparison (March 19, 2026)"
description: "Validated cold-build and dev-startup runs across Zenith, Astro, Next App Router, and Nuxt using the shared benchmark fixtures."
status: "draft"
last_updated: "2026-03-19"
tags: ["performance", "benchmarking", "results", "generated"]
---

> Generated from validated benchmark result JSON and the benchmark results manifest.
# Framework Cold Build and Dev Startup Comparison (March 19, 2026)

Validated cold-build and dev-startup runs across Zenith, Astro, Next App Router, and Nuxt using the shared benchmark fixtures.

## Caveats
- This page is generated from multiple validated benchmark result files listed below.
- Tables show recorded samples, medians, and spread only. They do not add ranking or winner language.
- If a requested track or case is missing from one or more runs, the page shows the available rows and the overlap checks instead of filling missing values.

## Compared Runs
| Framework | Run ID | Runner | Generated At | Source JSON |
| --- | --- | --- | --- | --- |
| zenith | `20260319T152955Z-matrix` | `matrix` | 2026-03-19T15:31:21.732Z | `apps/benchmarks/results/20260319T152955Z-matrix/matrix.json` |
| astro | `20260319T074653Z-matrix` | `matrix` | 2026-03-19T07:48:56.755Z | `apps/benchmarks/results/20260319T074653Z-matrix/matrix.json` |
| next-app-router | `20260319T074901Z-matrix` | `matrix` | 2026-03-19T07:50:55.943Z | `apps/benchmarks/results/20260319T074901Z-matrix/matrix.json` |
| nuxt | `20260319T075112Z-matrix` | `matrix` | 2026-03-19T07:53:24.510Z | `apps/benchmarks/results/20260319T075112Z-matrix/matrix.json` |

## Environment Summary
| Field | Values |
| --- | --- |
| Frameworks | `zenith`, `astro`, `next-app-router`, `nuxt` |
| Tracks | `cold-build`, `dev-startup` |
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
| Requested tracks | match | `cold-build`, `dev-startup` |
| Track coverage by framework | match | Each selected framework covers every requested track. |
| Run shape compatibility | match | Requested tracks: `cold-build`, `dev-startup`; runners: `matrix` |
| Sparse comparison cells | match | Every requested track/case cell contains one row per framework. |
| Duplicate framework inputs | match | Each selected input contributes a distinct framework. |
| Hydration measurement contract | not-applicable | Hydration/runtime is not part of this comparison page. |
| Rebuild measurement contract | not-applicable | Rebuild is not part of this comparison page. |

## Cold Build
Comparable metric in this section is the recorded `durationMs` summary for the selected track.

### Static Marketing
| Framework | Samples | Median | Spread | Dist Files | Dist Bytes |
| --- | --- | --- | --- | --- | --- |
| astro | 3943.25, 4855.92 | 4399.59 ms | 912.67 ms | 3 | 5315 B (5.19 KiB) |
| next-app-router | 5397.88, 6545.16 | 5971.52 ms | 1147.28 ms | 190 | 4098317 B (4002.26 KiB) |
| nuxt | 9087.20, 8065.71 | 8576.45 ms | 1021.49 ms | 146 | 2301777 B (2247.83 KiB) |
| zenith | 1660.75, 1360.63 | 1510.69 ms | 300.12 ms | 12 | 179916 B (175.70 KiB) |

#### Artifact Pointers
- `astro`: [dist size](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/static-marketing__astro/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/static-marketing__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/static-marketing__astro/sample-1.stderr.log)
- `next-app-router`: [dist size](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/static-marketing__next-app-router/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/static-marketing__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/static-marketing__next-app-router/sample-1.stderr.log)
- `nuxt`: [dist size](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/static-marketing__nuxt/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/static-marketing__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/static-marketing__nuxt/sample-1.stderr.log)
- `zenith`: [dist size](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/static-marketing__zenith/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/static-marketing__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/static-marketing__zenith/sample-1.stderr.log)

### Content Index
| Framework | Samples | Median | Spread | Dist Files | Dist Bytes |
| --- | --- | --- | --- | --- | --- |
| astro | 5324.88, 5044.18 | 5184.53 ms | 280.70 ms | 5 | 8144 B (7.95 KiB) |
| next-app-router | 7438.77, 7361.77 | 7400.27 ms | 77.00 ms | 241 | 4452038 B (4347.69 KiB) |
| nuxt | 10295.09, 9326.72 | 9810.90 ms | 968.37 ms | 152 | 2309692 B (2255.56 KiB) |
| zenith | 1275.97, 1273.83 | 1274.90 ms | 2.14 ms | 16 | 195741 B (191.15 KiB) |

#### Artifact Pointers
- `astro`: [dist size](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/content-index__astro/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/content-index__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/content-index__astro/sample-1.stderr.log)
- `next-app-router`: [dist size](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/content-index__next-app-router/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/content-index__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/content-index__next-app-router/sample-1.stderr.log)
- `nuxt`: [dist size](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/content-index__nuxt/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/content-index__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/content-index__nuxt/sample-1.stderr.log)
- `zenith`: [dist size](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/content-index__zenith/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/content-index__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/content-index__zenith/sample-1.stderr.log)

### Interactive Filter
| Framework | Samples | Median | Spread | Dist Files | Dist Bytes |
| --- | --- | --- | --- | --- | --- |
| astro | 4897.74, 4691.10 | 4794.42 ms | 206.64 ms | 1 | 4402 B (4.30 KiB) |
| next-app-router | 5586.15, 4905.94 | 5246.05 ms | 680.21 ms | 145 | 3756824 B (3668.77 KiB) |
| nuxt | 6825.21, 8955.51 | 7890.36 ms | 2130.30 ms | 140 | 2298400 B (2244.53 KiB) |
| zenith | 1192.57, 1156.15 | 1174.36 ms | 36.42 ms | 8 | 196190 B (191.59 KiB) |

#### Artifact Pointers
- `astro`: [dist size](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/interactive-filter__astro/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/interactive-filter__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/cold-build/interactive-filter__astro/sample-1.stderr.log)
- `next-app-router`: [dist size](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/interactive-filter__next-app-router/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/interactive-filter__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/cold-build/interactive-filter__next-app-router/sample-1.stderr.log)
- `nuxt`: [dist size](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/interactive-filter__nuxt/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/interactive-filter__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/cold-build/interactive-filter__nuxt/sample-1.stderr.log)
- `zenith`: [dist size](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/interactive-filter__zenith/sample-1.dist-size.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/interactive-filter__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/cold-build/interactive-filter__zenith/sample-1.stderr.log)

## Dev Startup
Comparable metric in this section is the recorded `durationMs` summary for the selected track.

### Static Marketing
| Framework | Samples | Median | Spread | Ready Status | Build Status |
| --- | --- | --- | --- | --- | --- |
| astro | 5222.02, 5547.39 | 5384.70 ms | 325.37 ms | 200 | ok |
| next-app-router | 3869.63, 4722.97 | 4296.30 ms | 853.34 ms | 200 | ok |
| nuxt | 3704.55, 3355.24 | 3529.89 ms | 349.31 ms | 200 | ok |
| zenith | 1342.11, 1132.97 | 1237.54 ms | 209.14 ms | 200 | ok |

#### Artifact Pointers
- `astro`: [ready state](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/static-marketing__astro/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/static-marketing__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/static-marketing__astro/sample-1.stderr.log)
- `next-app-router`: [ready state](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/static-marketing__next-app-router/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/static-marketing__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/static-marketing__next-app-router/sample-1.stderr.log)
- `nuxt`: [ready state](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/static-marketing__nuxt/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/static-marketing__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/static-marketing__nuxt/sample-1.stderr.log)
- `zenith`: [ready state](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/static-marketing__zenith/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/static-marketing__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/static-marketing__zenith/sample-1.stderr.log)

### Content Index
| Framework | Samples | Median | Spread | Ready Status | Build Status |
| --- | --- | --- | --- | --- | --- |
| astro | 5576.01, 6808.24 | 6192.13 ms | 1232.23 ms | 200 | ok |
| next-app-router | 4200.86, 4278.48 | 4239.67 ms | 77.62 ms | 200 | ok |
| nuxt | 3834.49, 3739.04 | 3786.76 ms | 95.45 ms | 200 | ok |
| zenith | 1390.12, 1278.92 | 1334.52 ms | 111.20 ms | 200 | ok |

#### Artifact Pointers
- `astro`: [ready state](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/content-index__astro/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/content-index__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/content-index__astro/sample-1.stderr.log)
- `next-app-router`: [ready state](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/content-index__next-app-router/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/content-index__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/content-index__next-app-router/sample-1.stderr.log)
- `nuxt`: [ready state](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/content-index__nuxt/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/content-index__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/content-index__nuxt/sample-1.stderr.log)
- `zenith`: [ready state](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/content-index__zenith/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/content-index__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/content-index__zenith/sample-1.stderr.log)

### Interactive Filter
| Framework | Samples | Median | Spread | Ready Status | Build Status |
| --- | --- | --- | --- | --- | --- |
| astro | 6496.19, 5386.10 | 5941.15 ms | 1110.09 ms | 200 | ok |
| next-app-router | 4464.88, 3589.51 | 4027.20 ms | 875.37 ms | 200 | ok |
| nuxt | 4278.83, 3383.08 | 3830.95 ms | 895.75 ms | 200 | ok |
| zenith | 1710.27, 1185.19 | 1447.73 ms | 525.08 ms | 200 | ok |

#### Artifact Pointers
- `astro`: [ready state](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/interactive-filter__astro/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/interactive-filter__astro/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074653Z-matrix/dev-startup/interactive-filter__astro/sample-1.stderr.log)
- `next-app-router`: [ready state](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/interactive-filter__next-app-router/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/interactive-filter__next-app-router/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T074901Z-matrix/dev-startup/interactive-filter__next-app-router/sample-1.stderr.log)
- `nuxt`: [ready state](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/interactive-filter__nuxt/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/interactive-filter__nuxt/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T075112Z-matrix/dev-startup/interactive-filter__nuxt/sample-1.stderr.log)
- `zenith`: [ready state](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/interactive-filter__zenith/sample-1.ready-state.json), [stdout](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/interactive-filter__zenith/sample-1.stdout.log), [stderr](../../../../apps/benchmarks/results/20260319T152955Z-matrix/dev-startup/interactive-filter__zenith/sample-1.stderr.log)

