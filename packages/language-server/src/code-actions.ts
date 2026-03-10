import {
  CodeActionKind,
  type CodeAction,
  type Diagnostic,
  type Range,
  type TextDocumentEdit,
  type TextEdit
} from 'vscode-languageserver/node.js';

const DOM_QUERY_SUPPRESS = '// zen-allow:dom-query explain interop reason';
const DOM_LISTENER_TODO = '// TODO(zenith): replace addEventListener with zenOn(target, eventName, handler)';
const DOM_LISTENER_CLEANUP = '// TODO(zenith): register the disposer with ctx.cleanup(...) inside zenMount';
const DOM_WRAPPER_TODO = '// TODO(zenith): replace this guard with zenWindow() / zenDocument()';

export function getCodeActions(
  text: string,
  uri: string,
  diagnostics: readonly Diagnostic[]
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diagnostic of diagnostics) {
    const code = typeof diagnostic.code === 'string' ? diagnostic.code : '';
    if (!code) {
      continue;
    }

    if (code === 'ZEN-DOM-QUERY') {
      const action = createDomQuerySuppressAction(text, uri, diagnostic);
      if (action) {
        actions.push(action);
      }
      continue;
    }

    if (code === 'ZEN-DOM-LISTENER') {
      const action = createCommentInsertionAction(
        text,
        uri,
        diagnostic,
        [DOM_LISTENER_TODO, DOM_LISTENER_CLEANUP],
        'Zenith: Add zenOn migration note'
      );
      if (action) {
        actions.push(action);
      }
      continue;
    }

    if (code === 'ZEN-DOM-WRAPPER') {
      const replacementAction = createGlobalThisReplacementAction(text, uri, diagnostic);
      if (replacementAction) {
        actions.push(replacementAction);
      }
      const noteAction = createCommentInsertionAction(
        text,
        uri,
        diagnostic,
        [DOM_WRAPPER_TODO],
        'Zenith: Add zenWindow/zenDocument migration note'
      );
      if (noteAction) {
        actions.push(noteAction);
      }
    }
  }

  return actions;
}

function createDomQuerySuppressAction(
  text: string,
  uri: string,
  diagnostic: Diagnostic
): CodeAction | null {
  const lineIndex = diagnostic.range.start.line;
  if (lineIndex > 0) {
    const previousLine = getLine(text, lineIndex - 1);
    if (previousLine?.includes('zen-allow:dom-query')) {
      return null;
    }
  }

  return createCommentInsertionAction(
    text,
    uri,
    diagnostic,
    [DOM_QUERY_SUPPRESS],
    'Zenith: Suppress DOM query with zen-allow comment'
  );
}

function createGlobalThisReplacementAction(
  text: string,
  uri: string,
  diagnostic: Diagnostic
): CodeAction | null {
  const lineIndex = diagnostic.range.start.line;
  const line = getLine(text, lineIndex);
  if (!line) {
    return null;
  }

  if (line.includes('globalThis.window')) {
    return createReplacementAction(
      uri,
      diagnostic,
      {
        start: { line: lineIndex, character: line.indexOf('globalThis.window') },
        end: { line: lineIndex, character: line.indexOf('globalThis.window') + 'globalThis.window'.length }
      },
      'zenWindow()',
      'Zenith: Replace globalThis.window with zenWindow()'
    );
  }

  if (line.includes('globalThis.document')) {
    return createReplacementAction(
      uri,
      diagnostic,
      {
        start: { line: lineIndex, character: line.indexOf('globalThis.document') },
        end: { line: lineIndex, character: line.indexOf('globalThis.document') + 'globalThis.document'.length }
      },
      'zenDocument()',
      'Zenith: Replace globalThis.document with zenDocument()'
    );
  }

  return null;
}

function createCommentInsertionAction(
  text: string,
  uri: string,
  diagnostic: Diagnostic,
  commentLines: readonly string[],
  title: string
): CodeAction | null {
  const lineIndex = diagnostic.range.start.line;
  const line = getLine(text, lineIndex);
  if (line === undefined) {
    return null;
  }

  const indent = line.match(/^\s*/)?.[0] ?? '';
  const previousLine = lineIndex > 0 ? getLine(text, lineIndex - 1) : undefined;
  if (previousLine && commentLines.every((commentLine) => previousLine.includes(commentLine.trim()))) {
    return null;
  }

  const newText = commentLines.map((commentLine) => `${indent}${commentLine}`).join('\n') + '\n';
  return createReplacementAction(
    uri,
    diagnostic,
    {
      start: { line: lineIndex, character: 0 },
      end: { line: lineIndex, character: 0 }
    },
    newText,
    title
  );
}

function createReplacementAction(
  uri: string,
  diagnostic: Diagnostic,
  range: Range,
  newText: string,
  title: string
): CodeAction {
  const edits: TextEdit[] = [{ range, newText }];
  const documentEdit: TextDocumentEdit = {
    textDocument: {
      uri,
      version: null
    },
    edits
  };

  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      documentChanges: [documentEdit]
    }
  };
}

function getLine(text: string, lineIndex: number): string | undefined {
  const lines = text.split('\n');
  return lines[lineIndex];
}
