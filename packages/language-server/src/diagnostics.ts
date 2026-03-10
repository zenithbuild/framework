import { fileURLToPath } from 'node:url';
import { compile } from '@zenithbuild/compiler';
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

export async function collectDiagnosticsFromSource(
  source: string,
  filePath: string,
  strictDomLints: boolean
): Promise<Diagnostic[]> {
  try {
    const result = compile({ source, filePath }) as CompilerEnvelope;
    if (result.schemaVersion !== 1) {
      return [compilerContractDiagnostic(`Unsupported compiler schemaVersion: ${String(result.schemaVersion)}`)];
    }

    return mapCompilerEnvelopeToDiagnostics(result, strictDomLints);
  } catch (error) {
    return [compilerContractDiagnostic(String(error))];
  }
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
