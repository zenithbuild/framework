#!/usr/bin/env node
// Compatibility entry point: GHSA-gv7w-rqvm-qjhr was withdrawn on 2026-06-17.
// Current active root/site advisories and audit errors still fail the check.
import "./check-dependency-advisories.mjs";
