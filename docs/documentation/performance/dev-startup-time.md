---
title: "Dev Startup Time"
description: "Draft benchmark definition for measuring Zenith development server startup behavior."
version: "0.1"
status: "draft"
last_updated: "2026-03-18"
tags: ["performance", "benchmarking", "development"]
---

# Dev Startup Time

This benchmark defines how Zenith development startup should be measured for a fresh local session.

## What Is Being Measured

Measure the time required to start the development environment and reach a ready state for the target project.

## What The Metric Represents

Dev startup time captures the initial cost of entering an interactive authoring session.

## Why It Matters

A fast steady-state framework can still feel slow if every local session has a heavy boot path.

## Zenith Benefits If Proven

If Zenith starts quickly for comparable projects, that would support its goal of staying practical during real development rather than optimizing only for final output.

## Tradeoffs and Constraints

Startup behavior can be affected by file watching strategy, dependency size, prior caches, and whether the environment is already primed by earlier commands.

## Interpretation Notes

The ready-state definition must be explicit so results do not compare different meanings of “startup complete.”
