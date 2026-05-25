import type { ScopedServerDiagnostic, ScopedServerDiagnosticSeverity } from './types.js';

export const SCOPED_SERVER_DIAGNOSTIC = {
    OWNER_LOAD_MISUSE: 'CSV001',
    OWNER_GUARD_MISUSE: 'CSV002',
    OWNER_ACTION_MISUSE: 'CSV003',
    RESERVED_BINDING: 'CSV004',
    LEVEL1_LET_REJECTED: 'CSV005',
    MULTIPLE_SERVER_BLOCKS: 'CSV006',
    CLIENT_SCRIPT_LEAK: 'CSV007',
    COMPETING_DOCUMENT_ROOTS: 'CSV008',
    MIXED_LEVEL1_AND_DATA: 'CSV009',
    MISSING_LANG_TS: 'CSV010',
    UNREFERENCED_SERVER_VAR: 'CSV011'
} as const;

export function createScopedServerDiagnostic(
    code: string,
    severity: ScopedServerDiagnosticSeverity,
    message: string,
    filePath: string
): ScopedServerDiagnostic {
    return {
        code,
        severity,
        message,
        filePath
    };
}

export function sortScopedServerDiagnostics(diagnostics: ScopedServerDiagnostic[]): ScopedServerDiagnostic[] {
    return [...diagnostics].sort((left, right) => {
        const fileCmp = left.filePath.localeCompare(right.filePath);
        if (fileCmp !== 0) {
            return fileCmp;
        }
        return left.code.localeCompare(right.code);
    });
}
