import { describe, expect, it } from 'vitest';

import { GET } from '../pages/plugins.json.js';

describe('machine-readable plugin index', () => {
  it('serves a static Registry and ecosystem search document for agents', async () => {
    const response = GET();
    const body = await response.json();

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(body).toMatchObject({
      schemaVersion: 1,
      searchFields: [
        'name',
        'description',
        'category',
        'type',
        'tools',
        'uiSlots',
        'profiles',
        'source.repository',
      ],
    });
    expect(body.totals).toEqual({
      ecosystem: body.ecosystem.length,
      registry: body.registry.length,
    });

    expect(body.registry).toContainEqual(
      expect.objectContaining({
        slug: 'dsh-automation',
        name: '@dsh-external/dsh-automation',
        category: 'orchestration',
        provenance: 'community-reviewed',
        source: {
          commit: '3c0188d7d94ed5b1e8caffeb73d7ac7ab34aabb3',
          directory: '',
          repository: 'https://github.com/titanwings/dsh-automation',
        },
        install: {
          command:
            'npx dshpub add titanwings/dsh-automation --ref 3c0188d7d94ed5b1e8caffeb73d7ac7ab34aabb3',
          installable: true,
        },
        urls: {
          en: 'https://dsh.pub/en/plugins/dsh-automation/',
          zh: 'https://dsh.pub/zh/plugins/dsh-automation/',
        },
      }),
    );
    expect(body.registry).toContainEqual(
      expect.objectContaining({
        slug: 'tool-bash',
        provenance: 'built-in',
        install: { command: null, installable: false },
      }),
    );
    expect(body.ecosystem).toContainEqual(
      expect.objectContaining({
        name: 'deepseek-harness',
        discoveryOnly: true,
        sourceRepository: 'https://github.com/deepseek-ai/deepseek-harness',
      }),
    );
  });
});
