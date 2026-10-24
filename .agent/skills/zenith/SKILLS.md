# ZenithBuild Agent Skills

This file is the canonical quick-start for any coding agent working in the ZenithBuild monorepo. Use it to stay aligned with Zenith's actual contracts, package boundaries, site behavior, and debugging history.

## 1. What Zenith Is

Zenith is a compiler-first UI framework.

- Zenith tries to resolve as much structure, scope, and binding intent as possible at compile time.
- Components are structural composition boundaries, not hidden runtime state containers.
- The runtime is intentionally narrow: it executes emitted plans, hydrates explicit payloads, and applies deterministic bindings. It should not become a second compiler.
- Familiar-looking syntax does not imply React, Vue, or Svelte semantics.
- Slot ownership, routing, hydration, and DOM access follow Zenith contracts, not generic framework conventions.
- If a behavior is unclear, check the repo contracts before writing code. Do not guess or import non-Zenith patterns.

## 2. Where To Look First

Source-truth by task:

| Task | Start here |
| --- | --- |
| Framework rule question | `AGENTS.md`, `docs/documentation/zenith-contract.md`, and the relevant contract doc under `docs/documentation/contracts/*` |
| Site content or rendering bug | `site/src/server/*Source.ts` for normalization plus the relevant `site/src/components/surfaces/*` component |
| Benchmark or reporting issue | `apps/benchmarks/*`, `docs/scripts/*`, and `docs/documentation/performance/*` |
| Distribution, release, or tooling-surface question | `README.md`, `docs/_internal/release-policy.md`, and `docs/REPO_SPLIT_EXECUTION_PLAN.md` |

Read in this order unless the task is clearly narrower:

1. `AGENTS.md`
   The repo-level Zenith agent contract. This is the fastest path to the current non-negotiable authoring rules.
2. `docs/README.md`
   Explains the canonical docs layout and where source truth lives.
3. `docs/documentation/zenith-contract.md`
   High-level framework laws: compile-time first, determinism, no drift, slot scope, controlled-first resolution.
4. `docs/documentation/guides/using-ai-with-zenith.md`
   Practical AI-specific guardrails for Zenith code generation.
5. Syntax/reactivity/routing docs for the problem you are touching:
   - `docs/documentation/syntax/events.md`
   - `docs/documentation/reactivity/reactivity-model.md`
   - `docs/documentation/reactivity/dom-and-environment.md`
   - `docs/documentation/reactivity/controlled-uncontrolled-components.md`
   - `docs/documentation/routing/route-protection.md`
6. Boundary contracts when responsibility is unclear:
   - `docs/documentation/contracts/no-magic.md`
   - `docs/documentation/contracts/compiler-boundary.md`
   - `docs/documentation/contracts/runtime-contract.md`
   - `docs/documentation/contracts/hydration-contract.md`
   - `docs/documentation/contracts/router-contract.md`

Package and workspace map:

- `packages/core`
  Public framework entrypoint. Treat `@zenithbuild/core` as the public API surface for real apps.
- `packages/cli`
  Dev/build/preview pipeline, scaffolding-adjacent tooling, and route/build orchestration.
- `packages/compiler`
  Parse, scope, lowering, emitted expressions, diagnostics, and compiler JSON envelope behavior.
- `packages/bundler`
  Build output assembly, runtime asset generation, and production packaging.
- `packages/runtime`
  Hydration, expression execution, refs, signals, and browser-side contract enforcement.
- `packages/router`
  Guard/load behavior, explicit soft-nav contract, and server-truth routing rules.
- `packages/language` and `packages/language-server`
  Only when the task is editor tooling, diagnostics, hovers, completions, or quick fixes.
- `site`
  Public website, docs/blog/changelog surfaces, CMS/local data adapters, and design/content work.
- `docs`
  Canonical docs, blog, generated AI indexes, and docs tooling.
- `apps/benchmarks`
  Benchmark harness and raw result generation. Use only for benchmark/methodology/reporting tasks.

Deciding the right layer:

- If the bug is in emitted expressions, signal rewrites, markers, hydration payloads, route semantics, or compiler diagnostics, start in `packages/*`.
- If the bug is in content shape, section grouping, source-mode behavior, surface layout, editorial copy, or route-specific page rendering, start in `site/*`.
- If the work is only about benchmark methodology, result rendering, comparability, or generated performance pages, stay in `apps/benchmarks/*` and `docs/documentation/performance/*`.
- Do not turn every site bug into framework work.
- Do not turn every site feature request into a new platform feature.
- Fix the narrowest correct layer first.

## 3. Zenith Syntax And Coding Rules

Events:

- Bind DOM events with `on:<event>={handler}`.
- Event names normalize to lowercase.
- Supported aliases include:
  - `on:hoverin` -> `pointerenter`
  - `on:hoverout` -> `pointerleave`
  - `on:doubleclick` -> `dblclick`
  - `on:esc` -> Escape-filtered `keydown`
- Handlers must be function-valued.
- Allowed: identifiers, member references, inline arrow/functions.
- Forbidden: string handlers and direct call expressions such as `on:click={save()}`.
- Prefer pointer events over mouse events when possible.

Reactivity primitives:

- Use `state` when the value directly drives DOM updates.
- Use `signal()` when you need stable identity plus explicit `get()` / `set()`, especially for frequent updates and cross-boundary coordination.
- Use `ref<T>()` for DOM handles, focus, measurement, or animation.

Scope and component rules:

- Slot content always preserves parent reactive scope.
- Component-local state does not silently rebind slot expressions.
- Interactive components should support controlled and uncontrolled patterns:
  - `open` / `defaultOpen` / `onOpenChange`
  - `value` / `defaultValue` / `onValueChange`
- If `open` or `value` is provided, it overrides internal state.

Canonical DOM and environment rules for `.zen`:

- Use `ref<T>()` for DOM access.
- Do not use `querySelector`, `querySelectorAll`, or `getElementById` in `.zen` scripts.
- Rare interop exception only: annotate the relevant query with `// zen-allow:dom-query <reason>`.
- Use `zenOn(...)` instead of direct `addEventListener(...)`.
- Use `zenWindow()` and `zenDocument()` for global browser access.
- Use `zenResize(...)` for resize-driven updates.
- Use `collectRefs(...)` for deterministic multi-node operations.
- Do not invent wrappers like `runtimeWindow` or `runtimeDocument`.
- Do not invent unsupported runtime APIs. If the canonical primitives are insufficient, say so explicitly.

Forbidden patterns:

- No `onclick="..."`, `onClick=`, or `@click=`.
- No Svelte block syntax like `{#if}` or `{#each}`.
- No unbound identifiers in markup.
- No generic DOM-query-driven workaround when scoped refs and Zenith helpers exist.

Routing and security:

- Protected routes must use `guard(ctx)` and `load(ctx)` in `<script server lang="ts">` or adjacent `page.guard.ts` / `page.load.ts` files.
- `guard(ctx)` returns `allow()`, `redirect(...)`, or `deny(...)`.
- `load(ctx)` returns `data(...)`, `redirect(...)`, or `deny(...)`.
- Server is the security boundary. Client routing is advisory UX, not security.
- A route using `guard` or `load` cannot also be statically generated with `prerender = true`.

File discipline:

- Treat 500 lines as a hard ceiling for files you create or edit.
- Split modules or components before growing files past that limit.

## 4. Repo Working Modes

Framework mode:

- Use this when the task is about compiler output, runtime behavior, routing rules, CLI behavior, diagnostics, or public framework contracts.
- Work mostly in `packages/compiler`, `packages/runtime`, `packages/router`, `packages/cli`, `packages/core`, and related tests/docs.
- Reproduce framework bugs with the smallest possible Zenith example or fixture when feasible.

Site mode:

- Use this when the task is about design, layout, copy, content mapping, docs/blog/changelog rendering, CMS integration, or route-specific surface behavior.
- Work mostly in `site/src/*`, `site/src/server/*`, and relevant content files under `site/src/content/*`.
- Check whether the site bug comes from normalization or surface rendering before changing framework packages.

Benchmark and reporting mode:

- Use this when the task is about benchmark runners, result schema, comparability gates, generated performance pages, or methodology notes.
- Work in `apps/benchmarks/*`, `docs/scripts/*`, and `docs/documentation/performance/*`.
- Benchmark outputs are evidence artifacts, not marketing copy.

Rule of thumb:

- Start at the layer that owns the failure.
- Escalate downward only after you can show the higher layer is feeding correct data into the lower one.

## 5. Troubleshooting And Debugging Playbook

Use this workflow:

1. Reproduce the issue in the surface that actually owns it.
2. Verify whether it appears in live dev, preview/build, or both.
3. For rendering bugs, believe the browser and live UI over a suspicious emitted artifact alone.
4. Decide whether the failure is:
   - data-shape / normalization
   - render-branch selection
   - compiler lowering / scoping
   - hydration / runtime execution
   - router / guard-load behavior
   - purely visual site-layer design work
5. Before rendering text, confirm the value is actually renderable.
   Zenith should render strings, numbers, booleans, nullish values, arrays of renderables, or fragment objects. Raw plain objects should be mapped into explicit nodes, not dumped into text positions.
6. For site work, inspect normalized view-model data, not just raw source records.
   In practice, that usually means checking the mapped output from `site/src/server/*Source.ts` and the props consumed by the relevant `site/src/components/surfaces/*`.
7. Check source mode.
   The site uses explicit `local` vs `directus` switches such as `ZENITH_BLOG_SOURCE`, `ZENITH_CHANGELOG_SOURCE`, and `ZENITH_DOCUMENTATION_SOURCE`. A bug may exist only in one source path even when the surface component is correct.
8. Compare dev vs preview/build when necessary.
   Some issues only appear after bundling or hydration, but do not claim success from build output if live dev still fails.
9. When compiler/runtime responsibility is unclear, classify it:
   - Compiler owns parsing, scope resolution, lowering, event validation, signal rewrites, and emitted `compiled_expr` / `signal_indices`.
   - Site normalization owns converting local docs/CMS records into route-safe, surface-safe view models.
   - Runtime owns deterministic payload validation, marker ordering, `fn_index` execution, fragment handling, and hard-fail behavior on contract drift.
   - Router owns explicit soft-nav behavior and mirroring server route truth.

Named rule: live dev beats build output

- If the UI shows `[object Object]`, inspect normalized site-layer data and the render branch first. The problem is usually data shape or text-position rendering, not a surface-level CSS issue.
- If local mode works but Directus mode fails, or the reverse, verify the active source mode before changing components. A mismatched `local` / `directus` path can make correct surface code look broken.
- If build artifacts look reasonable but the browser still fails in live dev, trust the live browser and inspect the hydration/runtime path first. Zenith build output is useful evidence, but it does not overrule an actual live failure.

Historical debugging examples:

- Plain-object property access regression:
  A real regression rewrote plain object member access like `contractContent.title` into signal-backed reads after component expansion. If a plain object chain starts turning into `signalMap.get(...).get()` behavior, suspect compiler rewrite/lowering, not the content object itself.
- `fn_index` / fragment-scope regression:
  A real regression compiled embedded markup expressions against `__zenith_fragment` instead of `__ctx.fragment`, which caused scope mismatches for runtime-evaluated fragment expressions. If compiled embedded markup fails while literal author intent looks valid, inspect the compiler/runtime boundary around `fn_index` and fragment helpers.

Treat those as historical examples of failure shape and ownership boundaries. They are not current intended framework behavior if the regressions are already fixed.

## 6. Design And Workflow Discipline

- Keep scope aligned to the ask.
- Do not add large new systems casually.
- Prefer small, local fixes before architecture changes.
- Split files instead of casually growing them past the repo ceiling.
- Explain what changed and why.
- Verify behavior before claiming success.
- Call out uncertainty honestly.
- If a Zenith primitive appears missing, state the missing primitive instead of papering over it with non-canonical patterns.

## 7. Site-Layer Guidance

For public site work:

- Preserve the existing Poland / Euro editorial direction rather than replacing it with generic SaaS polish.
- Home, About, Blog, Changelog, and Docs should feel like one family, but they should not collapse into one visual template.
- Home should feel proof-driven and system-level.
- About should carry philosophy, architecture, and framework position.
- Blog should stay editorial and explanatory.
- Changelog should stay version-first, source-first, and release-adjacent rather than turning into marketing copy.
- Docs should be quieter, more functional, and less theatrical than Blog or About.
- Avoid generic SaaS layouts, empty dashboard tropes, unnecessary border noise, and box clutter.
- Use real CMS/local data where available.
- Do not invent placeholder content, fake metrics, or fake editorial structure.
- Respect source-mode reality: local and Directus paths are explicit, and Directus access stays server-only.

## 8. Benchmark Truthfulness

- Trusted baselines matter more than flashy numbers.
- `apps/benchmarks` is methodology-first and writes raw artifacts for validation. Raw result folders are not public claims by themselves.
- Generated benchmark pages should stay evidence-first and avoid winner language or universal ranking claims.
- Keep rebuild caveats honest. Different invalidation scopes or settle methods are not silently interchangeable.
- Comparisons should only be treated as publishable when comparability gates line up: commit, machine/runtime fingerprint, sample counts, framework coverage, and measurement contracts.
- Do not turn benchmark work into site hype without trusted evidence.

## 9. Common Mistakes To Avoid

- Treating Zenith like React, Vue, or Svelte because some syntax looks familiar.
- Assuming component boundaries create hidden runtime ownership or automatic event forwarding.
- Rendering raw objects into text nodes instead of mapping explicit content.
- Using DOM query selectors in `.zen` scripts.
- Calling `addEventListener` directly in `.zen`.
- Inventing unsupported runtime helpers when `ref`, `zenOn`, `zenWindow`, `zenDocument`, `zenResize`, or `collectRefs` should be used.
- Fixing site-layer issues in framework packages before proving the framework is at fault.
- Declaring a rendering fix from emitted build output while live dev still fails in the browser.
- Claiming benchmark wins from contaminated, incomparable, or caveat-heavy runs.
- Growing files past repo discipline instead of splitting them.

## 10. When Reporting Back

When handing work back to another agent or a human, include:

- exact files changed
- what was fixed
- what layer the fix belongs to
- what you verified
- what remains deferred, if anything

Keep the handoff concrete. Name the layer explicitly: site normalization, site surface, compiler, runtime, router, CLI, docs, or benchmark/reporting.
