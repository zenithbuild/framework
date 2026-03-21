---
title: "Hydration and Runtime Cost"
description: "Draft benchmark definition for measuring Zenith browser-side hydration and runtime work."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "hydration", "runtime"]
---

# Hydration and Runtime Cost

This benchmark defines how Zenith should measure the browser-side work required to make equivalent pages interactive.

## What Is Being Measured

Measure hydration scope, runtime execution cost, and the browser work needed to activate an equivalent page after it is delivered.

## What The Metric Represents

This metric shows how much browser-side work remains after the build and server-rendering phases have already done their part.

## Why It Matters

Hydration and runtime cost affect responsiveness, device pressure, and how much framework machinery remains active after load.

## Zenith Benefits If Proven

If Zenith keeps hydration and runtime cost narrow, that would support its claim that more UI work can be resolved before the browser boots.

## Tradeoffs and Constraints

Equivalent interactivity is required. A framework that hydrates less because it ships less behavior is not directly comparable to one carrying a richer page contract.

## Interpretation Notes

The benchmark must explain what was interactive, what was deferred, and which browser conditions were used to observe the result.
