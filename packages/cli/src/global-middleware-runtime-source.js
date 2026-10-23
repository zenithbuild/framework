import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  resolveGlobalMiddleware,
  validateGlobalMiddlewareSource
} from './global-middleware.js';

const INVALID_PREVIEW_SOURCE_FILE =
  '[Zenith:Middleware] Invalid global middleware source_file in manifest.';

function isWithinPath(root, candidate) {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function assertPreviewSourceFile(projectRoot, sourceFile) {
  if (typeof sourceFile !== 'string' || sourceFile.length === 0 || !sourceFile.endsWith('.ts')) {
    throw new Error(INVALID_PREVIEW_SOURCE_FILE);
  }

  const sourcePath = resolve(projectRoot, sourceFile);
  if (!isWithinPath(projectRoot, sourcePath)) {
    throw new Error(INVALID_PREVIEW_SOURCE_FILE);
  }

  return sourcePath;
}

function createReadError(sourceFile) {
  return new Error(`[Zenith:Middleware] Cannot read global middleware source file "${sourceFile}".`);
}

async function readMiddlewareSource(sourcePath, sourceFile) {
  try {
    return await readFile(sourcePath, 'utf8');
  } catch {
    throw createReadError(sourceFile);
  }
}

export async function loadDevGlobalMiddlewareSource({ projectRoot, pagesDir, target }) {
  const globalMiddleware = await resolveGlobalMiddleware({ projectRoot, pagesDir, target });
  if (!globalMiddleware) {
    return null;
  }

  const source = await readMiddlewareSource(globalMiddleware.sourcePath, globalMiddleware.sourceFile);
  validateGlobalMiddlewareSource(source, globalMiddleware.sourceFile, projectRoot);
  return {
    source,
    sourcePath: globalMiddleware.sourcePath
  };
}

export async function loadPreviewGlobalMiddlewareSource({ projectRoot, distDir }) {
  let manifest = null;
  const manifestDir = basename(resolve(distDir)) === 'static' ? dirname(distDir) : distDir;
  try {
    manifest = JSON.parse(await readFile(join(manifestDir, 'manifest.json'), 'utf8'));
  } catch {
    manifest = null;
  }

  const sourceFile = manifest?.global_middleware?.source_file;
  if (!sourceFile) {
    return null;
  }

  const sourcePath = assertPreviewSourceFile(projectRoot, sourceFile);
  const source = await readMiddlewareSource(sourcePath, sourceFile);
  validateGlobalMiddlewareSource(source, sourceFile, projectRoot);
  return {
    source,
    sourcePath
  };
}
