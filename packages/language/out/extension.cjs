"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var import_node_path = __toESM(require("node:path"));
var vscode = __toESM(require("vscode"));
var import_node = require("vscode-languageclient/node");
var client;
function getConfiguredServerPath(context) {
  const configured = vscode.workspace.getConfiguration("zenith").get("languageServer.path", "").trim();
  if (!configured) {
    return context.asAbsolutePath(import_node_path.default.join("out", "server.mjs"));
  }
  if (import_node_path.default.isAbsolute(configured)) {
    return configured;
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return import_node_path.default.resolve(workspaceFolder.uri.fsPath, configured);
  }
  return context.asAbsolutePath(configured);
}
async function startLanguageClient(context) {
  const serverPath = getConfiguredServerPath(context);
  const serverOptions = {
    run: {
      command: process.execPath,
      args: [serverPath, "--stdio"],
      options: { env: process.env }
    },
    debug: {
      command: process.execPath,
      args: ["--inspect=6010", serverPath, "--stdio"],
      options: { env: process.env }
    }
  };
  const clientOptions = {
    documentSelector: [{ scheme: "file", language: "zenith" }],
    synchronize: {
      configurationSection: "zenith",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{zen,zen.html,zenx}")
    }
  };
  client = new import_node.LanguageClient("zenithLanguageServer", "Zenith Language Server", serverOptions, clientOptions);
  await client.start();
  context.subscriptions.push(client);
}
async function restartLanguageClient(context) {
  if (client) {
    await client.stop();
    client = void 0;
  }
  await startLanguageClient(context);
}
function activate(context) {
  void startLanguageClient(context).catch((error) => {
    void vscode.window.showErrorMessage(`Zenith: failed to start language server: ${String(error)}`);
  });
  context.subscriptions.push(
    vscode.commands.registerCommand("zenith.restartServer", async () => {
      await restartLanguageClient(context);
      void vscode.window.showInformationMessage("Zenith language server restarted.");
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration("zenith.languageServer.path")) {
        return;
      }
      await restartLanguageClient(context);
    })
  );
}
function deactivate() {
  return client?.stop();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
