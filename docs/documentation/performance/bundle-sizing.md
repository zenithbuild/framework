---
title: "Bundle Sizing"
description: "Draft benchmark definition for measuring Zenith bundle size on equivalent pages."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "bundles"]
---

# Bundle Sizing

This benchmark defines how Zenith bundle sizing should be measured against equivalent implementations in established frameworks.

## What Is Being Measured

Measure shipped client assets for an equivalent page, including the JavaScript and CSS required for the compared implementation.

## What The Metric Represents

Bundle sizing indicates how much client-side code and styling must be transferred before the page can fully run in the browser.

## Why It Matters

Smaller shipped assets can reduce network cost and improve startup conditions, especially on constrained devices or slower connections.

## Zenith Benefits If Proven

If Zenith ships less client overhead for equivalent pages, that would support its compiler-first goal of pushing more work out of runtime and into build output.

## Tradeoffs and Constraints

Frameworks optimize for different feature sets, defaults, and developer experiences. Bundle size should not be treated as a complete proxy for usability or capability.

## Interpretation Notes

Comparisons must separate framework overhead from application-specific assets and explain what was included in the shipped result.
