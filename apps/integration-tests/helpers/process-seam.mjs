import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runCompilerBinary } from './pipeline.js';
import { bundlerBin, requireExecutable } from './paths.js';
import { walkFilesDeterministic } from './fs.js';

function parseArgs(argv) {
  const out = {
    entry: '',
    outDir: '',
    route: '/',
    router: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--entry') {
      out.entry = argv[++i] || '';
      continue;
    }
    if (token === '--out-dir') {
      out.outDir = argv[++i] || '';
      continue;
    }
    if (token === '--route') {
      out.route = argv[++i] || '/';
      continue;
    }
    if (token === '--router') {
      const raw = (argv[++i] || 'false').toLowerCase();
      out.router = raw === 'true' || raw === '1';
      continue;
    }
  }

  if (!out.entry) {
    throw new Error('missing required --entry <file>');
  }
  if (!out.outDir) {
    throw new Error('missing required --out-dir <dir>');
  }
  return out;
}

export async function runProcessSeam(options) {
  requireExecutable(bundlerBin, 'bundler');

  const compiler = runCompilerBinary(options.entry);
  let ir = null;
  if (compiler.status === 0) {
    ir = JSON.parse(compiler.stdout);
  }

  const envelope = {
    route: options.route,
    file: options.entry,
    ir,
    router: options.router
  };

  const bundler = spawn(bundlerBin, ['--out-dir', options.outDir], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let bundlerStdout = '';
  let bundlerStderr = '';
  bundler.stdout.setEncoding('utf8');
  bundler.stderr.setEncoding('utf8');
  bundler.stdout.on('data', (chunk) => {
    bundlerStdout += chunk;
  });
  bundler.stderr.on('data', (chunk) => {
    bundlerStderr += chunk;
  });

  bundler.stdin.write(JSON.stringify(envelope));
  bundler.stdin.end();

  const bundlerStatus = await new Promise((resolve) => bundler.on('close', resolve));
  const outExists = await fs
    .access(options.outDir)
    .then(() => true)
    .catch(() => false);

  const files = outExists ? await walkFilesDeterministic(options.outDir) : [];

  return {
    compiler: {
      status: compiler.status,
      stdout: compiler.stdout || '',
      stderr: compiler.stderr || ''
    },
    bundler: {
      status: bundlerStatus,
      stdout: bundlerStdout,
      stderr: bundlerStderr
    },
    envelope,
    outDir: path.resolve(options.outDir),
    files
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runProcessSeam(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.compiler.status === 0 && result.bundler.status === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack || error)}\n`);
    process.exit(1);
  });
}
