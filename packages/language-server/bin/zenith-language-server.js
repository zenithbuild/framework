#!/usr/bin/env node
const hasExplicitTransport = process.argv.some((arg) =>
  arg === '--stdio' || arg === '--node-ipc' || arg.startsWith('--socket=')
);

if (!hasExplicitTransport) {
  process.argv.push('--stdio');
}

await import('../dist/server.mjs');
