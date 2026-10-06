import { describe, expect, it, vi } from 'vitest';

import {
  buildPluginSearchIndex,
  type PluginSearchSourceEntry,
} from '@dsh-pub/catalog/plugin-search';

const PLUGIN_SEARCH_INDEX_PATH = '/plugins-search.json';

const sourceEntry = (slug: string, name: string): PluginSearchSourceEntry => ({
  slug,
  name,
  description: { en: `English ${slug}`, zh: `中文 ${slug}` },
  category: 'other',
  type: 'plugin',
  builtIn: false,
  capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
  availability: { profiles: null },
  source: {
    repository: `https://github.com/example/${slug}`,
    directory: '',
    commit: 'c'.repeat(40),
  },
  distribution: { installable: true },
});

const indexBody = buildPluginSearchIndex(
  [sourceEntry('dsh-web-search', 'dsh-web-search'), sourceEntry('dsh-memory', 'dsh-memory')],
  '2026-01-01T00:00:00.000Z',
);

/**
 * A fresh module instance per call, so the isolate-level index cache never leaks
 * between tests. Everything the test asserts on — including the error class — is
 * read from this instance, because `vi.resetModules()` mints a new class identity.
 */
const loadModule = async () => {
  vi.resetModules();
  return import('./plugin-search.js');
};

const assetsStub = (response: Response) => {
  const fetch = vi.fn<(_request: Request) => Promise<Response>>(async () => response.clone());
  return { fetch, binding: { fetch } };
};

const request = (query: string) => new Request(`https://dsh.pub/api/plugins${query}`);

describe('parsePluginSearchQuery', () => {
  it('defaults every optional parameter', async () => {
    const { parsePluginSearchQuery } = await loadModule();
    expect(parsePluginSearchQuery(request(''))).toEqual({
      q: '',
      category: undefined,
      type: undefined,
      installable: undefined,
      builtIn: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it('trims text parameters', async () => {
    const { parsePluginSearchQuery } = await loadModule();
    const query = parsePluginSearchQuery(request('?q=%20web%20&category=%20models%20'));
    expect(query.q).toBe('web');
    expect(query.category).toBe('models');
  });

  it('accepts the documented boolean spellings', async () => {
    const { parsePluginSearchQuery } = await loadModule();
    expect(parsePluginSearchQuery(request('?installable=true&builtIn=0')).installable).toBe(true);
    expect(parsePluginSearchQuery(request('?installable=true&builtIn=0')).builtIn).toBe(false);
    expect(parsePluginSearchQuery(request('?installable=1')).installable).toBe(true);
    expect(parsePluginSearchQuery(request('?installable=false')).installable).toBe(false);
  });

  it('rejects an unparseable boolean', async () => {
    const { parsePluginSearchQuery, PluginSearchQueryError } = await loadModule();
    expect(() => parsePluginSearchQuery(request('?installable=maybe'))).toThrow(
      PluginSearchQueryError,
    );
    try {
      parsePluginSearchQuery(request('?installable=maybe'));
    } catch (error) {
      expect((error as InstanceType<typeof PluginSearchQueryError>).code).toBe(
        'invalid_installable',
      );
    }
  });

  it('rejects a non-integer or out-of-range limit', async () => {
    const { parsePluginSearchQuery, PluginSearchQueryError } = await loadModule();
    expect(() => parsePluginSearchQuery(request('?limit=abc'))).toThrow(PluginSearchQueryError);
    expect(() => parsePluginSearchQuery(request('?limit=0'))).toThrow(PluginSearchQueryError);
    expect(() => parsePluginSearchQuery(request('?limit=51'))).toThrow(PluginSearchQueryError);
    expect(parsePluginSearchQuery(request('?limit=50')).limit).toBe(50);
  });

  it('rejects an out-of-range offset', async () => {
    const { parsePluginSearchQuery, PluginSearchQueryError } = await loadModule();
    expect(() => parsePluginSearchQuery(request('?offset=-1'))).toThrow(PluginSearchQueryError);
    expect(() => parsePluginSearchQuery(request('?offset=10001'))).toThrow(PluginSearchQueryError);
    expect(parsePluginSearchQuery(request('?offset=5')).offset).toBe(5);
  });

  it('rejects an over-long q', async () => {
    const { parsePluginSearchQuery, PluginSearchQueryError } = await loadModule();
    expect(() => parsePluginSearchQuery(request(`?q=${'a'.repeat(201)}`))).toThrow(
      PluginSearchQueryError,
    );
    expect(parsePluginSearchQuery(request(`?q=${'a'.repeat(200)}`)).q).toHaveLength(200);
  });
});

describe('loadPluginSearchIndex', () => {
  it('fetches the projection from the asset binding', async () => {
    const { loadPluginSearchIndex } = await loadModule();
    const { fetch, binding } = assetsStub(Response.json(indexBody));
    const index = await loadPluginSearchIndex(binding, request(''));
    expect(fetch).toHaveBeenCalledTimes(1);
    const target = fetch.mock.calls[0]?.[0] as Request;
    expect(target).toBeInstanceOf(Request);
    expect(target.url).toBe(`https://dsh.pub${PLUGIN_SEARCH_INDEX_PATH}`);
    expect(index.entries).toHaveLength(2);
  });

  it('serves later requests from the isolate cache', async () => {
    const { loadPluginSearchIndex } = await loadModule();
    const { fetch, binding } = assetsStub(Response.json(indexBody));
    await loadPluginSearchIndex(binding, request(''));
    await loadPluginSearchIndex(binding, request(''));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load', async () => {
    const { loadPluginSearchIndex } = await loadModule();
    const failing = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValue(Response.json(indexBody));
    const binding = { fetch: failing };

    await expect(loadPluginSearchIndex(binding, request(''))).rejects.toThrow(/status 404/u);
    await expect(loadPluginSearchIndex(binding, request(''))).resolves.toMatchObject({
      schemaVersion: 1,
    });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsupported document shape', async () => {
    const { loadPluginSearchIndex } = await loadModule();
    const { binding } = assetsStub(Response.json({ schemaVersion: 99, entries: [] }));
    await expect(loadPluginSearchIndex(binding, request(''))).rejects.toThrow(/unsupported shape/u);
  });
});

describe('runPluginSearch', () => {
  it('searches the published projection', async () => {
    const { runPluginSearch } = await loadModule();
    const { binding } = assetsStub(Response.json(indexBody));
    const response = await runPluginSearch(binding, request('?q=web'));
    expect(response.total).toBe(1);
    expect(response.entries[0]?.slug).toBe('dsh-web-search');
    expect(response.entries[0]?.install.command).toBe(
      `npx dshpub add example/dsh-web-search --ref ${'c'.repeat(40)}`,
    );
  });

  it('surfaces a query error before touching the asset binding', async () => {
    const { runPluginSearch, PluginSearchQueryError } = await loadModule();
    const { fetch, binding } = assetsStub(Response.json(indexBody));
    await expect(runPluginSearch(binding, request('?limit=nope'))).rejects.toThrow(
      PluginSearchQueryError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
