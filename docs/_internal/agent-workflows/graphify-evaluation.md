# Graphify Evaluation for Zenith

Issue: #167 - Evaluate Graphify as optional repo-context layer for Zenith issue closeout

## Verdict

Keep Graphify experimental. Merge only the Roast review skill, this evaluation note, and the local `graphify-out/` ignore entry.

Graphify did not prove value in this run because the repo graph did not build. No `graphify-out/graph.json` was generated, no targeted query succeeded, and there is no evidence yet that Graphify maps Zenith package boundaries, distinguishes generated output, handles archived legacy snapshots, or reduces raw repo scanning.

## What changed

- Added `.agents/skills/roast/SKILL.md` as a repo-local review protocol.
- Added this evaluation note under `docs/_internal/agent-workflows/`.
- Added `graphify-out/` to `.gitignore` so local graph output stays out of the PR.

No runtime, compiler, router, bundler, adapter, middleware, package API, release, CI, generated output, package manifest, lockfile, or `AGENTS.md` changes are part of this closeout.

## Roast skill

The Roast skill is the only adopted workflow piece from this branch.

It is allowed because it is instruction-only review guidance, not framework runtime behavior and not a package dependency. It adapts the community Roast pattern from `https://claudskills.com/skills/roast/`: five skeptical review lenses with evidence validation before claims are accepted.

For Zenith, the skill defaults to one reviewer agent and uses the five personas as review lenses. It does not enable a multi-agent swarm by default.

## Graphify setup tried

- Installed `uv` as a user-level tool with `python3 -m pip install --user uv`.
- Installed Graphify with `python3 -m uv tool install graphifyy`.
- Confirmed `graphify 0.8.49`.
- Ran `graphify install --platform agents --project`.
- Ran `graphify .` from the Zenith repo root.
- Ran six targeted `graphify query` commands.

The repo-local agents install created `.agents/skills/graphify/`, but those files are intentionally uncommitted. The generated Graphify skill still uses `/graphify` wording and includes subagent-heavy extraction instructions, so it should not become Zenith policy without separate review.

`graphify install --platform codex` was not run because the CLI help advertises Codex installation as an `AGENTS.md` mutation, and Graphify has not earned that level of repo policy yet.

## Result

`graphify .` failed before graph output:

```text
error: no LLM API key found (279 doc/paper/image file(s) need semantic extraction). Set GEMINI_API_KEY or GOOGLE_API_KEY (gemini), MOONSHOT_API_KEY (kimi), ANTHROPIC_API_KEY (claude), OPENAI_API_KEY (openai), DEEPSEEK_API_KEY (deepseek), or pass --backend. A code-only corpus needs no key.
[graphify extract] scanning /Users/judahsullivan/zenith/framework
[graphify extract] found 856 code, 254 docs, 0 papers, 25 images
```

Generated outputs:

- `graphify-out/`: empty local directory
- `graphify-out/graph.json`: not generated
- `graphify-out/graph.html`: not generated
- `graphify-out/GRAPH_REPORT.md`: not generated

Each targeted query failed with:

```text
error: graph file not found: /Users/judahsullivan/zenith/framework/graphify-out/graph.json
```

## What remains unproven

- Package boundary mapping
- Source versus generated output detection
- Active source versus archived legacy snapshot detection
- Fixture, golden file, and generated artifact ranking
- Relevant test or audit discovery
- Reduced raw file reading
- Lower issue-closeout overhead

## Graphify-assisted issue packet

Sample future packet only. Do not implement it as part of #167.

Goal: evaluate whether generated `.agents/skills/graphify/` files should be committed, revised, or removed after a successful Graphify build.

Allowed files:

- `docs/_internal/agent-workflows/graphify-evaluation.md`
- `.agents/skills/graphify/**` only if explicitly approved after review
- `.gitignore` only for local Graphify output ignores

Forbidden files:

- `AGENTS.md` unless separately approved
- Package manifests, lockfiles, and CI scripts
- Runtime, compiler, router, bundler, adapter, middleware, package API, release, and generated output files

Required proof before adoption:

- One successful graph build
- One useful package-boundary query
- One noise or false-positive check covering generated output, fixtures, or archived legacy snapshots

Roast review command after implementation:

```text
$roast
Review the Graphify setup and evaluation for Zenith issue #167. Be strict. Decide whether this workflow is useful or just extra process.
```

## Final recommendation

Merge Roast skill plus evaluation doc plus `graphify-out/` ignore only.

Keep Graphify uncommitted until a follow-up run proves one successful graph build, one useful boundary query, and one noise or false-positive check. Do not adopt Graphify as repo policy, mutate `AGENTS.md`, enable multi-agent extraction, or commit generated Graphify skill/config files before that proof exists.
