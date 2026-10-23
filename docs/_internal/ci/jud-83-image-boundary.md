# JUD-83 image package boundary

Judah approved the independent shared config package (option A) before this
implementation. See [the architecture decision](./jud-83-config-boundary-proposal.md)
and [migration and packaging details](./jud-83-image-migration.md).

## Loader contract

`loadImagePackage({ projectRoot, required })` is internal to CLI:

- `required=false` returns null without resolution, import or Sharp, unless
  `ifInstalled=true`, which loads an installed package and returns null when absent.
- `required=true` resolves from the consumer's dependency tree, validates exact
  CLI/image train identity, and dynamically imports the image API.
- It returns `{ api, packageRoot, componentPath, sharpVersionRange }`.
- Missing/skewed packages identify the exact install command for the project's
  package manager, such as `bun add -d @zenithbuild/image@VERSION`.
- Import failures inside an installed package retain their original cause.

CLI detects Image tags in source-directory `.zen` files (required) and raster
public assets (optional; copied verbatim when the package is absent) before
compilation or output removal. It excludes dependency, Git and standard generated
directories and does not follow directory symlinks. Dev repeats detection on
rebuild, including the first image added to a project, and its request handler
reuses that result. Preview resolves once from the build's package marker. An absent image pipeline
uses identity/no-op helpers and a 404 image endpoint.

The Image component is registered from the package selected by the loader.
The image package owns the image pipeline and Sharp; it depends on the pure
shared config package, never on CLI or core. Rust materialization stays native.

## Compatibility and deployment

Core keeps its public root/config APIs, types and sole public `zenith` bin.
CLI keeps explicit-key and loaded-config metadata, and directory discovery.
The shared package eliminates duplicate schema/default/loader/plugin code.

Adapters consume image runtime files and the Sharp range emitted from the
loader-selected package manifest. Config/base-path helpers are copied as pure
standalone files so relocated output needs no builder workspace. No-image
artifacts declare no Sharp dependency. Hosted Sharp fallback behavior is retained
but now resolves from the consumer's image package; JUD-16 owns further path
qualification.

The former image router-manifest helper writes server metadata, so it remains
unconditionally in CLI as `router-server-metadata.js`.

## Qualification

Focused missing-package, no-image build/dev/preview, image transformations,
security, Node relocation and hosted tests accompany the extraction. Config
compatibility is checked against the existing core and CLI suites. The Sharp
floor and image artifact cache tests now belong to the image package.

The install benchmark runs three fresh consumers with and without images for
npm 12, pnpm 10 and Bun, records actual versions and machine/method, and verifies
that no-image trees contain zero Sharp packages. Friday's independent Benchmark
Verifier sign-off is still required.

JUD-84 remains dependent on completion/review of this extraction. Active
security findings remain enforced under JUD-21. No merge or publication is
authorized by these implementation results.
