import type { DshClientContext } from './dsh-contract.js';

export type DirectoryInstallPhase =
  'installed' | 'restart-required' | 'overridden' | 'already-installed' | 'failed';

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

export type DirectoryRemote<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error?: { message?: string } };

/** The desktop plugin manager methods this directory calls. */
export interface DirectoryPluginManager {
  inspect(spec: string): Promise<DirectoryRemote<DirectoryInspection>>;
  installBundle(
    spec: string,
    options?: { enabled?: boolean },
  ): Promise<DirectoryRemote<DirectoryChange>>;
}

type ClientWithPluginManager = DshClientContext & {
  remote?: { pluginManager?: Partial<DirectoryPluginManager> };
};

export function directoryInstaller(ctx: DshClientContext): DirectoryPluginManager | undefined {
  const manager = (ctx as ClientWithPluginManager).remote?.pluginManager;
  if (typeof manager?.inspect !== 'function' || typeof manager.installBundle !== 'function') {
    return undefined;
  }
  return {
    inspect: (spec) => manager.inspect!(spec),
    installBundle: (spec, options) => manager.installBundle!(spec, options),
  };
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message) return message;
  }
  return '';
}

function incompatibility(error: DirectoryChangeError | undefined): string {
  if (!error?.incompatible?.length) return error?.diagnostic || error?.code || '';
  return error.incompatible
    .map((plugin) => {
      const peers = Object.entries(plugin.peers ?? {})
        .map(([name, range]) => `${name} ${range}`)
        .join(', ');
      return peers
        ? `${plugin.name}@${plugin.version} (${peers})`
        : `${plugin.name}@${plugin.version}`;
    })
    .join('; ');
}

/** Inspect a pinned git spec, then install and enable it in the current profile. */
export async function installDirectoryEntry(
  manager: DirectoryPluginManager,
  spec: string,
): Promise<DirectoryInstallResult> {
  let inspected: DirectoryRemote<DirectoryInspection>;
  try {
    inspected = await manager.inspect(spec);
  } catch (error) {
    return { status: 'failed', reason: messageFrom(error) };
  }
  if (!inspected.ok) return { status: 'failed', reason: messageFrom(inspected.error) };
  if (inspected.value.status === 'refused') {
    if (inspected.value.problem === 'already-installed') return { status: 'already-installed' };
    return { status: 'failed', reason: inspected.value.reason || inspected.value.problem || '' };
  }

  let installed: DirectoryRemote<DirectoryChange>;
  try {
    installed = await manager.installBundle(spec, { enabled: true });
  } catch (error) {
    return { status: 'failed', reason: messageFrom(error) };
  }
  if (!installed.ok) return { status: 'failed', reason: messageFrom(installed.error) };

  if (installed.value.application === 'applied') return { status: 'installed' };
  if (installed.value.application === 'restart-required') return { status: 'restart-required' };
  if (installed.value.application === 'overridden') return { status: 'overridden' };
  return { status: 'failed', reason: incompatibility(installed.value.error) };
}
