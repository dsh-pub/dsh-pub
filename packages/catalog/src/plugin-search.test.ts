import { describe, expect, it } from 'vitest';

import {
  buildPluginSearchIndex,
  decodePluginSearchEntry,
  isPluginSearchIndex,
  PLUGIN_SEARCH_LIMIT_DEFAULT,
  PLUGIN_SEARCH_LIMIT_MAX,
  PLUGIN_SEARCH_QUERY_MAX_LENGTH,
  PLUGIN_SEARCH_SCHEMA_VERSION,
  PLUGIN_SEARCH_TERM_MAX_COUNT,
  pluginInstallCommand,
  pluginRepositoryCoordinate,
  searchPluginIndex,
  tokenizePluginQuery,
  type PluginSearchSourceEntry,
} from './plugin-search.js';

const COMMIT = 'b'.repeat(40);

const sourceEntry = (
  slug: string,
  overrides: Partial<Omit<PluginSearchSourceEntry, 'slug'>> = {},
): PluginSearchSourceEntry => ({
  slug,
  name: overrides.name ?? slug,
  description: overrides.description ?? { en: `English ${slug}`, zh: `中文 ${slug}` },
  category: overrides.category ?? 'other',
  type: overrides.type ?? 'plugin',
  builtIn: overrides.builtIn ?? false,
  capabilities: overrides.capabilities ?? {
    tools: null,
    uiContributions: null,
    uiSlotsDeclared: null,
  },
  availability: overrides.availability ?? { profiles: null },
  source: overrides.source ?? {
    repository: `https://github.com/example/${slug}`,
    directory: '',
    commit: COMMIT,
  },
  distribution: overrides.distribution ?? { installable: true },
});

describe('pluginRepositoryCoordinate', () => {
  it('reduces a repository URL to its owner/name coordinate', () => {
    expect(pluginRepositoryCoordinate('https://github.com/owner/repo')).toBe('owner/repo');
    expect(pluginRepositoryCoordinate('https://github.com/owner/repo.git')).toBe('owner/repo');
    expect(pluginRepositoryCoordinate('https://github.com/owner/repo/')).toBe('owner/repo');
  });
});

describe('pluginInstallCommand', () => {
  it('pins the commit and omits an empty path', () => {
    expect(pluginInstallCommand('owner/repo', COMMIT, null)).toBe(
      `npx dshpub add owner/repo --ref ${COMMIT}`,
    );
  });

  it('adds --path when the bundle lives in a subdirectory', () => {
    expect(pluginInstallCommand('owner/repo', COMMIT, 'apps/plugin')).toBe(
      `npx dshpub add owner/repo --ref ${COMMIT} --path apps/plugin`,
    );
  });
});

describe('buildPluginSearchIndex', () => {
  it('records one tuple per entry and dictionary-codes repeated values', () => {
    const index = buildPluginSearchIndex(
      [
        sourceEntry('alpha', { category: 'client-ui', type: 'bundle' }),
        sourceEntry('beta', { category: 'client-ui', type: 'bundle' }),
        sourceEntry('gamma', { category: 'models', type: 'plugin' }),
      ],
      '2026-01-01T00:00:00.000Z',
    );

    expect(index.schemaVersion).toBe(PLUGIN_SEARCH_SCHEMA_VERSION);
    expect(index.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(index.entries).toHaveLength(3);
    expect(index.dictionaries.categories).toEqual(['client-ui', 'models']);
    expect(index.dictionaries.types).toEqual(['bundle', 'plugin']);
    // Two entries share `client-ui`, so it is stored once and referenced twice.
    expect(index.entries[0]?.[4]).toBe(0);
    expect(index.entries[1]?.[4]).toBe(0);
    expect(index.entries[2]?.[4]).toBe(1);
  });

  it('normalizes tools, UI slots, profiles, and an empty directory', () => {
    const index = buildPluginSearchIndex([
      sourceEntry('alpha', {
        capabilities: {
          tools: ['bash', { name: 'read' }],
          uiContributions: [{ slot: 'conversation.view' }, { slot: 'conversation.view' }],
          uiSlotsDeclared: [{ slot: 'settings.section' }],
        },
        availability: { profiles: ['web', 'desktop', 'web'] },
      }),
    ]);

    const tuple = index.entries[0];
    expect(tuple?.[8]).toEqual(['bash', 'read']);
    // Repeated UI slots collapse, and contributions precede declared slots.
    expect(tuple?.[9]).toEqual(['conversation.view', 'settings.section']);
    expect(tuple?.[10]).toEqual([0, 1, 0]);
    expect(tuple?.[12]).toBeNull();
    expect(index.dictionaries.profiles).toEqual(['web', 'desktop']);
  });

  it('falls back to a built-in provenance label', () => {
    const index = buildPluginSearchIndex([sourceEntry('alpha', { builtIn: true })]);
    expect(index.dictionaries.provenances).toEqual(['built-in']);
    expect(index.entries[0]?.[7]).toBe(0);
  });
});

describe('decodePluginSearchEntry', () => {
  it('expands a tuple back into the public entry shape', () => {
    const index = buildPluginSearchIndex([
      sourceEntry('alpha', {
        name: 'Alpha',
        description: { en: 'Alpha plugin', zh: 'Alpha 插件' },
        category: 'client-ui',
        type: 'bundle',
        source: {
          repository: 'https://github.com/owner/repo',
          directory: 'apps/plugin',
          commit: COMMIT,
        },
      }),
    ]);

    const entry = decodePluginSearchEntry(index, index.entries[0]!);
    expect(entry).toEqual({
      slug: 'alpha',
      name: 'Alpha',
      description: { en: 'Alpha plugin', zh: 'Alpha 插件' },
      category: 'client-ui',
      type: 'bundle',
      builtIn: false,
      provenance: 'built-in',
      tools: [],
      uiSlots: [],
      profiles: [],
      source: {
        repository: 'https://github.com/owner/repo',
        directory: 'apps/plugin',
        commit: COMMIT,
      },
      install: {
        installable: true,
        command: `npx dshpub add owner/repo --ref ${COMMIT} --path apps/plugin`,
      },
      urls: {
        en: 'https://dsh.pub/en/plugins/alpha/',
        zh: 'https://dsh.pub/zh/plugins/alpha/',
      },
    });
  });

  it('withholds an install command for a built-in entry', () => {
    const index = buildPluginSearchIndex([
      sourceEntry('alpha', { builtIn: true, distribution: { installable: false } }),
    ]);
    const entry = decodePluginSearchEntry(index, index.entries[0]!);
    expect(entry.install).toEqual({ installable: false, command: null });
  });
});

describe('tokenizePluginQuery', () => {
  it('splits on whitespace and punctuation, lowercases, and dedupes', () => {
    expect(tokenizePluginQuery('  Web, Search；搜索  web ')).toEqual(['web', 'search', '搜索']);
  });

  it('caps the number of terms', () => {
    const terms = tokenizePluginQuery(Array.from({ length: 20 }, (_, i) => `t${i}`).join(' '));
    expect(terms).toHaveLength(PLUGIN_SEARCH_TERM_MAX_COUNT);
  });

  it('returns no terms for a blank query', () => {
    expect(tokenizePluginQuery('   ')).toEqual([]);
  });
});

describe('searchPluginIndex', () => {
  const index = buildPluginSearchIndex([
    sourceEntry('dsh-web-search', {
      name: 'dsh-web-search',
      description: { en: 'Adds a web search provider.', zh: '提供一个网页搜索能力。' },
      category: 'models',
      capabilities: {
        tools: [{ name: 'web_search' }],
        uiContributions: null,
        uiSlotsDeclared: null,
      },
    }),
    sourceEntry('dsh-memory', {
      name: 'dsh-memory',
      description: { en: 'Shared persistent memory.', zh: '共享持久记忆。' },
      category: 'storage',
    }),
    sourceEntry('dsh-builtin-web', {
      name: 'dsh-builtin-web',
      builtIn: true,
      distribution: { installable: false },
      description: { en: 'Built-in web provider.', zh: '内置网页能力。' },
    }),
  ]);

  it('returns every entry for an empty query', () => {
    const response = searchPluginIndex(index, {});
    expect(response.total).toBe(3);
    expect(response.returned).toBe(3);
    expect(response.hasMore).toBe(false);
  });

  it('requires every term to match', () => {
    // Both entries mention "web"; only one also mentions "search".
    expect(searchPluginIndex(index, { q: 'web' }).total).toBe(2);
    expect(searchPluginIndex(index, { q: 'web search' }).total).toBe(1);
    expect(searchPluginIndex(index, { q: 'web search memory' }).total).toBe(0);
  });

  it('matches CJK descriptions', () => {
    const response = searchPluginIndex(index, { q: '记忆' });
    expect(response.entries.map((entry) => entry.slug)).toEqual(['dsh-memory']);
  });

  it('ranks a name match above a description-only match', () => {
    const response = searchPluginIndex(index, { q: 'memory' });
    expect(response.entries[0]?.slug).toBe('dsh-memory');
  });

  it('applies exact, case-insensitive filters', () => {
    expect(searchPluginIndex(index, { category: 'MODELS' }).total).toBe(1);
    expect(searchPluginIndex(index, { type: 'plugin' }).total).toBe(3);
    expect(searchPluginIndex(index, { installable: false }).total).toBe(1);
    expect(searchPluginIndex(index, { builtIn: true }).total).toBe(1);
  });

  it('pages with offset and limit and reports hasMore', () => {
    const first = searchPluginIndex(index, { limit: 2 });
    expect(first.returned).toBe(2);
    expect(first.hasMore).toBe(true);

    const second = searchPluginIndex(index, { limit: 2, offset: 2 });
    expect(second.returned).toBe(1);
    expect(second.hasMore).toBe(false);
    expect(second.offset).toBe(2);
  });

  it('clamps the limit to the documented maximum', () => {
    expect(searchPluginIndex(index, { limit: 5_000 }).limit).toBe(PLUGIN_SEARCH_LIMIT_MAX);
    expect(searchPluginIndex(index, { limit: 0 }).limit).toBe(1);
    expect(searchPluginIndex(index, {}).limit).toBe(PLUGIN_SEARCH_LIMIT_DEFAULT);
  });

  it('reports no matches without failing', () => {
    const response = searchPluginIndex(index, { q: 'zzz-not-a-plugin' });
    expect(response.total).toBe(0);
    expect(response.entries).toEqual([]);
    expect(response.hasMore).toBe(false);
  });

  it('echoes the normalized query', () => {
    const response = searchPluginIndex(index, {
      category: ' MODELS ',
      installable: true,
      limit: 5,
      offset: 1,
      q: '  web  ',
    });
    expect(response.query).toEqual({
      q: 'web',
      category: 'models',
      type: null,
      installable: true,
      builtIn: null,
      limit: 5,
      offset: 1,
    });
  });

  it('caps an over-long query at the tokenizer level', () => {
    const long = 'a'.repeat(PLUGIN_SEARCH_QUERY_MAX_LENGTH);
    expect(() => searchPluginIndex(index, { q: long })).not.toThrow();
  });
});

describe('isPluginSearchIndex', () => {
  it('accepts a built index', () => {
    expect(isPluginSearchIndex(buildPluginSearchIndex([sourceEntry('alpha')]))).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isPluginSearchIndex(null)).toBe(false);
    expect(isPluginSearchIndex('index')).toBe(false);
    expect(isPluginSearchIndex({})).toBe(false);
    expect(isPluginSearchIndex({ entries: [], schemaVersion: 99 })).toBe(false);
  });
});
