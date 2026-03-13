import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type Position
} from 'vscode-languageserver/node.js';
import { canonicalEventAttributes, canonicalScriptSymbols, getDocUrl, getSymbolDoc } from './docs.js';
import { getCompletionContext, getCompletionPrefix } from './text.js';

const blockedFrameworkTokens = ['react', 'vue', 'svelte', 'rfce'];

function createScriptCompletion(label: string): CompletionItem {
  const docs = getSymbolDoc(label);
  return {
    label,
    kind: CompletionItemKind.Function,
    detail: docs?.summary ?? 'Zenith canonical primitive',
    ...(docs
      ? {
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Docs: [${docs.docPath}](${getDocUrl(docs.docPath)})`
          }
        }
      : {}),
    insertText: label
  };
}

function createEventCompletion(label: string): CompletionItem {
  const docs = getSymbolDoc(label);
  return {
    label,
    kind: CompletionItemKind.Property,
    detail: docs?.summary ?? 'Canonical Zenith DOM event binding',
    ...(docs
      ? {
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Docs: [${docs.docPath}](${getDocUrl(docs.docPath)})`
          }
        }
      : {}),
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: `${label}={\${1:handler}}`
  };
}

function createPropHandlerCompletion(): CompletionItem {
  return {
    label: 'onClick={handler}',
    kind: CompletionItemKind.Snippet,
    detail: 'Pass handler props through components, then bind them back to on:* in component markup.',
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: 'onClick={${1:handler}}'
  };
}

export function getCompletionItems(text: string, position: Position): CompletionItem[] {
  const context = getCompletionContext(text, position);
  const prefix = getCompletionPrefix(text, position).toLowerCase();

  if (context === 'script' || context === 'expression') {
    return filterFrameworkNoise(canonicalScriptSymbols.map((symbol) => createScriptCompletion(symbol)), prefix);
  }

  if (context === 'attribute') {
    const items = canonicalEventAttributes.map((eventName) => createEventCompletion(eventName));
    items.push(createPropHandlerCompletion());
    return filterFrameworkNoise(items, prefix);
  }

  return [];
}

export function filterFrameworkNoise(items: CompletionItem[], typedPrefix: string): CompletionItem[] {
  if (blockedFrameworkTokens.some((token) => typedPrefix.includes(token))) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.label,
      typeof item.insertText === 'string' ? item.insertText : ''
    ].join(' ').toLowerCase();
    return blockedFrameworkTokens.every((token) => !haystack.includes(token));
  });
}
