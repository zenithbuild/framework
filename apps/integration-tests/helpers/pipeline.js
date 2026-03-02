import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { bundlerBin, compilerBin, requireExecutable } from './paths.js';

function resolveBundlerArgs(outDir) {
  if (process.env.ZENITH_BUNDLER_ARGS) {
    const parsed = JSON.parse(process.env.ZENITH_BUNDLER_ARGS);
    if (!Array.isArray(parsed)) {
      throw new Error('ZENITH_BUNDLER_ARGS must be a JSON array of strings');
    }
    return parsed.map((item) => String(item).replaceAll('$OUT_DIR', outDir));
  }
  return ['--out-dir', outDir];
}

export function runCompilerBinary(entryPath) {
  requireExecutable(compilerBin, 'compiler');
  return spawnSync(compilerBin, [entryPath], { encoding: 'utf8' });
}

export async function pipeCompilerToBundler(entryPath, outDir, options = {}) {
  requireExecutable(compilerBin, 'compiler');
  requireExecutable(bundlerBin, 'bundler');

  const route = options.route || '/';
  const router = options.router === true;
  const bundlerArgs = resolveBundlerArgs(outDir);

  const bundler = spawn(bundlerBin, bundlerArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const compiler = runCompilerBinary(entryPath);

  let compilerIr = null;
  if (compiler.status === 0) {
    try {
      compilerIr = JSON.parse(compiler.stdout);
    } catch {
      compilerIr = null;
    }
  }

  let sentEnvelope = null;
  if (compilerIr) {
    let envelope = {
      route,
      file: entryPath,
      ir: compilerIr,
      router
    };
    if (typeof options.envelopeMutator === 'function') {
      envelope = options.envelopeMutator(envelope) || envelope;
    }
    sentEnvelope = envelope;
    bundler.stdin.write(JSON.stringify(envelope));
  }
  bundler.stdin.end();

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

  const bundlerExit = await new Promise((resolve) => bundler.on('close', resolve));

  return {
    compiler: {
      exitCode: compiler.status,
      stdout: compiler.stdout || '',
      stderr: compiler.stderr || ''
    },
    bundler: {
      exitCode: bundlerExit,
      stdout: bundlerStdout,
      stderr: bundlerStderr,
      args: bundlerArgs
    },
    envelope: sentEnvelope,
    outDirExists: fs.existsSync(outDir)
  };
}
