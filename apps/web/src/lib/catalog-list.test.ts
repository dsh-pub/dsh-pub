import { describe, expect, it } from 'vitest';

import {
  catalogCard,
  catalogListItems,
  distributionMode,
  initialCatalogCount,
  modeLabel,
} from './catalog-list.js';
import { ecosystemEntries } from './ecosystem.js';

describe('catalog list', () => {
  it('leads with community records and keeps the initial page under the full list', () => {
    expect(catalogListItems.length).toBeGreaterThan(initialCatalogCount);
    const first = catalogListItems[0];
    expect(first?.origin).toBe('registry');
    if (first?.origin === 'registry') {
      expect(first.entry.builtIn).toBe(false);
    }
  });

  it('maps distribution to how-to-use modes instead of type jargon', () => {
    const installable = catalogListItems.find(
      (item): item is Extract<typeof item, { origin: 'registry' }> =>
        item.origin === 'registry' && item.entry.distribution.installable,
    );
    const included = catalogListItems.find(
      (item): item is Extract<typeof item, { origin: 'registry' }> =>
        item.origin === 'registry' &&
        !item.entry.distribution.installable &&
        item.entry.type === 'plugin',
    );
    const profile = catalogListItems.find(
      (item): item is Extract<typeof item, { origin: 'registry' }> =>
        item.origin === 'registry' &&
        !item.entry.distribution.installable &&
        item.entry.type === 'bundle',
    );

    expect(installable && distributionMode(installable.entry)).toBe('installable');
    expect(included && distributionMode(included.entry)).toBe('included');
    expect(profile && distributionMode(profile.entry)).toBe('profile');
    expect(modeLabel('installable', 'zh')).toBe('可安装');
    expect(modeLabel('installable', 'en')).toBe('Installable');
  });

  it('projects compact bilingual cards for registry and ecosystem rows', () => {
    const stars = new Map(
      ecosystemEntries.map((entry) => [entry.sourceRepository.toLocaleLowerCase(), entry.stars]),
    );
    const registry = catalogListItems.find((item) => item.origin === 'registry');
    const ecosystem = catalogListItems.find((item) => item.origin === 'ecosystem');
    expect(registry).toBeDefined();
    expect(ecosystem).toBeDefined();
    if (!registry || !ecosystem) return;

    const registryCard = catalogCard(registry, 'zh', stars);
    const ecosystemCard = catalogCard(ecosystem, 'en', stars);
    expect(registryCard.origin).toBe('registry');
    expect(registryCard.href).toContain('/zh/plugins/');
    expect(registryCard.mode).not.toBe('indexed');
    expect(ecosystemCard.origin).toBe('ecosystem');
    expect(ecosystemCard.mode).toBe('indexed');
    expect(ecosystemCard.provenance).toBe('ecosystem-indexed');
  });
});
