# Zenith Component Model (V0 Sealed)

Status: FROZEN

## Core Principle

Zenith components are compile-time structural transforms. They are not runtime lifecycle units.

## Zenith Is NOT

- Not a runtime component framework.
- Not instance-per-component JS execution.
- Not a lifecycle-based system.
- Not VDOM.
- Not reactive proxy magic.
- Not script-per-component execution.

## Zenith Is

Zenith is compile-time structural transformation plus deterministic instance factories plus explicit hydration tables.

## Structural Rules

- Component `<script>` blocks are extracted at compile time.
- Component imports must be explicit (`import X from './X.zen'`); unresolved uppercase tags hard-fail.
- Import resolution is compile-time only; runtime never resolves component symbols.
- Scripts are transformed into deterministic factory modules keyed by stable `hoist_id`.
- Component declarations are represented in page IR as:
  - `components_scripts` (deduplicated module payloads)
  - `component_instances` (ordered host bindings)
- Runtime never parses component source and never infers component structure.

## Server/Client Script Split

- `<script server>` is never shipped directly to browser output.
- `prerender=true` routes embed deterministic `ssr_data` into emitted page modules.
- Non-prerender routes keep server script source in route metadata for preview request-time execution.
- Browser hydration consumes `ssr_data` through explicit payload fields only (`ssr.*` expression paths).

## Process Ownership

- Compiler:
  - Parses and validates component scripts.
  - Builds deterministic transitive module graph (discovery then topo sort).
  - Generates stable `hoist_id` and factory code.
  - Emits deterministic IR envelope only, including `graph_hash` and sorted `graph_edges`.
- Bundler:
  - Consumes IR from stdin.
  - Emits `component.<hoist_id>.<hash>.js` modules deterministically.
  - Injects script tags and bootstrap payload into HTML.
- Runtime:
  - Executes `hydrate(payload)` only.
  - Instantiates factories from payload components table.
  - Applies bindings and listeners using marker/index tables.
- CLI:
  - Spawns compiler and bundler binaries only.
  - Must not inspect IR to make emission decisions.

## Forbidden Drift

- Runtime component discovery by DOM scanning.
- Runtime script parsing/eval/new Function.
- CLI-side HTML/JS mutation.
- Bare internal module specifiers in emitted browser assets.
- Non-deterministic identifiers, ordering, or hashing.

## Determinism Invariants

- Identical component source must produce identical `hoist_id`.
- Identical transitive module graph must produce identical `graph_hash`.
- Identical `hoist_id` modules must be emitted once per build output.
- Component instance ordering is deterministic and stable across repeated builds.
- Two clean builds from identical inputs produce byte-identical outputs.

## Props Invariants

- Props are compile-time classified and serialized into deterministic instance tables.
- Runtime never reads DOM attributes to resolve props.
- Runtime never resolves props by identifier name lookup.
- Component factory props are frozen before injection.
- Signal props are references to signal table entries.
- Static props are immutable literal values.
- Component factories never receive raw expression strings.
- Runtime throws on malformed prop payloads.
