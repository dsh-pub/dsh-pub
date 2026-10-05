import type { DshClientContext } from './dsh-contract.js';
export type DirectoryInstallPhase = 'installed' | 'restart-required' | 'overridden' | 'already-installed' | 'failed';
export interface DirectoryInstallResult {
    status: DirectoryInstallPhase;
    reason?: string;
}
export interface DirectoryInspection {
    status: 'accepted' | 'refused';
    problem?: string;
    reason?: string;
}
export interface DirectoryChangeError {
    code?: string;
    diagnostic?: string;
    incompatible?: Array<{
        name: string;
        version: string;
        peers?: Record<string, string>;
    }>;
}
export interface DirectoryChange {
    application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled';
    error?: DirectoryChangeError;
}
export type DirectoryRemote<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error?: {
        message?: string;
    };
};
/** The desktop plugin manager methods this directory calls. */
export interface DirectoryPluginManager {
    inspect(spec: string): Promise<DirectoryRemote<DirectoryInspection>>;
    installBundle(spec: string, options?: {
        enabled?: boolean;
    }): Promise<DirectoryRemote<DirectoryChange>>;
}
export declare function directoryInstaller(ctx: DshClientContext): DirectoryPluginManager | undefined;
/** Inspect a pinned git spec, then install and enable it in the current profile. */
export declare function installDirectoryEntry(manager: DirectoryPluginManager, spec: string): Promise<DirectoryInstallResult>;
