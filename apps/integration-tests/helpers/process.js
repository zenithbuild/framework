import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

export function runCommandSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

export function assertSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

export function startProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');

  proc.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  proc.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  async function stop() {
    if (proc.exitCode === null) {
      proc.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    }
  }

  function logs() {
    return { stdout, stderr };
  }

  return { proc, stop, logs };
}

export async function waitForHttp(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  const expectStatuses = opts.expectStatuses || [200];
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (expectStatuses.includes(res.status)) {
        return res;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate free port'));
        } else {
          resolve(address.port);
        }
      });
    });
    server.on('error', reject);
  });
}
