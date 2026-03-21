---
title: "Cold Build Time"
description: "Draft benchmark definition for clean Zenith build timing under reproducible conditions."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "builds"]
---

# Cold Build Time

This benchmark documents how Zenith cold builds should be measured before caches or prior runs reduce the workload.

## What Is Being Measured

Measure the time required to build an equivalent project from a clean state with caches cleared or reset according to the published procedure.

## What The Metric Represents

Cold build time reflects the full cost of the compiler and bundling path when the environment is not already warmed.

## Why It Matters

This metric affects first-time validation, CI behavior, release confidence, and the baseline cost of the toolchain.

## Zenith Benefits If Proven

If Zenith performs well on cold builds, that would support the claim that compiler-first work can stay practical at the project level rather than only in theory.

## Tradeoffs and Constraints

Build times depend on hardware, project shape, dependency graphs, and caching policy. The benchmark must state those conditions explicitly.

## Interpretation Notes

Cold build results should not be generalized to everyday edit cycles without separate rebuild and startup measurements.
