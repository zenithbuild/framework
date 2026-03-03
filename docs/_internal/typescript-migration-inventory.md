# TypeScript Migration Inventory

This inventory tracks the first-phase TypeScript migration scaffolding for the JS packages that need incremental conversion. It is intentionally internal-only and documents current package truth, not target-state guesses.

| Package | Source language today | Module type | `main` | `exports` | `types` | `bin` | Current build command | Current test/typecheck command | Sharp edges | Phase-1 typecheck scope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `packages/runtime` | JavaScript | ESM (`"type": "module"`) | `./dist/index.js` | `.` -> `./dist/index.js`, `./template` -> `./dist/template.js` | none | none | `mkdir -p dist && cp -a src/* dist/` | `npm run build && NODE_OPTIONS=--experimental-vm-modules jest --config jest.config.js`; `tsc -p tsconfig.json --noEmit` | Mixed browser + Node surface in `template.js`; dev overlay paths; DOM-heavy modules | `src/env.js`, `src/platform.js`, `src/ref.js`, `src/effect.js` |
| `packages/router` | JavaScript | ESM (`"type": "module"`) | `./dist/index.js` | `.` -> `./dist/index.js`, `./template` -> `./template.js`, `./ZenLink.zen` -> `./dist/ZenLink.zen` | No `types` field; root `index.d.ts` is shipped | none | `mkdir -p dist && cp -a src/* dist/ && cp src/ZenLink.zen dist/ZenLink.zen` | `npm run contract:deps && npm run contract:scan && npm run contract:template`; `tsc -p tsconfig.json --noEmit` | Browser-only globals, route event payload typing, root-level `template.js` / `index.d.ts` metadata asymmetry | `src/**/*.js` |
| `packages/cli` | JavaScript | ESM (`"type": "module"`) | `./dist/index.js` | `.` -> `./dist/index.js` | none | none declared in package manifest | `mkdir -p dist && cp -a src/* dist/` | `node --experimental-vm-modules ...jest... --runInBand`; `tsc -p tsconfig.json --noEmit` | Node-only surface, `child_process`, `fs.watch`, dynamic toolchain resolution, large orchestration modules | `src/toolchain-paths.js`, `src/toolchain-runner.js`, `src/compiler-bridge-runner.js`, `src/version-check.js`, `src/types/index.js`, `src/types/generate-env-dts.js`, `src/types/generate-routes-dts.js`, `src/ui/env.js` |

## Phase-1 constraints

- Public entrypoints, module format, and shipped JS output paths stay unchanged.
- `tsconfig.build.json` exists only as future emit scaffolding; package build scripts still copy JS into `dist/`.
- `allowJs + checkJs` is intentionally scoped for `runtime` and `cli` to keep this prep phase green without rewriting large modules.
