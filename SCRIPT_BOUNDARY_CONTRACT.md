# Zenith V0 Script Boundary Contract

Canonical public docs: `../zenith-docs/documentation/contracts/script-boundary.md`


Status: FROZEN (V0)

This contract defines script emission authority, injection semantics, and runtime/bootstrap boundaries for Zenith V0.

## 1. Emission Authority

Allowed:
- Bundler may inject `<script>` tags into emitted HTML.

Forbidden:
- CLI emits or injects `<script>` tags.
- Runtime emits or injects `<script>` tags.
- Router emits or injects `<script>` tags.

## 2. Injection Semantics

Bundler injection rules:
- Inject scripts before `</body>`.
- Use module scripts only.
- Use external asset references only.

Required format:
- `<script type="module" src="/assets/<hash>.js"></script>`

Forbidden:
- Inline script content in emitted HTML.
- Duplicate injection of the same script.

## 3. Emission Conditions

Bundler emits JS assets only when required by IR/config:
- `ir.expressions.length > 0` (runtime + page module path), or
- `ir.component_instances.length > 0` (component factory module path), or
- `router === true` (router asset path).

CLI must not gate JS emission using IR internals.

## 4. JavaScript Module Rules

Required:
- Emitted JS is ESM.
- Import specifiers in emitted assets are relative/self-contained.

Forbidden:
- CommonJS emission.
- Bare module specifiers in emitted browser assets.
- Global namespace mutation patterns (e.g., `window.* = ...`).

## 5. Runtime Boundary

Runtime behavior remains explicit and minimal:
- No auto-mount side effects.
- No auto DOM scanning on load.
- No global-state mutation side channels.

Bundler-generated bootstrap decides hydration/mount entry.

## 6. Expression Bootstrap Contract

Bundler-generated page bootstrap must preserve deterministic expression ordering and index alignment with HTML markers.

Component script bootstrap must preserve:
- Deterministic `hoist_id`-to-asset mapping.
- Deterministic component instance ordering.
- One hydrate payload containing `components` table.

Forbidden:
- Random IDs.
- Time-based emission.
- Dynamic key-order nondeterminism in emitted output.

## 7. Router Script Rules

Router is emitted as a separate asset and injected only when `router: true`.

Forbidden:
- Router injection when `router: false`.
- Router global namespace exposure.

## 8. Hard Laws (V0)

1. Only bundler injects scripts.
2. All emitted scripts are ESM.
3. No inline JS in emitted HTML.
4. No global namespace mutation from emitted assets.
5. Runtime never auto-executes beyond explicit bootstrap.
6. CLI never inspects IR to decide emission.
7. No bare module specifiers in emitted browser output.
8. Injection is deterministic and single-pass.
