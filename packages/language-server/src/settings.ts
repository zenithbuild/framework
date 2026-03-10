import type { Connection } from 'vscode-languageserver/node.js';

export interface ZenithSettings {
  readonly strictDomLints: boolean;
  readonly enableFrameworkSnippets: boolean;
}

const defaultSettings: ZenithSettings = {
  strictDomLints: false,
  enableFrameworkSnippets: false
};

export class SettingsStore {
  readonly #cache = new Map<string, Promise<ZenithSettings>>();

  constructor(
    private readonly connection: Connection,
    private readonly supportsWorkspaceConfiguration: boolean
  ) {}

  clear(uri?: string): void {
    if (uri) {
      this.#cache.delete(uri);
      return;
    }
    this.#cache.clear();
  }

  async get(uri: string): Promise<ZenithSettings> {
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

  private async load(uri: string): Promise<ZenithSettings> {
    const config = await this.connection.workspace.getConfiguration({
      scopeUri: uri,
      section: 'zenith'
    });

    return {
      strictDomLints: config?.strictDomLints === true,
      enableFrameworkSnippets: config?.enableFrameworkSnippets === true
    };
  }
}
