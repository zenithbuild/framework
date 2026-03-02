import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '../../..');

export const compilerBin = process.env.ZENITH_COMPILER_BIN ||
  path.join(repoRoot, 'packages', 'compiler', 'target', 'release', 'zenith-compiler');

export const bundlerBin = process.env.ZENITH_BUNDLER_BIN ||
  path.join(repoRoot, 'packages', 'bundler', 'target', 'release', 'zenith-bundler');

export const cliEntry = path.join(repoRoot, 'packages', 'cli', 'src', 'index.js');
export const cliBuildModule = path.join(repoRoot, 'packages', 'cli', 'src', 'build.js');

export const compilerBridgeModule = path.join(repoRoot, 'packages', 'compiler', 'dist', 'index.js');

export const runtimeSrcDir = path.join(repoRoot, 'packages', 'runtime', 'src');
export const routerSrcDir = path.join(repoRoot, 'packages', 'router', 'src');
export const coreSrcDir = path.join(repoRoot, 'packages', 'core', 'src');
export const compilerRustSrcDir = path.join(repoRoot, 'packages', 'compiler', 'zenith_compiler', 'src');
export const bundlerRustSrcDir = path.join(repoRoot, 'packages', 'bundler', 'src');

export function toFileHref(filePath) {
  return pathToFileURL(filePath).href;
}

export function hasExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function requireExecutable(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} binary missing at ${filePath}`);
  }
  if (!hasExecutable(filePath)) {
    throw new Error(`${label} binary is not executable at ${filePath}`);
  }
  return filePath;
}
