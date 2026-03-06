// src/main.ts
import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocumentSyncKind
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";

// src/completions.ts
import {
  CompletionItemKind,
  InsertTextFormat
} from "vscode-languageserver/node";

// src/docs.ts
var DOCS_BASE_URL = "https://github.com/zenithbuild/framework/blob/master/";
var SYMBOL_DOCS = {
  zenEffect: {
    label: "zenEffect",
    summary: "Reactive side effect that re-runs when its dependencies change.",
    example: "zenEffect(() => {\n  count.get()\n})",
    docPath: "docs/documentation/reactivity/effects-vs-mount.md"
  },
  zenMount: {
    label: "zenMount",
    summary: "Mount-time lifecycle boundary for DOM effects and cleanup registration.",
    example: "zenMount((ctx) => {\n  ctx.cleanup(offResize)\n})",
    docPath: "docs/documentation/reactivity/effects-vs-mount.md"
  },
  state: {
    label: "state",
    summary: "Reactive binding for values that directly drive DOM expressions.",
    example: "state open = false\nfunction toggle() { open = !open }",
    docPath: "docs/documentation/reactivity/reactivity-model.md"
  },
  signal: {
    label: "signal",
    summary: "Stable reactive container with explicit get() and set() operations.",
    example: "const count = signal(0)\ncount.set(count.get() + 1)",
    docPath: "docs/documentation/reactivity/reactivity-model.md"
  },
  ref: {
    label: "ref",
    summary: "Typed DOM handle for measurements, focus, animation, and mount-time access.",
    example: "const shell = ref<HTMLDivElement>()",
    docPath: "docs/documentation/reactivity/reactivity-model.md"
  },
  zenWindow: {
    label: "zenWindow",
    summary: "SSR-safe window accessor that returns null when the browser environment is absent.",
    example: "const win = zenWindow()\nif (!win) return",
    docPath: "docs/documentation/reactivity/dom-and-environment.md"
  },
  zenDocument: {
    label: "zenDocument",
    summary: "SSR-safe document accessor for global DOM wiring inside mount-time logic.",
    example: "const doc = zenDocument()\nif (!doc) return",
    docPath: "docs/documentation/reactivity/dom-and-environment.md"
  },
  zenOn: {
    label: "zenOn",
    summary: "Canonical event subscription primitive that returns a disposer.",
    example: "const off = zenOn(doc, 'keydown', handleKey)\nctx.cleanup(off)",
    docPath: "docs/documentation/reactivity/dom-and-environment.md"
  },
  zenResize: {
    label: "zenResize",
    summary: "Canonical window resize primitive for reactive viewport updates.",
    example: "const off = zenResize(({ w, h }) => viewport.set({ w, h }))",
    docPath: "docs/documentation/reactivity/dom-and-environment.md"
  },
  collectRefs: {
    label: "collectRefs",
    summary: "Deterministic multi-node collection helper that replaces selector scans.",
    example: "const nodes = collectRefs(linkRefA, linkRefB, linkRefC)",
    docPath: "docs/documentation/reactivity/dom-and-environment.md"
  }
};
var canonicalScriptSymbols = [
  "zenMount",
  "zenEffect",
  "state",
  "signal",
  "ref",
  "zenWindow",
  "zenDocument",
  "zenOn",
  "zenResize",
  "collectRefs"
];
var canonicalEventAttributes = [
  "on:click",
  "on:dblclick",
  "on:keydown",
  "on:keyup",
  "on:esc",
  "on:submit",
  "on:input",
  "on:change",
  "on:focus",
  "on:blur",
  "on:pointerdown",
  "on:pointerup",
  "on:pointermove",
  "on:pointerenter",
  "on:pointerleave",
  "on:hoverin",
  "on:hoverout",
  "on:dragstart",
  "on:dragover",
  "on:drop",
  "on:scroll",
  "on:contextmenu"
];
function getSymbolDoc(symbol) {
  return SYMBOL_DOCS[symbol];
}
function getDocUrl(docPath) {
  return `${DOCS_BASE_URL}${docPath}`;
}

// src/text.ts
var wordPattern = /[A-Za-z0-9_:$.-]/;
function offsetAt(text, position) {
  const lines = text.split("\n");
  const lineIndex = Math.max(0, Math.min(position.line, lines.length - 1));
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + Math.max(0, Math.min(position.character, lines[lineIndex].length));
}
function getWordRange(text, position) {
  const offset = offsetAt(text, position);
  let start = offset;
  let end = offset;
  while (start > 0 && wordPattern.test(text[start - 1] ?? "")) {
    start -= 1;
  }
  while (end < text.length && wordPattern.test(text[end] ?? "")) {
    end += 1;
  }
  if (start === end) {
    return void 0;
  }
  return {
    start: positionAt(text, start),
    end: positionAt(text, end)
  };
}
function getWord(text, position) {
  const range = getWordRange(text, position);
  if (!range) {
    return "";
  }
  const start = offsetAt(text, range.start);
  const end = offsetAt(text, range.end);
  return text.slice(start, end);
}
function getCompletionPrefix(text, position) {
  const offset = offsetAt(text, position);
  let start = offset;
  while (start > 0 && wordPattern.test(text[start - 1] ?? "")) {
    start -= 1;
  }
  return text.slice(start, offset);
}
function getCompletionContext(text, position) {
  const offset = offsetAt(text, position);
  if (isInsideScript(text, offset)) {
    return "script";
  }
  if (isInsideBraces(text, offset)) {
    return "expression";
  }
  if (isInsideTag(text, offset)) {
    return "attribute";
  }
  return "markup";
}
function isInsideScript(text, offset) {
  const lower = text.slice(0, offset).toLowerCase();
  const lastOpen = lower.lastIndexOf("<script");
  const lastClose = lower.lastIndexOf("</script");
  if (lastOpen === -1 || lastOpen < lastClose) {
    return false;
  }
  const openEnd = lower.indexOf(">", lastOpen);
  return openEnd !== -1 && openEnd < offset;
}
function isInsideTag(text, offset) {
  const before = text.slice(0, offset);
  const lastOpen = before.lastIndexOf("<");
  const lastClose = before.lastIndexOf(">");
  return lastOpen > lastClose;
}
function isInsideBraces(text, offset) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  for (let index = 0; index < offset; index += 1) {
    const char = text[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
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
      if (char === "`") {
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
    if (char === "`") {
      inTemplate = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0;
}
function positionAt(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const slice = text.slice(0, safeOffset);
  const lines = slice.split("\n");
  const line = lines.length - 1;
  const character = lines.at(-1)?.length ?? 0;
  return { line, character };
}

// src/completions.ts
var blockedFrameworkTokens = ["react", "vue", "svelte", "rfce"];
function createScriptCompletion(label) {
  return {
    label,
    kind: CompletionItemKind.Function,
    detail: "Zenith canonical primitive",
    insertText: label
  };
}
function createEventCompletion(label) {
  return {
    label,
    kind: CompletionItemKind.Property,
    detail: "Canonical Zenith DOM event binding",
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: `${label}={$1:handler}`
  };
}
function createPropHandlerCompletion() {
  return {
    label: "onClick={handler}",
    kind: CompletionItemKind.Snippet,
    detail: "Pass handler props through components, then bind them back to on:* in component markup.",
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: "onClick={$1:handler}"
  };
}
function getCompletionItems(text, position) {
  const context = getCompletionContext(text, position);
  const prefix = getCompletionPrefix(text, position).toLowerCase();
  if (context === "script" || context === "expression") {
    return filterFrameworkNoise(canonicalScriptSymbols.map((symbol) => createScriptCompletion(symbol)), prefix);
  }
  if (context === "attribute") {
    const items = canonicalEventAttributes.map((eventName) => createEventCompletion(eventName));
    items.push(createPropHandlerCompletion());
    return filterFrameworkNoise(items, prefix);
  }
  return [];
}
function filterFrameworkNoise(items, typedPrefix) {
  if (blockedFrameworkTokens.some((token) => typedPrefix.includes(token))) {
    return items;
  }
  return items.filter((item) => {
    const haystack = [
      item.label,
      item.detail ?? "",
      typeof item.insertText === "string" ? item.insertText : ""
    ].join(" ").toLowerCase();
    return blockedFrameworkTokens.every((token) => !haystack.includes(token));
  });
}

// src/diagnostics.ts
import { fileURLToPath } from "node:url";
import { compile } from "@zenithbuild/compiler";
import { DiagnosticSeverity } from "vscode-languageserver/node";
async function collectDiagnosticsFromSource(source, filePath, strictDomLints) {
  try {
    const result = compile({ source, filePath });
    if (result.schemaVersion !== 1) {
      return [compilerContractDiagnostic(`Unsupported compiler schemaVersion: ${String(result.schemaVersion)}`)];
    }
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    return warnings.map((warning) => ({
      source: "zenith",
      code: warning.code,
      message: warning.message,
      severity: resolveSeverity(warning, strictDomLints),
      range: toRange(warning.range)
    }));
  } catch (error) {
    return [compilerContractDiagnostic(String(error))];
  }
}
function resolveDocumentPath(uri) {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return uri.replace(/^[a-z]+:\/\//i, "/virtual/");
}
function resolveSeverity(warning, strictDomLints) {
  if (strictDomLints && warning.code.startsWith("ZEN-DOM-")) {
    return DiagnosticSeverity.Error;
  }
  if (warning.severity === "error") {
    return DiagnosticSeverity.Error;
  }
  if (warning.severity === "hint") {
    return DiagnosticSeverity.Hint;
  }
  if (warning.severity === "info") {
    return DiagnosticSeverity.Information;
  }
  return DiagnosticSeverity.Warning;
}
function toRange(range) {
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
function compilerContractDiagnostic(message) {
  return {
    source: "zenith",
    code: "ZENITH-COMPILER",
    message,
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    }
  };
}

// src/hover.ts
import { MarkupKind } from "vscode-languageserver/node";
function getHover(text, position) {
  const symbol = getWord(text, position);
  const docs = getSymbolDoc(symbol);
  const range = getWordRange(text, position);
  if (!docs || !range) {
    return null;
  }
  const docsUrl = getDocUrl(docs.docPath);
  const markdown = [
    `**${docs.label}**`,
    "",
    docs.summary,
    "",
    "```ts",
    docs.example,
    "```",
    "",
    `Docs: [${docs.docPath}](${docsUrl})`
  ].join("\n");
  return {
    range,
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown
    }
  };
}

// src/settings.ts
var defaultSettings = {
  strictDomLints: false,
  enableFrameworkSnippets: false
};
var SettingsStore = class {
  constructor(connection, supportsWorkspaceConfiguration) {
    this.connection = connection;
    this.supportsWorkspaceConfiguration = supportsWorkspaceConfiguration;
  }
  #cache = /* @__PURE__ */ new Map();
  clear(uri) {
    if (uri) {
      this.#cache.delete(uri);
      return;
    }
    this.#cache.clear();
  }
  async get(uri) {
    if (!this.supportsWorkspaceConfiguration) {
      return defaultSettings;
    }
    const cached = this.#cache.get(uri);
    if (cached) {
      return cached;
    }
    const pending = this.load(uri);
    this.#cache.set(uri, pending);
    return pending;
  }
  async load(uri) {
    const config = await this.connection.workspace.getConfiguration({
      scopeUri: uri,
      section: "zenith"
    });
    return {
      strictDomLints: config?.strictDomLints === true,
      enableFrameworkSnippets: config?.enableFrameworkSnippets === true
    };
  }
};

// src/validation.ts
function createValidationScheduler(validate, delayMs = 150) {
  const states = /* @__PURE__ */ new Map();
  function nextValidationId(uri) {
    const state = states.get(uri) ?? { timer: void 0, validationId: 0 };
    state.validationId += 1;
    states.set(uri, state);
    return state.validationId;
  }
  function cancelTimer(uri) {
    const state = states.get(uri);
    if (!state?.timer) {
      return;
    }
    clearTimeout(state.timer);
    state.timer = void 0;
  }
  return {
    schedule(uri) {
      const validationId = nextValidationId(uri);
      cancelTimer(uri);
      const state = states.get(uri);
      state.timer = setTimeout(() => {
        state.timer = void 0;
        void validate(uri, validationId);
      }, delayMs);
    },
    async flush(uri) {
      const validationId = nextValidationId(uri);
      cancelTimer(uri);
      await validate(uri, validationId);
    },
    clear(uri) {
      cancelTimer(uri);
      states.delete(uri);
    },
    dispose() {
      for (const uri of states.keys()) {
        cancelTimer(uri);
      }
      states.clear();
    },
    isLatest(uri, validationId) {
      return (states.get(uri)?.validationId ?? 0) === validationId;
    }
  };
}

// src/main.ts
function startLanguageServer() {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  let supportsWorkspaceConfiguration = false;
  let settings = new SettingsStore(connection, supportsWorkspaceConfiguration);
  const scheduler = createValidationScheduler(async (uri, validationId) => {
    const document = documents.get(uri);
    if (!document) {
      return;
    }
    const filePath = resolveDocumentPath(document.uri);
    const workspaceSettings = await settings.get(uri);
    const diagnostics = await collectDiagnosticsFromSource(
      document.getText(),
      filePath,
      workspaceSettings.strictDomLints
    );
    if (!scheduler.isLatest(uri, validationId)) {
      return;
    }
    connection.sendDiagnostics({ uri, diagnostics });
  }, 150);
  connection.onInitialize((params) => {
    supportsWorkspaceConfiguration = params.capabilities.workspace?.configuration === true;
    settings = new SettingsStore(connection, supportsWorkspaceConfiguration);
    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
          save: { includeText: false }
        },
        completionProvider: {
          triggerCharacters: [":", "<", "{"]
        },
        hoverProvider: true
      }
    };
  });
  connection.onInitialized(() => {
    if (supportsWorkspaceConfiguration) {
      void connection.client.register(DidChangeConfigurationNotification.type, void 0);
    }
  });
  connection.onDidChangeConfiguration(async () => {
    settings.clear();
    for (const document of documents.all()) {
      await scheduler.flush(document.uri);
    }
  });
  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }
    return getCompletionItems(document.getText(), params.position);
  });
  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    return getHover(document.getText(), params.position);
  });
  documents.onDidOpen((event) => {
    void scheduler.flush(event.document.uri);
  });
  documents.onDidChangeContent((event) => {
    scheduler.schedule(event.document.uri);
  });
  documents.onDidSave((event) => {
    void scheduler.flush(event.document.uri);
  });
  documents.onDidClose((event) => {
    scheduler.clear(event.document.uri);
    settings.clear(event.document.uri);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });
  documents.listen(connection);
  connection.listen();
}

// src/server.ts
startLanguageServer();
