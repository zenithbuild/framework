// src/main.ts
import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocumentSyncKind
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";

// src/code-actions.ts
import {
  CodeActionKind
} from "vscode-languageserver/node.js";
var DOM_QUERY_SUPPRESS = "// zen-allow:dom-query explain interop reason";
var DOM_LISTENER_TODO = "// TODO(zenith): replace addEventListener with zenOn(target, eventName, handler)";
var DOM_LISTENER_CLEANUP = "// TODO(zenith): register the disposer with ctx.cleanup(...) inside zenMount";
var DOM_WRAPPER_TODO = "// TODO(zenith): replace this guard with zenWindow() / zenDocument()";
function getCodeActions(text, uri, diagnostics) {
  const actions = [];
  for (const diagnostic of diagnostics) {
    const code = typeof diagnostic.code === "string" ? diagnostic.code : "";
    if (!code) {
      continue;
    }
    if (code === "ZEN-DOM-QUERY") {
      const action = createDomQuerySuppressAction(text, uri, diagnostic);
      if (action) {
        actions.push(action);
      }
      continue;
    }
    if (code === "ZEN-DOM-LISTENER") {
      const action = createCommentInsertionAction(
        text,
        uri,
        diagnostic,
        [DOM_LISTENER_TODO, DOM_LISTENER_CLEANUP],
        "Zenith: Add zenOn migration note"
      );
      if (action) {
        actions.push(action);
      }
      continue;
    }
    if (code === "ZEN-DOM-WRAPPER") {
      const replacementAction = createGlobalThisReplacementAction(text, uri, diagnostic);
      if (replacementAction) {
        actions.push(replacementAction);
      }
      const noteAction = createCommentInsertionAction(
        text,
        uri,
        diagnostic,
        [DOM_WRAPPER_TODO],
        "Zenith: Add zenWindow/zenDocument migration note"
      );
      if (noteAction) {
        actions.push(noteAction);
      }
    }
  }
  return actions;
}
function createDomQuerySuppressAction(text, uri, diagnostic) {
  const lineIndex = diagnostic.range.start.line;
  if (lineIndex > 0) {
    const previousLine = getLine(text, lineIndex - 1);
    if (previousLine?.includes("zen-allow:dom-query")) {
      return null;
    }
  }
  return createCommentInsertionAction(
    text,
    uri,
    diagnostic,
    [DOM_QUERY_SUPPRESS],
    "Zenith: Suppress DOM query with zen-allow comment"
  );
}
function createGlobalThisReplacementAction(text, uri, diagnostic) {
  const lineIndex = diagnostic.range.start.line;
  const line = getLine(text, lineIndex);
  if (!line) {
    return null;
  }
  if (line.includes("globalThis.window")) {
    return createReplacementAction(
      uri,
      diagnostic,
      {
        start: { line: lineIndex, character: line.indexOf("globalThis.window") },
        end: { line: lineIndex, character: line.indexOf("globalThis.window") + "globalThis.window".length }
      },
      "zenWindow()",
      "Zenith: Replace globalThis.window with zenWindow()"
    );
  }
  if (line.includes("globalThis.document")) {
    return createReplacementAction(
      uri,
      diagnostic,
      {
        start: { line: lineIndex, character: line.indexOf("globalThis.document") },
        end: { line: lineIndex, character: line.indexOf("globalThis.document") + "globalThis.document".length }
      },
      "zenDocument()",
      "Zenith: Replace globalThis.document with zenDocument()"
    );
  }
  return null;
}
function createCommentInsertionAction(text, uri, diagnostic, commentLines, title) {
  const lineIndex = diagnostic.range.start.line;
  const line = getLine(text, lineIndex);
  if (line === void 0) {
    return null;
  }
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const previousLine = lineIndex > 0 ? getLine(text, lineIndex - 1) : void 0;
  if (previousLine && commentLines.every((commentLine) => previousLine.includes(commentLine.trim()))) {
    return null;
  }
  const newText = commentLines.map((commentLine) => `${indent}${commentLine}`).join("\n") + "\n";
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
function createReplacementAction(uri, diagnostic, range, newText, title) {
  const edits = [{ range, newText }];
  const documentEdit = {
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
function getLine(text, lineIndex) {
  const lines = text.split("\n");
  return lines[lineIndex];
}

// src/completions.ts
import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind
} from "vscode-languageserver/node.js";

// src/docs.ts
var DOCS_BASE_URL = "https://github.com/zenithbuild/framework/blob/master/";
function createEventDoc(label, summary, example) {
  return {
    label,
    summary,
    example,
    docPath: "docs/documentation/syntax/events.md"
  };
}
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
  },
  "on:esc": {
    ...createEventDoc(
      "on:esc",
      "Escape-filtered keydown alias that routes through Zenith\u2019s document-level esc dispatch.",
      "<button on:esc={closeMenu}>Close</button>"
    )
  },
  "on:hoverin": {
    ...createEventDoc(
      "on:hoverin",
      "Hover sugar alias for pointerenter when hover logic needs real event wiring.",
      "<div on:hoverin={handleEnter}></div>"
    )
  },
  "on:hoverout": {
    ...createEventDoc(
      "on:hoverout",
      "Hover sugar alias for pointerleave when hover logic needs real event wiring.",
      "<div on:hoverout={handleLeave}></div>"
    )
  },
  "on:click": createEventDoc(
    "on:click",
    "Canonical mouse click binding in Zenith\u2019s universal on:* event model.",
    "<button on:click={handleClick}>Press</button>"
  ),
  "on:doubleclick": createEventDoc(
    "on:doubleclick",
    "Canonical alias that normalizes doubleclick bindings to the emitted dblclick event.",
    "<button on:doubleclick={handleDoubleClick}>Press</button>"
  ),
  "on:dblclick": createEventDoc(
    "on:dblclick",
    "Canonical double-click binding using the normalized dblclick event name.",
    "<button on:dblclick={handleDoubleClick}>Press</button>"
  ),
  "on:keydown": createEventDoc(
    "on:keydown",
    "Canonical keyboard keydown binding in Zenith\u2019s universal on:* event model.",
    "<div on:keydown={handleKeydown}></div>"
  ),
  "on:keyup": createEventDoc(
    "on:keyup",
    "Canonical keyboard keyup binding in Zenith\u2019s universal on:* event model.",
    "<div on:keyup={handleKeyup}></div>"
  ),
  "on:submit": createEventDoc(
    "on:submit",
    "Canonical form submit binding in Zenith\u2019s universal on:* event model.",
    "<form on:submit={handleSubmit}></form>"
  ),
  "on:input": createEventDoc(
    "on:input",
    "Canonical input binding for immediate form-value updates.",
    "<input on:input={handleInput} />"
  ),
  "on:change": createEventDoc(
    "on:change",
    "Canonical change binding for committed form-value updates.",
    "<input on:change={handleChange} />"
  ),
  "on:focus": createEventDoc(
    "on:focus",
    "Canonical focus binding for element focus transitions.",
    "<input on:focus={handleFocus} />"
  ),
  "on:blur": createEventDoc(
    "on:blur",
    "Canonical blur binding for element focus exit transitions.",
    "<input on:blur={handleBlur} />"
  ),
  "on:pointerdown": createEventDoc(
    "on:pointerdown",
    "Canonical pointerdown binding from the recommended pointer event set.",
    "<div on:pointerdown={handlePointerDown}></div>"
  ),
  "on:pointerup": createEventDoc(
    "on:pointerup",
    "Canonical pointerup binding from the recommended pointer event set.",
    "<div on:pointerup={handlePointerUp}></div>"
  ),
  "on:pointermove": createEventDoc(
    "on:pointermove",
    "Canonical pointermove binding from the recommended pointer event set.",
    "<svg on:pointermove={handlePointerMove}></svg>"
  ),
  "on:pointerenter": createEventDoc(
    "on:pointerenter",
    "Direct pointerenter binding remains fully supported alongside on:hoverin.",
    "<div on:pointerenter={handleEnter}></div>"
  ),
  "on:pointerleave": createEventDoc(
    "on:pointerleave",
    "Direct pointerleave binding remains fully supported alongside on:hoverout.",
    "<div on:pointerleave={handleLeave}></div>"
  ),
  "on:dragstart": createEventDoc(
    "on:dragstart",
    "Canonical dragstart binding from Zenith\u2019s recommended drag event set.",
    '<div draggable="true" on:dragstart={handleDragStart}></div>'
  ),
  "on:dragover": createEventDoc(
    "on:dragover",
    "Canonical dragover binding from Zenith\u2019s recommended drag event set.",
    "<div on:dragover={handleDragOver}></div>"
  ),
  "on:drop": createEventDoc(
    "on:drop",
    "Canonical drop binding from Zenith\u2019s recommended drag event set.",
    "<div on:drop={handleDrop}></div>"
  ),
  "on:scroll": createEventDoc(
    "on:scroll",
    "Canonical scroll binding from Zenith\u2019s recommended event set.",
    "<div on:scroll={handleScroll}></div>"
  ),
  "on:contextmenu": createEventDoc(
    "on:contextmenu",
    "Canonical contextmenu binding from Zenith\u2019s recommended mouse event set.",
    "<div on:contextmenu={handleContextMenu}></div>"
  )
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
  "on:doubleclick",
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
  const docs = getSymbolDoc(label);
  return {
    label,
    kind: CompletionItemKind.Function,
    detail: docs?.summary ?? "Zenith canonical primitive",
    ...docs ? {
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Docs: [${docs.docPath}](${getDocUrl(docs.docPath)})`
      }
    } : {},
    insertText: label
  };
}
function createEventCompletion(label) {
  const docs = getSymbolDoc(label);
  return {
    label,
    kind: CompletionItemKind.Property,
    detail: docs?.summary ?? "Canonical Zenith DOM event binding",
    ...docs ? {
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Docs: [${docs.docPath}](${getDocUrl(docs.docPath)})`
      }
    } : {},
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
      typeof item.insertText === "string" ? item.insertText : ""
    ].join(" ").toLowerCase();
    return blockedFrameworkTokens.every((token) => !haystack.includes(token));
  });
}

// src/diagnostics.ts
import { fileURLToPath } from "node:url";
import { compile } from "@zenithbuild/compiler";
import {
  DiagnosticSeverity,
  DiagnosticTag
} from "vscode-languageserver/node.js";
async function collectDiagnosticsFromSource(source, filePath, strictDomLints) {
  try {
    const result = compile({ source, filePath });
    if (result.schemaVersion !== 1) {
      return [compilerContractDiagnostic(`Unsupported compiler schemaVersion: ${String(result.schemaVersion)}`)];
    }
    return mapCompilerEnvelopeToDiagnostics(result, strictDomLints);
  } catch (error) {
    return [compilerContractDiagnostic(String(error))];
  }
}
function mapCompilerEnvelopeToDiagnostics(result, strictDomLints) {
  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  if (diagnostics.length > 0) {
    return diagnostics.map((diagnostic) => {
      const tags = mapTags(diagnostic.tags);
      return {
        source: diagnostic.source ?? "zenith",
        code: diagnostic.code,
        message: diagnostic.message,
        severity: resolveSeverity(diagnostic, strictDomLints),
        range: toRange(diagnostic.range),
        ...tags ? { tags } : {}
      };
    });
  }
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  return warnings.map((warning) => ({
    source: "zenith",
    code: warning.code,
    message: warning.message,
    severity: resolveSeverity(warning, strictDomLints),
    range: toRange(warning.range)
  }));
}
function resolveDocumentPath(uri) {
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return uri.replace(/^[a-z]+:\/\//i, "/virtual/");
}
function resolveSeverity(diagnostic, strictDomLints) {
  if (strictDomLints && diagnostic.code.startsWith("ZEN-DOM-")) {
    return DiagnosticSeverity.Error;
  }
  if (diagnostic.severity === "error") {
    return DiagnosticSeverity.Error;
  }
  if (diagnostic.severity === "hint") {
    return DiagnosticSeverity.Hint;
  }
  if (diagnostic.severity === "information") {
    return DiagnosticSeverity.Information;
  }
  return DiagnosticSeverity.Warning;
}
function mapTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return void 0;
  }
  return tags.flatMap((tag) => {
    if (tag === "deprecated") {
      return [DiagnosticTag.Deprecated];
    }
    if (tag === "unnecessary") {
      return [DiagnosticTag.Unnecessary];
    }
    return [];
  });
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
import { MarkupKind as MarkupKind2 } from "vscode-languageserver/node.js";
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
      kind: MarkupKind2.Markdown,
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
        hoverProvider: true,
        codeActionProvider: true
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
  connection.onCodeAction((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }
    return getCodeActions(document.getText(), params.textDocument.uri, params.context.diagnostics);
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
