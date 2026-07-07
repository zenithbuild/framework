# Detecting a Zenith Project

Agents should treat a repository as a Zenith project when **any** of the following are present:

1. `.zen` files anywhere in the project tree.
2. `zenith.config.*` files (for example `zenith.config.ts` or `zenith.config.js`).
3. Zenith packages in `package.json` dependencies or devDependencies, such as:
   - `@zenithbuild/core`
   - `@zenithbuild/compiler`
   - `@zenithbuild/runtime`
   - `@zenithbuild/router`
   - `@zenithbuild/cli`
   - `create-zenith`
   - `zenithbuild`
4. `src/pages/**/*.zen` route files.
5. `src/components/**/*.zen` component files.
6. `.agents/skills/zenith/` containing Zenith rule files.
7. `AGENTS.md` in the repo root that declares the project as a Zenith project or references Zenith rules.

If any detector matches, load the contract from the nearest source:

- `.agents/skills/zenith/SKILL.md` or `AGENTS.md` in the repo
- `node_modules/zenithbuild/AGENTS.md` when `zenithbuild` is installed locally
- the globally installed `zenithbuild` package when no local copy exists

Only generate code that follows the Zenith agent contract once a Zenith project is detected.
