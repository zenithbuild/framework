import { fileURLToPath } from 'node:url';
import { compile } from '@zenithbuild/compiler';
import { DiagnosticSeverity, type Diagnostic } from 'vscode-languageserver/node';

interface CompilerPosition {
  readonly line: number;
  readonly column: number;
}

interface CompilerRange {
  readonly start: CompilerPosition;
  readonly end: CompilerPosition;
}

interface CompilerWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly range?: CompilerRange;
}

interface CompilerEnvelope {
  readonly schemaVersion?: number;
  readonly warnings?: readonly CompilerWarning[];
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

    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    return warnings.map((warning) => ({
      source: 'zenith',
      code: warning.code,
      message: warning.message,
      severity: resolveSeverity(warning, strictDomLints),
      range: toRange(warning.range)
    }));
  } catch (error) {
    return [compilerContractDiagnostic(String(error))];
  }
}

export function resolveDocumentPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return fileURLToPath(uri);
  }

  return uri.replace(/^[a-z]+:\/\//i, '/virtual/');
}

function resolveSeverity(warning: CompilerWarning, strictDomLints: boolean): DiagnosticSeverity {
  if (strictDomLints && warning.code.startsWith('ZEN-DOM-')) {
    return DiagnosticSeverity.Error;
  }

  if (warning.severity === 'error') {
    return DiagnosticSeverity.Error;
  }

  if (warning.severity === 'hint') {
    return DiagnosticSeverity.Hint;
  }

  if (warning.severity === 'info') {
    return DiagnosticSeverity.Information;
  }

  return DiagnosticSeverity.Warning;
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
