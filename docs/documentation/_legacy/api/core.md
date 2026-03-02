# @zenithbuild/core CLI Reference

The `@zenithbuild/core` package provides the `zenith` CLI tool for project management, development, and builds.

## Commands

### `zenith create [project-name]`
Interactively scaffold a new Zenith project.
- **Goal**: Zero-dependency, contract-compliant starting point.

### `zenith dev [--port <port>]`
Starts the development server.
- **Hot Module Replacement**: Only symbolic handles and state are swapped.
- **Contract Enforcement**: Runs standard validation on every save.

### `zenith build [--outDir <dir>]`
Compiles the project for production.
- **Output**: Minimized, symbolic-enriched JavaScript and static HTML.

### `zenith add <plugin>`
Installs a Zenith-approved plugin.
- **Plugin Constraint**: Plugins must satisfy the Zenith Contract. They cannot inject arbitrary runtime libraries.

### `zenith remove <plugin>`
Safely removes a plugin and its associated build logic.

## Project Structure
The CLI expects the following standard layout:
- `zenith.config.ts`: Central configuration.
- `src/`: Source code.
- `src/pages/`: File-based routes.
- `src/components/`: Shared components.
