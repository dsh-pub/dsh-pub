import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

import { assertInstallableTarget } from '../apps/cli/src/index.js';

const pluginRoot = resolve('apps/dsh-plugin');

describe('dsh.pub DSH plugin artifact', () => {
  it('passes the public CLI bundle contract', async () => {
    await expect(assertInstallableTarget(pluginRoot)).resolves.toBeUndefined();
  });

  it('ships a loader-wrapped client bundle and a pure Host entry', async () => {
    const [client, host] = await Promise.all([
      readFile(resolve(pluginRoot, 'lib/client.js'), 'utf8'),
      readFile(resolve(pluginRoot, 'lib/index.js'), 'utf8'),
    ]);

    expect(client).toContain('window.__ModuleLoader__.load');
    expect(client).toContain('@dsh-pub/plugin-directory');
    expect(client).toContain('settings.section');
    expect(host).toContain('function apply()');
    expect(host).not.toContain('fetch(');

    let registration:
      | { id: string; factory: (require: (id: string) => unknown) => { apply?: unknown } }
      | undefined;
    const browser = {
      __ModuleLoader__: {
        load(candidate: typeof registration) {
          registration = candidate;
        },
      },
    };
    new Function('window', client)(browser);
    expect(registration?.id).toBe('@dsh-pub/plugin-directory');
    const exports = registration?.factory((id) => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return jsxRuntime;
      throw new Error(`Unexpected platform module: ${id}`);
    });
    expect(exports?.apply).toEqual(expect.any(Function));
  });
});
