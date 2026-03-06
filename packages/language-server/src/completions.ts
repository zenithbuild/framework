import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type Position
} from 'vscode-languageserver/node';
import { canonicalEventAttributes, canonicalScriptSymbols } from './docs.js';
import { getCompletionContext, getCompletionPrefix } from './text.js';

const blockedFrameworkTokens = ['react', 'vue', 'svelte', 'rfce'];

function createScriptCompletion(label: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Function,
    detail: 'Zenith canonical primitive',
    insertText: label
  };
}

function createEventCompletion(label: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Property,
    detail: 'Canonical Zenith DOM event binding',
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: `${label}={$1:handler}`
  };
}

function createPropHandlerCompletion(): CompletionItem {
  return {
    label: 'onClick={handler}',
    kind: CompletionItemKind.Snippet,
    detail: 'Pass handler props through components, then bind them back to on:* in component markup.',
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: 'onClick={$1:handler}'
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
      item.detail ?? '',
      typeof item.insertText === 'string' ? item.insertText : ''
    ].join(' ').toLowerCase();
    return blockedFrameworkTokens.every((token) => !haystack.includes(token));
  });
}
