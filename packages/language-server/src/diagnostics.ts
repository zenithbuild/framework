import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DiagnosticSeverity,
  DiagnosticTag,
  type Diagnostic
} from 'vscode-languageserver/node.js';

interface CompilerPosition {
  readonly line: number;
  readonly column: number;
}

interface CompilerRange {
  readonly start: CompilerPosition;
  readonly end: CompilerPosition;
}

type CompilerSeverity = 'error' | 'warning' | 'information' | 'hint';
type CompilerTag = 'deprecated' | 'unnecessary';

interface CompilerWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: CompilerSeverity;
  readonly range?: CompilerRange;
}

interface CompilerDiagnosticRelatedInformation {
  readonly file?: string;
  readonly range: CompilerRange;
  readonly message: string;
}

interface CompilerDiagnosticEntry {
  readonly code: string;
  readonly message: string;
  readonly severity: CompilerSeverity;
  readonly range?: CompilerRange;
  readonly source?: string;
  readonly suggestion?: string;
  readonly fixes?: readonly unknown[];
  readonly relatedInformation?: readonly CompilerDiagnosticRelatedInformation[];
  readonly tags?: readonly CompilerTag[];
  readonly docsPath?: string;
}

interface CompilerEnvelope {
  readonly schemaVersion?: number;
  readonly warnings?: readonly CompilerWarning[];
  readonly diagnostics?: readonly CompilerDiagnosticEntry[];
}

interface CompilerModule {
  readonly compile: (input: { source: string; filePath: string }) => CompilerEnvelope;
}

type CompilerLoader = (filePath: string) => Promise<CompilerModule>;
type SourceDiagnosticsCollector = (
  source: string,
  filePath: string,
  strictDomLints: boolean
) => Promise<Diagnostic[]>;

export interface DiagnosticsCollectorOptions {
  readonly loadCompiler?: CompilerLoader;
}

const compilerModulePromises = new Map<string, Promise<CompilerModule>>();

export function createDiagnosticsCollector(
  options: DiagnosticsCollectorOptions = {}
): SourceDiagnosticsCollector {
  const loadCompilerModule = options.loadCompiler ?? loadCompiler;
  let compilerUnavailableReported = false;

  return async function collectDiagnostics(
    source: string,
    filePath: string,
    strictDomLints: boolean
  ): Promise<Diagnostic[]> {
    let compile: CompilerModule['compile'];

    try {
      ({ compile } = await loadCompilerModule(filePath));
      compilerUnavailableReported = false;
    } catch {
      if (compilerUnavailableReported) {
        return [];
      }
      compilerUnavailableReported = true;
      return [compilerUnavailableDiagnostic()];
    }

    try {
      const result = compile({ source, filePath }) as CompilerEnvelope;
      if (result.schemaVersion !== 1) {
        return [compilerContractDiagnostic(`Unsupported compiler schemaVersion: ${String(result.schemaVersion)}`)];
      }

      return mapCompilerEnvelopeToDiagnostics(result, strictDomLints);
    } catch (error) {
      return [compilerContractDiagnostic(String(error))];
    }
  };
}

export const collectDiagnosticsFromSource = createDiagnosticsCollector();

async function loadCompiler(filePath: string): Promise<CompilerModule> {
  const workspaceEntry = resolveWorkspaceCompilerEntry(filePath);
  if (workspaceEntry) {
    return importCachedCompiler(workspaceEntry, () => importWorkspaceCompiler(workspaceEntry));
  }

  return importCachedCompiler('package:@zenithbuild/compiler', importBundledCompiler);
}

function resolveWorkspaceCompilerEntry(filePath: string): string | undefined {
  const requireFromDocument = createRequire(pathToFileURL(filePath).href);
  try {
    return requireFromDocument.resolve('@zenithbuild/compiler');
  } catch {
    return undefined;
  }
}

function importCachedCompiler(
  cacheKey: string,
  importer: () => Promise<CompilerModule>
): Promise<CompilerModule> {
  const existing = compilerModulePromises.get(cacheKey);
  if (existing) {
    return existing;
  }

  const next = importer().catch((error) => {
    compilerModulePromises.delete(cacheKey);
    throw error;
  });
  compilerModulePromises.set(cacheKey, next);
  return next;
}

async function importWorkspaceCompiler(compilerEntry: string): Promise<CompilerModule> {
  return import(pathToFileURL(compilerEntry).href)
    .catch(() => importBundledCompiler()) as Promise<CompilerModule>;
}

async function importBundledCompiler(): Promise<CompilerModule> {
  return import('@zenithbuild/compiler')
    .catch(() => import(pathToFileURL(resolveCompilerFallbackPath()).href)) as Promise<CompilerModule>;
}

function resolveCompilerFallbackPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'compiler', 'dist', 'index.js');
}

export function mapCompilerEnvelopeToDiagnostics(
  result: CompilerEnvelope,
  strictDomLints: boolean
): Diagnostic[] {
  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  if (diagnostics.length > 0) {
    return diagnostics.map((diagnostic) => {
      const tags = mapTags(diagnostic.tags);
      return {
        source: diagnostic.source ?? 'zenith',
        code: diagnostic.code,
        message: diagnostic.message,
        severity: resolveSeverity(diagnostic, strictDomLints),
        range: toRange(diagnostic.range),
        ...(tags ? { tags } : {})
      };
    });
  }

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  return warnings.map((warning) => ({
    source: 'zenith',
    code: warning.code,
    message: warning.message,
    severity: resolveSeverity(warning, strictDomLints),
    range: toRange(warning.range)
  }));
}

export function resolveDocumentPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return fileURLToPath(uri);
  }

  return uri.replace(/^[a-z]+:\/\//i, '/virtual/');
}

function resolveSeverity(
  diagnostic: Pick<CompilerWarning, 'code' | 'severity'>,
  strictDomLints: boolean
): DiagnosticSeverity {
  if (strictDomLints && diagnostic.code.startsWith('ZEN-DOM-')) {
    return DiagnosticSeverity.Error;
  }

  if (diagnostic.severity === 'error') {
    return DiagnosticSeverity.Error;
  }

  if (diagnostic.severity === 'hint') {
    return DiagnosticSeverity.Hint;
  }

  if (diagnostic.severity === 'information') {
    return DiagnosticSeverity.Information;
  }

  return DiagnosticSeverity.Warning;
}

function mapTags(tags: readonly CompilerTag[] | undefined): DiagnosticTag[] | undefined {
  if (!Array.isArray(tags) || tags.length === 0) {
    return undefined;
  }

  return tags.flatMap((tag) => {
    if (tag === 'deprecated') {
      return [DiagnosticTag.Deprecated];
    }
    if (tag === 'unnecessary') {
      return [DiagnosticTag.Unnecessary];
    }
    return [];
  });
}

function toRange(range: CompilerRange | undefined): Diagnostic['range'] {
  if (!range) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    };
  }

  return {
    start: {
      line: Math.max(0, range.start.line - 1),
      character: Math.max(0, range.start.column - 1)
    },
    end: {
      line: Math.max(0, range.end.line - 1),
      character: Math.max(0, range.end.column - 1)
    }
  };
}

function compilerContractDiagnostic(message: string): Diagnostic {
  return {
    source: 'zenith',
    code: 'ZENITH-COMPILER',
    message,
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    }
  };
}

function compilerUnavailableDiagnostic(): Diagnostic {
  return {
    source: 'zenith',
    code: 'ZENITH-COMPILER-UNAVAILABLE',
    message: [
      'Zenith compiler package is unavailable to the language server.',
      'Run your package manager install from the workspace root, ensure @zenithbuild/compiler is installed, and restart the editor.',
      'Build commands are unchanged; this only disables editor diagnostics until the compiler package resolves.'
    ].join(' '),
    severity: DiagnosticSeverity.Warning,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    }
  };
}
