import { describe, expect, it, vi } from 'vitest';

import { apply } from './index.js';
import { registrySkill } from './registry-skill.js';

const hostContext = (register = vi.fn(() => () => undefined)) => {
  const effect = vi.fn((factory: () => unknown) => factory());
  const inject = vi.fn((_deps: string[], callback: (skillCtx: unknown) => void) => {
    callback({
      effect,
      skills: { register },
    });
  });
  return { inject, effect, register };
};

describe('dsh.pub host plugin', () => {
  it('registers the registry skill the moment the skills service is available', () => {
    const register = vi.fn(() => () => undefined);
    const ctx = hostContext(register);

    apply(ctx as never);

    expect(ctx.inject).toHaveBeenCalledTimes(1);
    expect(ctx.inject.mock.calls[0]?.[0]).toEqual(['skills']);

    const injectedCtx = ctx.inject.mock.calls[0]?.[1] as (skillCtx: unknown) => void;
    expect(injectedCtx).toBeTypeOf('function');

    expect(ctx.effect).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);

    const registered = register.mock.calls[0]?.[0] as {
      name: string;
      source: string;
      content: string;
    };
    expect(registered.name).toBe(registrySkill.name);
    expect(registered.source).toBe('runtime');
    expect(registered.content).toBe(registrySkill.content);
  });

  it('does nothing when the skills service never becomes available', () => {
    const register = vi.fn();
    const ctx = {
      inject: vi.fn(),
      effect: vi.fn(),
    };

    apply(ctx as never);

    expect(register).not.toHaveBeenCalled();
    expect(ctx.effect).not.toHaveBeenCalled();
  });
});

describe('dsh.pub registry skill', () => {
  it('has a valid kebab-case name and non-empty routing description', () => {
    expect(registrySkill.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(registrySkill.description.length).toBeGreaterThan(0);
    expect(registrySkill.whenToUse?.length).toBeGreaterThan(0);
  });

  it('teaches the agent to read the machine-readable registry', () => {
    expect(registrySkill.content).toContain('https://dsh.pub/api/plugins');
    expect(registrySkill.content).toContain('https://dsh.pub/plugins.json');
  });

  it('documents the search endpoint contract', () => {
    expect(registrySkill.content).toContain('installable');
    expect(registrySkill.content).toContain('builtIn');
    expect(registrySkill.content).toContain('limit');
    expect(registrySkill.content).toContain('offset');
    expect(registrySkill.content).toContain('hasMore');
  });

  it('warns that the complete dump is too large for one fetch', () => {
    expect(registrySkill.content).toContain('will not fit in a single web fetch');
  });

  it('offers a shell fallback for the search endpoint', () => {
    expect(registrySkill.content).toContain("curl -s 'https://dsh.pub/api/plugins");
  });

  it('teaches the exact, commit-pinned install command', () => {
    expect(registrySkill.content).toContain('npx dshpub add owner/repo --ref <commit>');
  });

  it('distinguishes installable bundles from built-ins and discovery-only entries', () => {
    expect(registrySkill.content).toContain('install.installable');
    expect(registrySkill.content).toContain('builtIn: true');
    expect(registrySkill.content).toContain('discoveryOnly');
  });

  it('keeps the install-count semantics truthful', () => {
    expect(registrySkill.content).toContain('DO_NOT_TRACK');
    expect(registrySkill.content).toContain('DISABLE_TELEMETRY');
    expect(registrySkill.content).toContain('CLI-reported completed installs');
  });
});
