import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load the compiled payload for the home page from dist output
// actually I'll use the bundler's output JSON or just raw compile
// Let's run the CLI compiler
import { execSync } from 'child_process';
const out = execSync('~/.bun/bin/bun run build', { cwd: resolve(process.cwd(), 'packages/runtime') });
// never mind, the site uses zenith compiler.
