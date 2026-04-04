import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const NPM_PATH = "/opt/homebrew/bin/npm";
const HOMEBREW_BIN = "/opt/homebrew/bin";

function resolveCommand(command) {
  if (command === "npm") {
    return NPM_PATH;
  }
  return command;
}

function getEnv(optionsEnv) {
  const env = { ...process.env, ...optionsEnv };
  const path = env.PATH || "";
  if (!path.includes(HOMEBREW_BIN)) {
    env.PATH = `${HOMEBREW_BIN}:${path}`;
  }
  return env;
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(resolveCommand(command), args, {
    cwd: options.cwd,
    env: getEnv(options.env),
    encoding: "utf8",
    timeout: options.timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error) : "",
  };
}

export function startCommand(command, args, options = {}) {
  const proc = spawn(resolveCommand(command), args, {
    cwd: options.cwd,
    env: getEnv(options.env),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");

  proc.stdout.on("data", (chunk) => {
    stdout += chunk;
  });

  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return {
    proc,
    logs() {
      return { stdout, stderr };
    },
    async stop(timeoutMs = 5000) {
      if (proc.exitCode !== null) {
        return;
      }

      proc.kill("SIGTERM");
      const startedAt = Date.now();
      while (proc.exitCode === null && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    },
  };
}

export async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Failed to allocate a free port"));
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

export async function isPortOpen(port, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", onError);
    socket.once("timeout", onError);

    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

export async function waitForHttp(url, options = {}) {
  const expectStatus = typeof options.expectStatus === "number" ? options.expectStatus : 200;
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 120000;
  const pollIntervalMs = typeof options.pollIntervalMs === "number" ? options.pollIntervalMs : 100;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status === expectStatus) {
        return response;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for ${url}`);
}
