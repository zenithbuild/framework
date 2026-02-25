# CLI Contract

The Zenith CLI is the public API surface users interact with directly. These contracts are stable and tested in every beta train via clean-room verification.

## Commands

| Command | Behavior | Exit Code |
|---------|----------|-----------|
| `zenith --version` | Prints version, exits immediately | `0` |
| `zenith --help` | Prints usage, exits immediately | `0` |
| `zenith build` | Compiles `.zen` pages → static `dist/` | `0` on success |
| `zenith dev` | Starts development server with HMR | `0` on clean shutdown |
| `zenith preview` | Serves `dist/` statically for inspection | `0` on clean shutdown |

## Flag Guarantees

- `--help` and `--version` exit **before** any dependency resolution or version-mismatch checks.
- `--help` delegates to `@zenithbuild/cli` for the full help output.
- `--version` prints the `@zenithbuild/core` package version.

## Build Output Contract

When `zenith build` exits 0, the `dist/` directory contains:

| Artifact | Description |
|----------|-------------|
| `dist/index.html` | Root page |
| `dist/<route>/index.html` | One HTML file per `.zen` page |
| `dist/assets/*.js` | Per-page JS bundles |
| `dist/assets/runtime.*.js` | Zenith runtime |
| `dist/assets/router-manifest.json` | Client-side route map |
| `dist/assets/styles.*.css` | Compiled CSS |
| `dist/manifest.json` | Build manifest |

## Binary Resolution

The `zenith` binary is provided by `@zenithbuild/core` via `bin/zenith.js`. When installed locally:

```
node_modules/.bin/zenith → ../@zenithbuild/core/bin/zenith.js
```

The wrapper performs these steps in order:

1. Parse `--version` / `--help` → exit 0 immediately
2. Check internal package version alignment → warn on mismatch
3. Delegate to `@zenithbuild/cli` for the actual command

## Testing the Contract

These assertions are enforced by the `drift-gates.spec.js` test suite and the `template-regression.spec.mjs` clean-room test:

```bash
# In any Zenith project directory:
npx zenith --version   # must exit 0
npx zenith --help      # must exit 0
npx zenith build       # must exit 0, must produce dist/
```
