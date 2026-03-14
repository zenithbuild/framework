import path from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

function getConfiguredServerPath(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration('zenith').get<string>('languageServer.path', '').trim();
  if (!configured) {
    return context.asAbsolutePath(path.join('out', 'server.mjs'));
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return path.resolve(workspaceFolder.uri.fsPath, configured);
  }

  return context.asAbsolutePath(configured);
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<void> {
  const serverPath = getConfiguredServerPath(context);
  const serverOptions: ServerOptions = {
    run: {
      module: serverPath,
      transport: TransportKind.stdio
    },
    debug: {
      module: serverPath,
      transport: TransportKind.stdio,
      options: { execArgv: ['--inspect=6010'] }
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'zenith' }],
    synchronize: {
      configurationSection: 'zenith',
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{zen,zen.html,zenx}')
    }
  };

  client = new LanguageClient('zenithLanguageServer', 'Zenith Language Server', serverOptions, clientOptions);
  await client.start();
  context.subscriptions.push(client);
}

async function restartLanguageClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
  await startLanguageClient(context);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('zenith.restartServer', async () => {
      await restartLanguageClient(context);
      void vscode.window.showInformationMessage('Zenith language server restarted.');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('zenith.languageServer.path')) {
        return;
      }
      await restartLanguageClient(context);
    })
  );

  try {
    await startLanguageClient(context);
  } catch (error: unknown) {
    void vscode.window.showErrorMessage(`Zenith: failed to start language server: ${String(error)}`);
    throw error;
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
