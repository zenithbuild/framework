# Foundational Documentation Coverage — 2026-07-13

This audit classifies reader-facing coverage after the documentation information-architecture pass. It is internal and is excluded by the shared public documentation path policy.

| Topic | Classification | Primary public source |
| --- | --- | --- |
| Installation | Complete | `install-compatibility.md`, `getting-started.md` |
| Project creation | Complete | `getting-started.md` |
| Project structure | Complete | `getting-started/project-structure.md` |
| `.zen` file anatomy | Complete | `getting-started/first-page.md`, `contracts/dsl-syntax.md` |
| Pages | Complete | `getting-started/first-page.md`, `routing/pages-layouts-and-dynamic-routes.md` |
| Components | Complete | `components/components-props-and-slots.md` |
| Props | Complete | `components/components-props-and-slots.md`, `contracts/props-contract.md` |
| Slots | Complete | `components/components-props-and-slots.md`, `reactivity/reactivity-model.md` |
| State | Complete | `reactivity/reactivity-model.md` |
| Signals | Complete | `reactivity/reactivity-model.md` |
| Refs | Complete | `reactivity/reactivity-model.md`, `reactivity/dom-and-environment.md` |
| Events | Complete | `syntax/events.md` |
| Layouts | Complete | `getting-started/project-structure.md`, `routing/pages-layouts-and-dynamic-routes.md` |
| Dynamic routes | Complete | `routing/pages-layouts-and-dynamic-routes.md`, `contracts/routing.md` |
| Server load | Complete | `reference/script-server.md`, `reference/server-data-api.md` |
| Route guard | Complete | `routing/route-protection.md` |
| Tailwind | Complete | `guides/styling-and-public-assets.md`, `install-compatibility.md` |
| Public assets | Complete | `guides/styling-and-public-assets.md` |
| CLI | Complete | `cli-contract.md` |
| Build | Complete | `getting-started/build-and-preview.md`, `cli-contract.md` |
| Preview | Complete | `getting-started/build-and-preview.md`, `guides/deployment-targets.md` |
| Deployment | Complete for implemented targets | `guides/deployment-targets.md` |
| Adapters | Present with explicit limitations | `guides/deployment-targets.md`, `contracts/extension-contract.md` |
| Configuration | Complete | `contracts/config-contract.md` |
| Error diagnostics | Complete | `errors/index.md`, `guides/troubleshooting.md` |

## Remaining review debt

- Adapter coverage intentionally follows only currently implemented targets; provider-specific tutorials remain deferred.
- Advanced contract pages retain their contract-version metadata and phase terminology. They passed current syntax and snippet gates, but future framework releases should re-review that language against shipped behavior.
- Search UI work and versioned documentation remain deferred; the generated AI/search index now follows the shared public inclusion and ordering policy.
