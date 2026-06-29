# Graphify Kimi Scoped Evaluation

Eval date: 2026-06-27 America/Chicago
Closeout note: 2026-06-28 America/Chicago

## Scope

This evaluation used `kimi-k2.7-code:cloud` through Ollama's OpenAI-compatible backend.

Scope was package-level only. This was not a full-repo extraction, and no `cluster-only` report was generated.

## Command Shape

Secrets were not read from `.env` or printed. Paid provider keys were unset before each run, and Graphify was pointed at the local Ollama OpenAI-compatible route. Environment variable values are intentionally omitted here.

```bash
unset ANTHROPIC_API_KEY
unset GEMINI_API_KEY
unset GOOGLE_API_KEY
unset MOONSHOT_API_KEY
unset DEEPSEEK_API_KEY
unset OPENAI_API_KEY
unset OPENAI_BASE_URL
unset OPENAI_MODEL
unset OPENAI_TOKEN
unset OLLAMA_BASE_URL
unset OLLAMA_MODEL
unset OLLAMA_API_KEY

# Set OpenAI-compatible backend variables for the Ollama route and selected model.
# Values omitted.

graphify extract <package-path> \
  --backend openai \
  --token-budget 1000 \
  --max-concurrency 1 \
  --api-timeout 300 \
  --force
```

## Results

| Package | Nodes | Edges | Communities | Semantic extraction | Graph size |
| --- | ---: | ---: | ---: | --- | ---: |
| `packages/runtime` | 501 | 939 | 44 | fresh, 3/3 chunks | 444K |
| `packages/compiler` | 905 | 2280 | 42 | fresh, 4/4 chunks | 1.1M |
| `packages/router` | 468 | 696 | 26 | cached, 2 hit / 0 miss | 351K |
| `packages/cli` | 1701 | 3408 | 132 | fresh, 3/3 chunks | 1.6M |

## Repo Hygiene

- Generated outputs stayed under package-local `graphify-out/` directories.
- Generated outputs were ignored by the existing `.gitignore` `graphify-out/` rule.
- The tracked tree stayed clean after each run.
- `.env` protections belong in `.git/info/exclude`, not tracked `.gitignore`, unless the repo separately decides to adopt a tracked secret-ignore policy.

## Verdict

Graphify plus `kimi-k2.7-code:cloud` through Ollama is viable for scoped package-level extraction and evaluation.

It is not yet proven safe or useful for full-repo extraction. Raw `graph.json` is machine output and is expected to be long. Treat graph output as supporting context only, not as architectural truth.

## Next Recommendation

- Do not run full-repo extraction first.
- Inspect the usefulness of one package graph or report before expanding.
- Run `cluster-only` only after output path behavior is understood and confirmed not to write tracked or unignored files.
