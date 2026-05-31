export type ScopedServerDiagnosticSeverity = 'error' | 'warning';

export interface ScopedServerDiagnostic {
    code: string;
    severity: ScopedServerDiagnosticSeverity;
    message: string;
    filePath: string;
}

export type ScopedServerOwnerKind = 'layout' | 'component';
export type ScopedServerOwnerSyntax = 'variables' | 'explicit-data';

export interface ScopedServerDataOwnerBase {
    ownerKind: ScopedServerOwnerKind;
    ownerPath: string;
    syntax: ScopedServerOwnerSyntax;
    serializedVariableNames: string[];
    level1VariableNames?: string[];
    exportName: 'data';
}

export interface ScopedServerDataOwner extends ScopedServerDataOwnerBase {
    ownerKey: string;
}

export interface CompilerOptsLike {
    typescriptDefault?: boolean;
}

export interface ScanRouteScopedServerOwnersOptions {
    pageSource: string;
    pageFile: string;
    registry: Map<string, string>;
    srcDir: string;
    compilerOpts?: CompilerOptsLike;
}

export interface ScanRouteScopedServerOwnersResult {
    owners: ScopedServerDataOwner[];
    diagnostics: ScopedServerDiagnostic[];
}

export interface OwnerFileAnalysisResult {
    owner: ScopedServerDataOwnerBase | null;
    diagnostics: ScopedServerDiagnostic[];
}

export interface ScriptBlockPartition {
    attrs: string;
    body: string;
}

export type ScopedServerInstanceStrategy = 'singleton' | 'per-instance';

export type ScopedServerStaticPropValue =
    | string
    | number
    | boolean
    | null
    | ScopedServerStaticPropValue[]
    | { [key: string]: ScopedServerStaticPropValue };

export type ScopedServerStaticProps = Record<string, ScopedServerStaticPropValue>;

export interface ManifestScopedServerDataInstance {
    key: string;
    occurrenceId: string;
    props: ScopedServerStaticProps;
}

export interface ManifestScopedServerDataEntry {
    ownerKind: ScopedServerOwnerKind;
    ownerKey: string;
    syntax: ScopedServerOwnerSyntax;
    exportName: 'data';
    instanceStrategy: ScopedServerInstanceStrategy;
    serializedVariableNames?: string[];
    props?: ScopedServerStaticProps;
    instances?: ManifestScopedServerDataInstance[];
}

export interface AnalyzeRouteScopedServerMetadataOptions {
    pageSource: string;
    pageFile: string;
    registry: Map<string, string>;
    srcDir: string;
    compilerOpts?: CompilerOptsLike;
}

export interface AnalyzeRouteScopedServerMetadataResult {
    hasScopedServerData: boolean;
    scopedServerData: ManifestScopedServerDataEntry[];
    diagnostics: ScopedServerDiagnostic[];
}
