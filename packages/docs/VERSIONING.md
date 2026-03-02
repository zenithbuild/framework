# Version Visibility in Documentation (Conceptual)

This document outlines the high-level concept for surfacing versions in the Zenith documentation site.

## User Discovery

- **Version Picker**: A prominent dropdown in the navigation bar allows users to switch between documentation for different versions of Zenith (e.g., `v0.4.0`, `v0.3.0`, `latest`).
- **Contextual Banners**: When viewing documentation for an older version, a subtle banner informs the user and provides a link to the latest version.
- **Sidebars**: Each version maintains its own sidebar structure, ensuring that only features and APIs relevant to that version are displayed.

## Changelogs and Versions

- **Direct Linkage**: Version entries in the version picker link directly to the corresponding changelog in `zenith-docs/changelog/`.
- **Integrated View**: Changelogs are treated as first-class documentation pages, appearing in the sidebar under a "Releases" or "Changelog" section.
- **Release Highlights**: Major version documentation pages include a "What's New" summary extracted from the changelog.
