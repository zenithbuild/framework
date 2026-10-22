# JUD-87 Windows CLI entry evidence

Baseline: `f504c98d05579ce39069d11fb5d0825161add867`.

On actual Windows (`process.platform = win32`, Node `v24.19.0`), a fresh
baseline CLI build was copied into a Windows directory containing spaces.
A preload recorded `process.argv` before CLI execution. For `--version`,
`--help` and `build`, `argv[1]` contained Windows backslashes, exit status
was 0, stdout was empty, and `project/dist/index.html` did not exist.
The package was given its physical picocolors dependency; this reproduction
did not use Linux dependency symlinks or pretend to be a packed native test.

The same failure occurs in the Windows native lane enabled by JUD-15:
https://github.com/zenithbuild/framework/actions/runs/39710117254/job/119599181917
The matching compiler/bundler build and vendor tests pass; the smoke command
then fails `dist/index.html was not generated`.

The old suffix check never recognizes a native Windows entry path. It also
mistakes an importing application's `index.js` for the CLI entry. Replacing
it with real-file identity handles native separators, spaces and symlinks
without executing commands when another module imports the CLI.

Validation on the patch:

- Actual Windows `--version`: exit 0, stdout `zenith 0.8.0`.
- Actual Windows `--help`: exit 0, stdout includes `zenith build`.
- Linux process tests: 6 passed, including a relocated package with spaces,
  import-only behavior, and an outside-checkout build with nonempty HTML and
  JavaScript assets. Empty CSS placeholders remain valid output.
- The first combined hosted run exposed an npm/Bun neutrality regression:
  core's public bin only imported CLI and depended on its old auto-run side
  effect. The wrapper now explicitly awaits `cli(args)`. Both the CLI entry
  and core's public bin build real outside-checkout HTML/JavaScript in the
  process tests. No assertion was relaxed to accept empty output.
- Full shard 6 after the wrapper fix: 4 suites / 7 tests passed locally,
  including identical npm/Bun output trees and hashes. This run used fresh
  JS builds and the already-built matching native tools (`PREPARE=0`).
- Restoring the baseline entry reproduces the import-only regression:
  stdout is `zenith 0.8.0` rather than `import completed`.
- The new process tests run in every native-consumer matrix job, alongside
  relocated Node SSR and real Sharp transformations.

Commands:

```sh
bun run --cwd packages/cli build
cd packages/cli
node --experimental-vm-modules "$(node -p 'require.resolve("jest/bin/jest")')" \
  --config jest.config.js --runInBand tests/cli-entrypoint-paths.spec.js
```

Windows entry smoke is not full native qualification. Fresh same-source
packed Windows HTML generation and the remaining native-consumer steps are
pending hosted execution. JUD-8 owns broader artifact identity qualification;
JUD-17 owns mixed-train rejection.
