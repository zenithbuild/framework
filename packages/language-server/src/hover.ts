import { MarkupKind, type Hover, type Position } from 'vscode-languageserver/node.js';
import { getDocUrl, getSymbolDoc } from './docs.js';
import { getWord, getWordRange } from './text.js';

export function getHover(text: string, position: Position): Hover | null {
  const symbol = getWord(text, position);
  const docs = getSymbolDoc(symbol);
  const range = getWordRange(text, position);

  if (!docs || !range) {
    return null;
  }

  const docsUrl = getDocUrl(docs.docPath);
  const markdown = [
    `**${docs.label}**`,
    '',
    docs.summary,
    '',
    '```ts',
    docs.example,
    '```',
    '',
    `Docs: [${docs.docPath}](${docsUrl})`
  ].join('\n');

  return {
    range,
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown
    }
  };
}
