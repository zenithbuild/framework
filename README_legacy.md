<!-- LEGACY NOTE: Snapshot from the old integrated workspace. Some links may reference repos/docs not migrated into this shell yet. -->

# Zenith Workspace

Welcome to the Zenith Development Workspace. This directory contains the integrated suite of Zenith repositories, managed together to ensure deterministic synchronization across the stack.

## 🚀 Repositories

| Repository | Responsibility | Version |
|------------|----------------|---------|
| [**zenith-runtime**](./zenith-runtime) | Thin client for hydration and signals. | `1.1.0` |
| [**zenith-compiler**](./zenith-compiler) | Native Rust compiler and IR generator. | `1.1.0` / `0.2.0` |
| [**zenith-bundler**](./zenith-bundler) | Deterministic asset emitter. | `1.1.0` / `0.2.0` |
| [**zenith-cli**](./zenith-cli) | The framework orchestrator. | `1.1.0` |
| [**zenith-core**](./zenith-core) | Deterministic substrate and utilities. | `1.1.0` |
| [**zenith-router**](./zenith-router) | Signal-based routing engine. | `1.1.0` |
| [**create-zenith**](./create-zenith) | Project scaffolding tool. | `0.5.0-beta.2.20` |

## 🛠️ Workspace Management

This workspace uses a multi-repo structure grouped under a single root for development convenience.

### Cleaning the Workspace
Worktrees used for isolated feature development or enforcement are pruned periodically.
```bash
# Example: removing individual worktrees
git -C zenith-compiler worktree remove <worktree-name>
```

### Syncing Versions
All core packages are versioned in lockstep to prevent architectural drift. The current stable minor series is `1.1.x`.

## 📜 Development Contracts
Zenith is built on strict behavioral contracts. See the following documents for details:
- [Side Effects Contract](./zenith-runtime/SIDE_EFFECTS_CONTRACT.md)
- [Props Contract](./PROPS_CONTRACT.md)
- [IR Envelope Contract](./IR_ENVELOPE_CONTRACT.md)

---
*Built with precision by the Zenith Team.*
