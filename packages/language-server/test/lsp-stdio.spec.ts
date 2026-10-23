import { describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');
const binPath = join(packageRoot, 'bin', 'zenith-language-server.js');
const distPath = join(packageRoot, 'dist', 'server.mjs');
const nodeBin = process.env.NODE_BINARY || 'node';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface NotificationWaiter {
  method: string;
  resolve(value: any): void;
}

class StdioLspClient {
  readonly #server: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #notifications: any[] = [];
  readonly #waiters: NotificationWaiter[] = [];
  #buffer = Buffer.alloc(0);
  #nextId = 1;
  #stderr = '';

  constructor(args: string[] = []) {
    this.#server = spawn(nodeBin, [binPath, ...args], {
      cwd: packageRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.#server.stdout.on('data', (chunk) => {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      this.#readMessages();
    });
    this.#server.stderr.on('data', (chunk) => {
      this.#stderr += chunk.toString('utf8');
    });
    this.#server.on('exit', (code, signal) => {
      if (this.#pending.size === 0) {
        return;
      }
      const error = new Error(`language server exited before response code=${code} signal=${signal} stderr=${this.#stderr}`);
      for (const pending of this.#pending.values()) {
        pending.reject(error);
      }
      this.#pending.clear();
    });
  }

  async initialize(): Promise<any> {
    const result = await this.request('initialize', {
      processId: process.pid,
      rootUri: 'file:///tmp',
      capabilities: {
        workspace: { configuration: false },
        textDocument: {}
      },
      workspaceFolders: null
    });
    this.notify('initialized', {});
    return result;
  }

  request(method: string, params: unknown): Promise<any> {
    const id = this.#nextId;
    this.#nextId += 1;
    const promise = new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    this.#send({ jsonrpc: '2.0', id, method, params });
    return promise;
  }

  notify(method: string, params: unknown): void {
    this.#send({ jsonrpc: '2.0', method, params });
  }

  waitForNotification(method: string, timeoutMs = 5000): Promise<any> {
    const existingIndex = this.#notifications.findIndex((message) => message.method === method);
    if (existingIndex !== -1) {
      const [message] = this.#notifications.splice(existingIndex, 1);
      return Promise.resolve(message.params);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.#waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index !== -1) {
          this.#waiters.splice(index, 1);
        }
        reject(new Error(`Timed out waiting for ${method}; stderr=${this.#stderr}`));
      }, timeoutMs);
      this.#waiters.push({
        method,
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.#server.killed) {
      try {
        await this.request('shutdown', null);
      } catch {
        // The process may already have exited after a failed startup.
      }
      this.notify('exit', {});
      this.#server.kill('SIGTERM');
    }
  }

  #send(message: unknown): void {
    const body = JSON.stringify(message);
    this.#server.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  #readMessages(): void {
    while (true) {
      const headerEnd = this.#buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = this.#buffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        throw new Error(`Missing Content-Length header: ${header}`);
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.#buffer.length < bodyStart + length) {
        return;
      }

      const body = this.#buffer.slice(bodyStart, bodyStart + length).toString('utf8');
      this.#buffer = this.#buffer.slice(bodyStart + length);
      this.#handleMessage(JSON.parse(body));
    }
  }

  #handleMessage(message: any): void {
    if (message.id !== undefined && this.#pending.has(message.id)) {
      const pending = this.#pending.get(message.id)!;
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const waiterIndex = this.#waiters.findIndex((waiter) => waiter.method === message.method);
      if (waiterIndex !== -1) {
        const [waiter] = this.#waiters.splice(waiterIndex, 1);
        waiter?.resolve(message.params);
        return;
      }
      this.#notifications.push(message);
    }
  }
}

const openTextDocument = (uri: string, text: string) => ({
  textDocument: {
    uri,
    languageId: 'zenith',
    version: 1,
    text
  }
});

function positionOf(text: string, token: string, offset = 0) {
  const index = text.indexOf(token);
  expect(index).toBeGreaterThanOrEqual(0);
  const before = text.slice(0, index + offset).split('\n');
  return {
    line: before.length - 1,
    character: before.at(-1)!.length
  };
}

async function withClient(
  callback: (client: StdioLspClient) => Promise<void>,
  args: string[] = []
): Promise<void> {
  await access(distPath);
  const client = new StdioLspClient(args);
  try {
    await callback(client);
  } finally {
    await client.close();
  }
}

describe('stdio LSP transport', () => {
  test('package bin defaults to stdio and initializes with editor capabilities', async () => {
    await withClient(async (lsp) => {
      const result = await lsp.initialize();

      expect(result.capabilities.textDocumentSync.openClose).toBe(true);
      expect(result.capabilities.completionProvider.triggerCharacters).toContain(':');
      expect(result.capabilities.hoverProvider).toBe(true);
      expect(result.capabilities.codeActionProvider).toBe(true);
    });
  });

  test('publishes compiler-backed diagnostics for invalid .zen documents', async () => {
    await withClient(async (lsp) => {
      await lsp.initialize();

      lsp.notify('textDocument/didOpen', openTextDocument(
        'file:///tmp/batch7-invalid.zen',
        '<script>const x = 1</script>\n<main>{x}</main>'
      ));

      const published = await lsp.waitForNotification('textDocument/publishDiagnostics');
      const [diagnostic] = published.diagnostics;

      expect(published.uri).toBe('file:///tmp/batch7-invalid.zen');
      expect(diagnostic.code).toBe('ZEN-SCRIPT-MISSING-TS');
      expect(diagnostic.message).toContain('Zenith requires TypeScript scripts');
      expect(diagnostic.source).toBe('compiler');
      expect(diagnostic.range.start.line).toBe(0);
    });
  });

  test('publishes empty diagnostics for valid .zen documents', async () => {
    await withClient(async (lsp) => {
      await lsp.initialize();

      lsp.notify('textDocument/didOpen', openTextDocument(
        'file:///tmp/batch7-valid.zen',
        '<script lang="ts">\nconst title = "Hello"\n</script>\n<main>{title}</main>'
      ));

      const published = await lsp.waitForNotification('textDocument/publishDiagnostics');

      expect(published.uri).toBe('file:///tmp/batch7-valid.zen');
      expect(published.diagnostics).toEqual([]);
    });
  });

  test('serves existing completion and hover requests through LSP transport', async () => {
    await withClient(async (lsp) => {
      await lsp.initialize();
      const uri = 'file:///tmp/batch7-editor.zen';
      const text = '<script lang="ts">\nconst count = signal(0)\n</script>\n<button on></button>';

      lsp.notify('textDocument/didOpen', openTextDocument(uri, text));

      const completion = await lsp.request('textDocument/completion', {
        textDocument: { uri },
        position: positionOf(text, 'on></button>', 2)
      });
      const labels = completion.map((item: any) => item.label);
      expect(labels).toContain('on:click');

      const hover = await lsp.request('textDocument/hover', {
        textDocument: { uri },
        position: positionOf(text, 'signal', 3)
      });
      expect(hover.contents.value).toContain('Stable reactive container');
    }, ['--stdio']);
  });
});
