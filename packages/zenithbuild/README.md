# zenithbuild

Agent-ready skills and rules for building [Zenith](https://github.com/zenithbuild/framework) framework projects.

## What is zenithbuild?

`zenithbuild` is a standalone, publishable package that bundles the canonical Zenith agent contract:

- Event binding rules (`on:<event>={handler}`)
- Reactivity primitives (`state`, `signal()`, `ref<T>()`)
- Canonical DOM and environment access (`zenWindow`, `zenDocument`, `zenOn`, `zenResize`, `collectRefs`)
- Server-first route protection (`guard` / `load`)
- Tailwind token usage and `dark:` variants
- Forbidden framework-drift patterns (React, Vue, Svelte, Astro, generic CSS)
- File-size limits (500 lines per source file)

It is meant to be consumed by coding agents such as GLM, KIMI, Codex, Cursor, Claude Code, and any other agent that needs deterministic Zenith authoring rules.

## Why agents need it

Zenith is a compiler-first UI framework. Familiar-looking syntax does **not** imply React, Vue, or Svelte semantics. Without the contract, agents tend to drift into generic framework patterns. `zenithbuild` gives agents a single, versioned source of truth for the non-negotiable rules.

## Local install

Install into a Zenith project as a dev dependency:

```bash
npm install -D zenithbuild
```

After installation, agents can read the rules from `node_modules/zenithbuild/rules/` or copy them into the repo under `.agents/skills/zenith/`.

## skills.sh install

Install the Zenith agent skill directly from the framework repository:

```bash
npx skills add zenithbuild/framework --skill zenithbuild
```

Direct path install:

```bash
npx skills add https://github.com/zenithbuild/framework/tree/master/skills/zenithbuild
```

The skills.sh folder at `skills/zenithbuild/` is mirrored by this npm package. The package readiness test keeps `SKILL.md`, `rules/`, and `examples/` in sync.

## Future global install

A global install lets agents find the canonical Zenith rules from one place:

```bash
npm install -g zenithbuild
```

When installed globally, an agent can resolve the package path and read the contract without a project-local copy. (This is a future workflow; the package metadata is already configured for it.)

## Copy or reference the rules in a repo

Two recommended workflows:

1. **Reference without copying:** Point the agent to `node_modules/zenithbuild/AGENTS.md` and `node_modules/zenithbuild/rules/` after installing locally.
2. **Copy into `.agents/skills/zenith/`:** Copy the rule files into the repo's own agent skill directory so the rules travel with the project even when `node_modules` is not committed.

Example copy command:

```bash
mkdir -p .agents/skills/zenith
cp node_modules/zenithbuild/rules/*.md .agents/skills/zenith/
cp node_modules/zenithbuild/AGENTS.md .agents/skills/zenith/SKILL.md
```

## What agents should read first

Read in this order:

1. `AGENTS.md` — the full, non-negotiable agent contract.
2. `rules/zenith-agent-contract.md` — concise contract summary.
3. `rules/zenith-dom-rules.md` — DOM access, refs, and environment rules.
4. `rules/zenith-routing-rules.md` — server-first guard/load route protection.
5. `rules/zenith-tailwind-rules.md` — Tailwind token and styling rules.
6. `examples/*.zen` — minimal, correct Zenith examples.

## Forbidden patterns

Agents must **not** generate:

- `onclick="..."`, `onClick=`, `@click=`, or `{#if}` / `{#each}` templating
- Direct call handlers like `on:click={doThing()}`
- `querySelector`, `querySelectorAll`, or `getElementById` inside `.zen` scripts
- Direct `addEventListener` calls inside `.zen` scripts
- React, Vue, Svelte, or Astro syntax
- Raw hex colors unless the Tailwind config defines them
- Generic client-only route guards
- Static prerendering (`prerender = true`) on routes that use `guard` or `load`
- Source files over 500 lines without prior approval

## License

MIT — same as the Zenith framework repository.
