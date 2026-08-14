import { describe, expect, it } from 'vitest';

import {
  ecosystemCandidates,
  ecosystemCatalog,
  ecosystemCategories,
  ecosystemEntries,
  ecosystemSearchText,
} from './ecosystem.js';

describe('ecosystem discovery projection', () => {
  it('keeps imported records explicitly outside the trusted registry boundary', () => {
    expect(ecosystemCatalog.source.policy).toBe('discovery-only-public-ecosystem-signals');
    expect(ecosystemCatalog.source.statement.en).toContain('Indexed does not mean compatible');
    expect(ecosystemCatalog.source.statement.zh).toContain('被索引不代表兼容');
    expect(ecosystemCandidates.length).toBeLessThanOrEqual(ecosystemEntries.length);
  });

  it('ships one coherent public-index snapshot', () => {
    expect(ecosystemEntries).toHaveLength(ecosystemCatalog.totals.indexed);
    expect(ecosystemEntries.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ecosystemEntries.map((entry) => entry.id)).size).toBe(ecosystemEntries.length);
    expect(new Set(ecosystemEntries.map((entry) => entry.sourceRepository)).size).toBe(
      ecosystemEntries.length,
    );
    expect(ecosystemEntries.every((entry) => Number.isFinite(entry.stars))).toBe(true);
    expect(ecosystemEntries.every((entry) => Number.isFinite(entry.forks))).toBe(true);
    expect(ecosystemCategories.reduce((total, item) => total + item.count, 0)).toBe(
      ecosystemEntries.length,
    );
  });

  it('makes public source and capability signals searchable', () => {
    const entry = ecosystemEntries[0];
    expect(entry).toBeDefined();
    if (!entry) return;

    const searchText = ecosystemSearchText(entry);
    expect(searchText).toContain(entry.name.toLocaleLowerCase());
    expect(searchText).toContain(entry.owner.toLocaleLowerCase());
    expect(searchText).toContain(entry.category.toLocaleLowerCase());
    expect(searchText).toContain(entry.sourceRepository.toLocaleLowerCase());
  });
});
