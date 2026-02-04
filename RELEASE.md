# Zenith Release Discipline

To ensure correct distribution and prevent broken user projects, the following rules MUST be followed:

## 1. Zero Local Links
- NO `file:`, `link:`, or `workspace:*` dependencies in `package.json` for published packages.
- Internal dependencies must use semver versions (e.g., `^1.3.0`).
- Local development is enabled via `bunfig.toml` overrides, NEVER via `package.json` modifications.

## 2. Atomic Release Flow
1. Verify working tree is CLEAN (`git status`).
2. Run version synchronization audit.
3. Commit with tag: `chore(release): vX.Y.Z – npm publish ready`.
4. Publish in order: Router -> Compiler -> Core -> CLI.
5. Verify `npx @zenithbuild/cli@latest new` works before tagging GitHub.

## 3. Scaffolding Integrity
- The CLI must only scaffold projects with clean semver dependencies.
