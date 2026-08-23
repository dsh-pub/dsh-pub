import { describe, expect, it } from 'vitest';

import {
  browsableEntries,
  browseTile,
  browseTotals,
  browseUseCases,
  communityHighlights,
  hasWrittenDescription,
  initialTileCount,
  starsFor,
} from './browse.js';
import { communityEntries, marketplaceEntries } from './catalog.js';

describe('home page browse projection', () => {
  it('drops the records whose description is the auto-discovery template', () => {
    expect(browseTotals.withoutDescription).toBeGreaterThan(0);
    expect(browsableEntries.length + browseTotals.withoutDescription).toBe(
      marketplaceEntries.length,
    );
    expect(browsableEntries.every(hasWrittenDescription)).toBe(true);
    expect(
      browsableEntries.every((entry) => !/automatically discovered/i.test(entry.description.en)),
    ).toBe(true);
  });

  it('keeps every browsable record exactly once', () => {
    expect(new Set(browsableEntries.map((entry) => entry.slug)).size).toBe(browsableEntries.length);
  });

  it('opens the wall on community plugins rather than built-in Harness seams', () => {
    const lead = browsableEntries.slice(0, initialTileCount);
    expect(lead.every((entry) => !entry.builtIn)).toBe(true);
    expect(browsableEntries.at(-1)?.builtIn).toBe(true);
  });

  it('ranks highlights by stars and never lets the monorepo star count in', () => {
    expect(communityHighlights.length).toBeGreaterThanOrEqual(6);
    const stars = communityHighlights.map(starsFor);
    expect([...stars].sort((left, right) => right - left)).toEqual(stars);
    expect(stars.every((count) => count > 0)).toBe(true);
    // Built-in modules all resolve to deepseek-ai/deepseek-harness and its 35k stars.
    expect(communityHighlights.every((entry) => !entry.builtIn)).toBe(true);
    expect(communityHighlights.every((entry) => communityEntries.includes(entry))).toBe(true);
  });

  it('counts use cases over exactly the browsable set', () => {
    expect(browseUseCases.reduce((total, { count }) => total + count, 0)).toBe(
      browsableEntries.length,
    );
  });

  it('trims tile summaries to what two clamped lines can show', () => {
    const tiles = browsableEntries.map((entry) => browseTile(entry, 'zh'));
    expect(tiles.every((tile) => tile.description.length <= 120)).toBe(true);
    expect(tiles.every((tile) => tile.name.length > 0)).toBe(true);
    expect(tiles.some((tile) => tile.description.endsWith('…'))).toBe(true);
  });
});
