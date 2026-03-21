---
title: "Equivalent Page Comparisons"
description: "Draft rules for defining comparable pages across Zenith and established frameworks."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "comparisons", "fairness"]
---

# Equivalent Page Comparisons

This document defines the page-equivalence rules for Zenith benchmark work.

## What Is Being Measured

Measure the same page responsibilities across frameworks, including matching structure, interaction scope, and content behavior.

## What The Metric Represents

Equivalent page comparisons determine whether a benchmark is testing framework behavior or merely comparing different workloads.

## Why It Matters

Without workload parity, benchmark numbers become a description of implementation drift rather than a fair comparison.

## Zenith Benefits If Proven

If Zenith performs well under equivalent page rules, that would make any positive result more credible because the comparison setup was constrained first.

## Tradeoffs and Constraints

Perfect equivalence is not always possible because frameworks expose different primitives, defaults, and composition models. Those differences must be documented rather than hidden.

## Interpretation Notes

Every benchmark should explain where equivalence was exact, where an approximation was required, and what that means for interpreting the outcome.
