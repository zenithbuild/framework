import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver';
import { getCompletionItems } from './completions.js';
import { collectDiagnosticsFromSource, resolveDocumentPath } from './diagnostics.js';
import { getHover } from './hover.js';
import { SettingsStore } from './settings.js';
import { createValidationScheduler } from './validation.js';

export function startLanguageServer(): void {
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

  connection.onInitialize((params: InitializeParams): InitializeResult => {
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
          triggerCharacters: [':', '<', '{']
        },
        hoverProvider: true
      }
    };
  });

  connection.onInitialized(() => {
    if (supportsWorkspaceConfiguration) {
      void connection.client.register(DidChangeConfigurationNotification.type, undefined);
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
