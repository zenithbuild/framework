---
title: "Performance Methodology"
description: "Draft methodology for Zenith benchmark planning, reproducibility rules, and interpretation standards."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "methodology", "reproducibility"]
---

# Performance Methodology

Zenith is entering a benchmark phase after being hardened through active framework and product work. This area documents how comparisons will be run and how results will be interpreted before any public claims are made.

## Public Methodology

- Every benchmark must publish the target workload, environment assumptions, framework versions, and the steps required to reproduce the result.
- Equivalent page comparisons are required. Zenith should not be compared against a materially different implementation and then described as an apples-to-apples result.
- Measurements should separate framework behavior from unrelated application code, tooling extensions, or third-party assets whenever possible.

## Fair Comparison Rules

- Compare against established frameworks using feature-equivalent pages and comparable authoring constraints.
- Distinguish cold-path and warm-path behavior instead of collapsing them into one conclusion.
- Note when a framework is optimized for a different use case so results are not overstated.

## Benchmark Tracks

- Bundle sizing
- Cold build time
- Dev startup time
- Rebuild behavior
- Hydration and runtime cost
- Equivalent page comparisons
- Comparison interpretation

## Publication Standard

Results should be published with context, not headline language. Zenith is being evaluated as a tool for specific needs, not as a universal winner across every workload.

Definition of Done: a published benchmark must include the measurement definition, reproduction steps, interpretation notes, and stated tradeoffs.

Failure Modes: incomplete environment details, mismatched workloads, hidden caching assumptions, and selective reporting all make comparisons unreliable.
