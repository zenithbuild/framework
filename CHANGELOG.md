# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-02-28

### Added

- JSON output includes `schemaVersion: 1` for LSP branching
- JSON output includes `warnings` array (always present, empty or populated)
- Stdin compile mode: `compile(source, filePath)` and `compile({ source, filePath })` for LSP
- Warning shape: each warning has `code`, `message`, `severity`, `range.start`, `range.end`
- Bridge tests for JSON schema contract stability

### Changed

- CLI JSON structure extended; no breaking changes to existing fields
