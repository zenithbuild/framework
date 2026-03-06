import type { Position, Range } from 'vscode-languageserver/node';

export type CompletionContext = 'script' | 'expression' | 'attribute' | 'markup';

const wordPattern = /[A-Za-z0-9_:$.-]/;

export function offsetAt(text: string, position: Position): number {
  const lines = text.split('\n');
  const lineIndex = Math.max(0, Math.min(position.line, lines.length - 1));
  let offset = 0;

  for (let index = 0; index < lineIndex; index += 1) {
    offset += lines[index]!.length + 1;
  }

  return offset + Math.max(0, Math.min(position.character, lines[lineIndex]!.length));
}

export function getWordRange(text: string, position: Position): Range | undefined {
  const offset = offsetAt(text, position);
  let start = offset;
  let end = offset;

  while (start > 0 && wordPattern.test(text[start - 1] ?? '')) {
    start -= 1;
  }

  while (end < text.length && wordPattern.test(text[end] ?? '')) {
    end += 1;
  }

  if (start === end) {
    return undefined;
  }

  return {
    start: positionAt(text, start),
    end: positionAt(text, end)
  };
}

export function getWord(text: string, position: Position): string {
  const range = getWordRange(text, position);
  if (!range) {
    return '';
  }

  const start = offsetAt(text, range.start);
  const end = offsetAt(text, range.end);
  return text.slice(start, end);
}

export function getCompletionPrefix(text: string, position: Position): string {
  const offset = offsetAt(text, position);
  let start = offset;

  while (start > 0 && wordPattern.test(text[start - 1] ?? '')) {
    start -= 1;
  }

  return text.slice(start, offset);
}

export function getCompletionContext(text: string, position: Position): CompletionContext {
  const offset = offsetAt(text, position);
  if (isInsideScript(text, offset)) {
    return 'script';
  }
  if (isInsideBraces(text, offset)) {
    return 'expression';
  }
  if (isInsideTag(text, offset)) {
    return 'attribute';
  }
  return 'markup';
}

function isInsideScript(text: string, offset: number): boolean {
  const lower = text.slice(0, offset).toLowerCase();
  const lastOpen = lower.lastIndexOf('<script');
  const lastClose = lower.lastIndexOf('</script');
  if (lastOpen === -1 || lastOpen < lastClose) {
    return false;
  }

  const openEnd = lower.indexOf('>', lastOpen);
  return openEnd !== -1 && openEnd < offset;
}

function isInsideTag(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  const lastOpen = before.lastIndexOf('<');
  const lastClose = before.lastIndexOf('>');
  return lastOpen > lastClose;
}

function isInsideBraces(text: string, offset: number): boolean {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = 0; index < offset; index += 1) {
    const char = text[index] ?? '';

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inSingle) {
      if (char === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (char === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inTemplate) {
      if (char === '`') {
        inTemplate = false;
      }
      continue;
    }

    if (char === "'") {
      inSingle = true;
      continue;
    }

    if (char === '"') {
      inDouble = true;
      continue;
    }

    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth > 0;
}

function positionAt(text: string, offset: number): Position {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const slice = text.slice(0, safeOffset);
  const lines = slice.split('\n');
  const line = lines.length - 1;
  const character = lines.at(-1)?.length ?? 0;
  return { line, character };
}
