import { describe, expect, it } from 'vitest';

import {
  defaultDirectoryQuery,
  queryDirectory,
  topicCounts,
  type DirectoryEntry,
} from './catalog-query.js';

const entries: DirectoryEntry[] = [
  {
    slug: 'alpha-ui',
    name: '@scope/alpha-ui',
    description: { en: 'A client input surface.', zh: '客户端输入界面。' },
    topic: 'ui-client',
    category: 'interaction',
    type: 'plugin',
    provenance: 'built-in',
    surfaces: ['client'],
    installable: false,
    capabilityCount: 2,
    repository: 'https://github.com/deepseek-ai/deepseek-harness',
    directory: 'packages/client/alpha-ui',
    commit: 'a'.repeat(40),
  },
  {
    slug: 'beta-tools',
    name: 'beta-tools',
    description: { en: 'Writes files through tools.', zh: '通过工具写入文件。' },
    topic: 'model-tools',
    category: 'tools',
    type: 'bundle',
    provenance: 'community',
    surfaces: ['host', 'client'],
    installable: true,
    capabilityCount: 7,
    repository: 'https://github.com/example/beta-tools',
    directory: '',
    commit: 'b'.repeat(40),
  },
  {
    slug: 'gamma-storage',
    name: 'Gamma Storage',
    description: { en: 'JSON persistence.', zh: 'JSON 持久化。' },
    topic: 'storage',
    category: 'storage',
    type: 'plugin',
    provenance: 'community',
    surfaces: ['host'],
    installable: true,
    capabilityCount: 1,
    repository: 'https://github.com/example/gamma-storage',
    directory: '',
    commit: 'c'.repeat(40),
  },
];

describe('directory query', () => {
  it('searches bilingual content and reports the unpaginated result count', () => {
    const result = queryDirectory(entries, {
      ...defaultDirectoryQuery,
      search: '持久化',
      pageSize: 1,
    });

    expect(result.total).toBe(1);
    expect(result.entries.map((entry) => entry.slug)).toEqual(['gamma-storage']);
    expect(result.pageCount).toBe(1);
  });

  it('combines topic, provenance, surface, distribution, and type filters', () => {
    const result = queryDirectory(entries, {
      ...defaultDirectoryQuery,
      topic: 'model-tools',
      provenance: 'community',
      surface: 'hybrid',
      distribution: 'installable',
      type: 'bundle',
    });

    expect(result.entries.map((entry) => entry.slug)).toEqual(['beta-tools']);
  });

  it('sorts deterministically by name, topic, source, and capability density', () => {
    expect(
      queryDirectory(entries, { ...defaultDirectoryQuery, sort: 'name' }).entries.map(
        (entry) => entry.slug,
      ),
    ).toEqual(['alpha-ui', 'beta-tools', 'gamma-storage']);

    expect(
      queryDirectory(entries, { ...defaultDirectoryQuery, sort: 'topic' }).entries.map(
        (entry) => entry.slug,
      ),
    ).toEqual(['alpha-ui', 'beta-tools', 'gamma-storage']);

    expect(
      queryDirectory(entries, { ...defaultDirectoryQuery, sort: 'source' }).entries.map(
        (entry) => entry.slug,
      ),
    ).toEqual(['alpha-ui', 'beta-tools', 'gamma-storage']);

    expect(
      queryDirectory(entries, { ...defaultDirectoryQuery, sort: 'capabilities' }).entries.map(
        (entry) => entry.slug,
      ),
    ).toEqual(['beta-tools', 'alpha-ui', 'gamma-storage']);
  });

  it('clamps an out-of-range page after filters change', () => {
    const result = queryDirectory(entries, {
      ...defaultDirectoryQuery,
      page: 99,
      pageSize: 2,
    });

    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.entries.map((entry) => entry.slug)).toEqual(['gamma-storage']);
  });

  it('counts every capability topic without hiding zero-count topics', () => {
    expect(topicCounts(entries)).toMatchObject({
      all: 3,
      'ui-client': 1,
      'model-tools': 1,
      storage: 1,
      workflow: 0,
      sessions: 0,
    });
  });
});
