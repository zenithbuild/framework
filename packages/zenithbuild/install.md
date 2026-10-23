# Installing zenithbuild

`zenithbuild` is designed to work both as a project-local dev dependency and, in the future, as a globally installed agent skill package.

## Project-local install

Add `zenithbuild` to a Zenith project so the rules ship with the repo and agents can read them from `node_modules`:

```bash
npm install -D zenithbuild
```

After installation, the package exposes these files under `node_modules/zenithbuild/`:

- `AGENTS.md` — full agent contract
- `SKILL.md` — agent quick-start
- `README.md` — package overview
- `rules/*.md` — focused rule modules
- `examples/*.zen` — reference code

## Future global install

`zenithbuild` will also support a global install so agents can resolve one canonical copy:

```bash
npm install -g zenithbuild
```

Agents can then locate the package path with:

```bash
npm root -g
# e.g. /usr/local/lib/node_modules/zenithbuild
```

## Copying rules into the repo

If you want the rules to persist without relying on `node_modules`, copy them into `.agents/skills/zenith/`:

```bash
mkdir -p .agents/skills/zenith
cp node_modules/zenithbuild/rules/*.md .agents/skills/zenith/
cp node_modules/zenithbuild/AGENTS.md .agents/skills/zenith/SKILL.md
```

## Do not publish manually

This package is npm-ready but should not be published until the maintainers review the contents and agree on the first public version.
