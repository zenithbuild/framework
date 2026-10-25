# Component Script Hoisting Contract (Zenith V0)

Canonical public docs: `../../docs/documentation/contracts/component-script-hoisting.md`


## Purpose
Component `<script>` blocks are compile-time artifacts. They are not runtime component lifecycles.

## Compiler Responsibilities
- Parse component scripts and validate forbidden primitives.
- Compute deterministic `hoist_id` values from canonicalized script source.
- Emit `components_scripts` in IR keyed by `hoist_id`.
- Own `components_scripts[].module_id`. The value is `{source_path}:script{index}`: the source path given to the compiler, with backslashes normalized to `/`, plus the script index in that file. `hoist_id` stays the content hash used for dedup and asset names. The CLI forwards `module_id` unchanged. The bundler rejects an empty `module_id`.
- Emit `component_instances` in deterministic traversal order.
- Rewrite template expression identifiers to deterministic instance keys.

## Bundler Responsibilities
- Consume `components_scripts` and emit deterministic component assets:
  - `assets/component.<hoist_id>.<hash>.js`
- Deduplicate identical component scripts by `hoist_id`.
- Inject page/runtime scripts and pass component factories to runtime `hydrate(payload)`.

## Runtime Responsibilities
- Consume component payload from bundler bootstrap.
- Instantiate component factories against explicit host selectors.
- Merge returned factory bindings into hydration state.
- Never parse templates, infer component graphs, or execute discovery logic.

## Forbidden Behavior
- No runtime AST parsing.
- No `eval`, `new Function`, or dynamic scope lookup.
- No implicit lifecycle registration or auto-mount scanning.
- No nondeterministic identifiers.
