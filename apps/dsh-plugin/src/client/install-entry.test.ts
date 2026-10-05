import { describe, expect, it, vi } from 'vitest';

import { directoryInstaller, installDirectoryEntry } from './install-entry.js';

const spec = `github:example/beta-tools#${'b'.repeat(40)}`;

describe('directory install', () => {
  it('inspects the pinned spec and enables the bundle', async () => {
    const inspect = vi.fn(async () => ({
      ok: true as const,
      value: { status: 'accepted' as const },
    }));
    const installBundle = vi.fn(async () => ({
      ok: true as const,
      value: { application: 'applied' as const },
    }));

    await expect(installDirectoryEntry({ inspect, installBundle }, spec)).resolves.toEqual({
      status: 'installed',
    });
    expect(inspect).toHaveBeenCalledWith(spec);
    expect(installBundle).toHaveBeenCalledWith(spec, { enabled: true });
  });

  it('reports an existing install without calling the installer', async () => {
    const installBundle = vi.fn();
    await expect(
      installDirectoryEntry(
        {
          inspect: async () => ({
            ok: true as const,
            value: { status: 'refused' as const, problem: 'already-installed' },
          }),
          installBundle,
        },
        spec,
      ),
    ).resolves.toEqual({ status: 'already-installed' });
    expect(installBundle).not.toHaveBeenCalled();
  });

  it('keeps restart, override, and compatibility failures distinct', async () => {
    const accepted = async () => ({ ok: true as const, value: { status: 'accepted' as const } });
    await expect(
      installDirectoryEntry(
        {
          inspect: accepted,
          installBundle: async () => ({
            ok: true as const,
            value: { application: 'restart-required' as const },
          }),
        },
        spec,
      ),
    ).resolves.toEqual({ status: 'restart-required' });

    await expect(
      installDirectoryEntry(
        {
          inspect: accepted,
          installBundle: async () => ({
            ok: true as const,
            value: {
              application: 'failed' as const,
              error: {
                code: 'incompatible-version',
                incompatible: [
                  {
                    name: '@example/plugin',
                    version: '1.0.0',
                    peers: { '@deepseek-ai/dsh-client-locale': '^0.1.0' },
                  },
                ],
              },
            },
          }),
        },
        spec,
      ),
    ).resolves.toEqual({
      status: 'failed',
      reason: '@example/plugin@1.0.0 (@deepseek-ai/dsh-client-locale ^0.1.0)',
    });
  });

  it('uses the desktop plugin manager only when both methods exist', () => {
    const inspect = vi.fn();
    const installBundle = vi.fn();
    const ctx = {
      remote: { pluginManager: { inspect, installBundle } },
    };
    expect(directoryInstaller(ctx as never)?.inspect).toBeTypeOf('function');
    expect(directoryInstaller({} as never)).toBeUndefined();
    expect(directoryInstaller({ remote: { pluginManager: { inspect } } } as never)).toBeUndefined();
  });
});
