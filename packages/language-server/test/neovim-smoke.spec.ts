import { describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');
const binPath = join(packageRoot, 'bin', 'zenith-language-server.js');
const distPath = join(packageRoot, 'dist', 'server.mjs');

interface SmokeResult {
  ok: boolean;
  message?: string;
  attachedClients?: number;
  diagnostic?: {
    code?: string;
    message?: string;
    source?: string;
    lnum?: number;
    col?: number;
    endLnum?: number;
    endCol?: number;
  };
  clearedDiagnostics?: number;
  validDiagnostics?: number;
}

interface NeovimAvailability {
  available: boolean;
  skipMessage?: string;
}

function checkNeovim(): NeovimAvailability {
  const result = spawnSync('nvim', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return { available: false, skipMessage: 'SKIP: nvim not installed' };
  }

  const version = /^NVIM v(\d+)\.(\d+)\.(\d+)/.exec(result.stdout);
  if (!version) {
    return { available: false, skipMessage: 'SKIP: nvim >= 0.10 required' };
  }

  const major = Number(version[1]);
  const minor = Number(version[2]);
  if (major === 0 && minor < 10) {
    return { available: false, skipMessage: 'SKIP: nvim >= 0.10 required' };
  }

  return { available: true };
}

async function runNeovimSmoke(): Promise<SmokeResult> {
  await access(distPath);
  await access(binPath);

  const projectRoot = await mkdtemp(join(tmpdir(), 'zenith-nvim-lsp-'));
  const invalidPath = join(projectRoot, 'invalid.zen');
  const validPath = join(projectRoot, 'valid.zen');
  const luaPath = join(projectRoot, 'neovim-smoke.lua');
  const resultPath = join(projectRoot, 'result.json');

  await writeFile(
    invalidPath,
    '<script>const x = 1</script>\n<main>{x}</main>\n',
    'utf8'
  );
  await writeFile(
    validPath,
    '<script lang="ts">\nconst title = "Hello"\n</script>\n<main>{title}</main>\n',
    'utf8'
  );
  await writeFile(luaPath, neovimSmokeLua(), 'utf8');

  try {
    const run = await spawnNeovim(luaPath, {
      ZENITH_NVIM_PROJECT: projectRoot,
      ZENITH_NVIM_INVALID: invalidPath,
      ZENITH_NVIM_VALID: validPath,
      ZENITH_NVIM_RESULT: resultPath,
      ZENITH_LANGUAGE_SERVER_BIN: binPath
    });
    const result = await readSmokeResult(resultPath);

    if (run.code !== 0 || !result.ok) {
      throw new Error([
        result.message ?? `nvim exited with code ${run.code}`,
        run.stderr.trim(),
        run.stdout.trim()
      ].filter(Boolean).join('\n'));
    }

    return result;
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function spawnNeovim(
  luaPath: string,
  env: Record<string, string>
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('nvim', ['--headless', '-u', 'NONE', '-n', '-S', luaPath], {
      cwd: packageRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timed out waiting for headless Neovim smoke\n${stderr}`));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function readSmokeResult(resultPath: string): Promise<SmokeResult> {
  try {
    return JSON.parse(await readFile(resultPath, 'utf8')) as SmokeResult;
  } catch (error) {
    return {
      ok: false,
      message: `Neovim smoke did not write result JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function neovimSmokeLua(): string {
  return String.raw`
local result_path = assert(os.getenv("ZENITH_NVIM_RESULT"), "ZENITH_NVIM_RESULT is required")
local project_root = assert(os.getenv("ZENITH_NVIM_PROJECT"), "ZENITH_NVIM_PROJECT is required")
local invalid_path = assert(os.getenv("ZENITH_NVIM_INVALID"), "ZENITH_NVIM_INVALID is required")
local valid_path = assert(os.getenv("ZENITH_NVIM_VALID"), "ZENITH_NVIM_VALID is required")
local server_bin = assert(os.getenv("ZENITH_LANGUAGE_SERVER_BIN"), "ZENITH_LANGUAGE_SERVER_BIN is required")
local client_name = "zenith-language-server-smoke"

local function write_result(payload)
  vim.fn.writefile({ vim.json.encode(payload) }, result_path)
end

local function fail(message)
  write_result({ ok = false, message = message })
  vim.cmd("cquit")
end

local function wait_for(label, predicate)
  if not vim.wait(10000, predicate, 50) then
    fail("Timed out waiting for " .. label)
  end
end

local function attached_count(bufnr)
  return #vim.lsp.get_clients({ bufnr = bufnr, name = client_name })
end

vim.filetype.add({
  extension = {
    zen = "zenith",
    zenx = "zenith"
  },
  pattern = {
    [".*%.zen%.html"] = "zenith"
  }
})

local config = {
  name = client_name,
  cmd = { server_bin },
  root_dir = project_root,
  filetypes = { "zenith" }
}

vim.cmd("edit " .. vim.fn.fnameescape(invalid_path))
local invalid_buf = vim.api.nvim_get_current_buf()
vim.bo[invalid_buf].filetype = "zenith"

local client_id = vim.lsp.start(config)
if client_id == nil then
  fail("vim.lsp.start returned nil for Zenith language server")
end

wait_for("LSP client attach", function()
  return attached_count(invalid_buf) > 0
end)

wait_for("invalid-file diagnostics", function()
  return #vim.diagnostic.get(invalid_buf) > 0
end)

local diagnostic = vim.diagnostic.get(invalid_buf)[1]
if tostring(diagnostic.code) ~= "ZEN-SCRIPT-MISSING-TS" then
  fail("Expected ZEN-SCRIPT-MISSING-TS, got " .. tostring(diagnostic.code))
end
if diagnostic.source ~= "compiler" then
  fail("Expected compiler diagnostic source, got " .. tostring(diagnostic.source))
end
if type(diagnostic.message) ~= "string" or not string.find(diagnostic.message, "TypeScript", 1, true) then
  fail("Diagnostic message did not include stable compiler text")
end
if type(diagnostic.lnum) ~= "number" or type(diagnostic.col) ~= "number" then
  fail("Diagnostic range is missing start position")
end
if type(diagnostic.end_lnum) ~= "number" or type(diagnostic.end_col) ~= "number" then
  fail("Diagnostic range is missing end position")
end

vim.api.nvim_buf_set_lines(invalid_buf, 0, -1, false, vim.fn.readfile(valid_path))
vim.api.nvim_buf_call(invalid_buf, function()
  vim.cmd("write")
end)

wait_for("diagnostics to clear after valid content", function()
  return #vim.diagnostic.get(invalid_buf) == 0
end)

vim.cmd("edit " .. vim.fn.fnameescape(valid_path))
local valid_buf = vim.api.nvim_get_current_buf()
vim.bo[valid_buf].filetype = "zenith"
vim.lsp.start(config)

wait_for("LSP client attach for valid file", function()
  return attached_count(valid_buf) > 0
end)
vim.wait(500)

write_result({
  ok = true,
  attachedClients = attached_count(invalid_buf),
  diagnostic = {
    code = tostring(diagnostic.code),
    message = diagnostic.message,
    source = diagnostic.source,
    lnum = diagnostic.lnum,
    col = diagnostic.col,
    endLnum = diagnostic.end_lnum,
    endCol = diagnostic.end_col
  },
  clearedDiagnostics = #vim.diagnostic.get(invalid_buf),
  validDiagnostics = #vim.diagnostic.get(valid_buf)
})
vim.cmd("qa")
`;
}

describe('headless Neovim LSP smoke', () => {
  test('attaches to .zen buffers and surfaces compiler diagnostics', async () => {
    const neovim = checkNeovim();
    if (!neovim.available) {
      console.log(neovim.skipMessage);
      return;
    }

    const result = await runNeovimSmoke();

    expect(result.ok).toBe(true);
    expect(result.attachedClients).toBeGreaterThan(0);
    expect(result.diagnostic?.code).toBe('ZEN-SCRIPT-MISSING-TS');
    expect(result.diagnostic?.source).toBe('compiler');
    expect(result.diagnostic?.message).toContain('TypeScript');
    expect(typeof result.diagnostic?.lnum).toBe('number');
    expect(typeof result.diagnostic?.col).toBe('number');
    expect(typeof result.diagnostic?.endLnum).toBe('number');
    expect(typeof result.diagnostic?.endCol).toBe('number');
    expect(result.clearedDiagnostics).toBe(0);
    expect(result.validDiagnostics).toBe(0);
  });
});
