import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import snapshot from './catalog.generated.json' with { type: 'json' };
import { defaultDirectoryQuery, queryDirectory } from './catalog-query.js';
import { directoryGitInstallSpec } from './git-install-spec.js';
import { apply } from './index.js';

describe('DSH client assembly', () => {
  it('registers one bilingual, root-scoped Settings section', () => {
    const component = { current: undefined as undefined | ((props: never) => React.ReactNode) };
    const register = vi.fn((options, candidate) => {
      expect(options).toMatchObject({
        name: 'settings.section',
        id: 'dsh-pub-directory',
        order: 30,
        locale: 'dshPub.directory',
      });
      component.current = candidate;
      return vi.fn();
    });
    const registerLocale = vi.fn(() => vi.fn());
    const ctx = {
      effect: vi.fn((factory: () => unknown) => factory()),
      locale: {
        register: registerLocale,
        bind: vi.fn(() => (key: string) => key),
      },
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => factory()),
        register,
      },
    };

    apply(ctx);

    expect(registerLocale).toHaveBeenCalledWith(
      'dshPub.directory',
      expect.objectContaining({ en: expect.any(Object), zh: expect.any(Object) }),
    );
    expect(ctx.slots.inject).toHaveBeenCalledWith('settings.section', expect.any(Function));
    expect(register).toHaveBeenCalledTimes(1);
    expect(component.current).toBeDefined();
  });

  it('renders the full directory as an inert browse surface', () => {
    let Section: undefined | ((props: never) => React.ReactNode);
    const ctx = {
      effect: vi.fn((factory: () => unknown) => factory()),
      locale: {
        register: vi.fn(() => vi.fn()),
        bind: vi.fn(() => () => 'dsh.pub Registry'),
      },
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => factory()),
        register: vi.fn((_options, component) => {
          Section = component;
          return vi.fn();
        }),
      },
    };

    apply(ctx);
    const dictionary = new Proxy(
      {
        locale: 'en',
        nav: 'dsh.pub Registry',
        title: 'Discover the DSH ecosystem',
        summary: 'Browse every public catalog entry.',
        desktopNote: 'Browse inside the official desktop app.',
        desktopLink: 'Official desktop app',
        searchPlaceholder: 'Search plugins',
      },
      { get: (target, key: string) => target[key as keyof typeof target] ?? key },
    );
    expect(Section).toBeDefined();
    const entryCount = new Intl.NumberFormat('en').format(snapshot.entries.length);
    const html = renderToStaticMarkup(
      createElement(Section!, {
        t: (key: string) => dictionary[key as keyof typeof dictionary],
      } as never),
    );

    expect(html).toContain('Discover the DSH ecosystem');
    expect(html).toContain(`<strong>${entryCount}</strong>`);
    expect(html).toContain('Search plugins');
    expect(html).toContain('<option value="profile">profile</option>');
    expect(html).toContain('https://dsh.pub/en/plugins/');
    expect(html).toContain('https://www.deepseek.com/harness/');
    expect(html).toContain('Official desktop app');
    expect(html).not.toContain('dshpub-install');
    expect(html).not.toContain('<script');
  });

  it('offers one install button for each pinned Git entry when the desktop manager is present', () => {
    let Section: undefined | ((props: never) => React.ReactNode);
    const installBundle = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }));
    const ctx = {
      effect: vi.fn((factory: () => unknown) => factory()),
      locale: {
        register: vi.fn(() => vi.fn()),
        bind: vi.fn(() => (key: string) => key),
      },
      remote: {
        pluginManager: {
          inspect: vi.fn(async () => ({ ok: true, value: { status: 'accepted' } })),
          installBundle,
        },
      },
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => factory()),
        register: vi.fn((_options, component) => {
          Section = component;
          return vi.fn();
        }),
      },
    };

    apply(ctx);
    const html = renderToStaticMarkup(
      createElement(Section!, { t: (key: string) => key } as never),
    );
    const installable = queryDirectory(snapshot.entries, defaultDirectoryQuery).entries.filter(
      (entry) => directoryGitInstallSpec(entry),
    );

    expect(installable.length).toBeGreaterThan(0);
    expect(html.match(/class="dshpub-install"/g)).toHaveLength(installable.length);
    expect(html).toContain('>install<');
  });
});
