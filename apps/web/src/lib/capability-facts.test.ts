import { describe, expect, it } from 'vitest';

import type { CatalogEntry } from './catalog-types.js';
import { confirmedCapabilities } from './capability-facts.js';

const base = {
  id: 'demo',
  slug: 'demo',
  name: 'demo',
  version: '1.0.0',
  license: 'MIT',
  type: 'plugin',
  category: 'tools',
  builtIn: false,
  description: { en: 'Demo', zh: '演示' },
  source: { repository: 'https://github.com/acme/demo', directory: '', commit: 'a'.repeat(40) },
  runtime: { hostLoadable: null, configurable: null, client: null },
  capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
  availability: { profiles: null, defaultWeb: null },
  distribution: { installable: true, mode: 'git-bundle' },
} satisfies CatalogEntry;

describe('confirmedCapabilities', () => {
  it('returns nothing when runtime facts were not inspected', () => {
    expect(confirmedCapabilities(base)).toEqual([]);
  });

  it('lists only capabilities verified as present', () => {
    expect(
      confirmedCapabilities({
        ...base,
        category: 'client-ui',
        runtime: { hostLoadable: true, configurable: false, client: { platform: 'web' } },
        capabilities: {
          tools: [],
          uiContributions: [{ slot: 'sidebar.item' }],
          uiSlotsDeclared: [],
        },
      }),
    ).toEqual(['host', 'client', 'ui']);
  });
});
