# @zenithbuild/config

The shared schema, defaults, plugin config hooks, image configuration, base-path
helpers and Node config loader for the Zenith release train. This package has no
runtime dependencies and owns no executable. Core retains its existing public
configuration API and the `zenith` command.

The root export contains the pure configuration contract. `./node` loads
`zenith.config.ts` or `zenith.config.js`; TypeScript configuration requires
TypeScript in the consumer project. `./base-path`, `./images` and `./plugins`
provide shared helpers without loading image processing or native toolchains.

All Zenith packages use the exact same train version. This package is an internal
shared boundary; applications may keep importing `@zenithbuild/core/config`.
