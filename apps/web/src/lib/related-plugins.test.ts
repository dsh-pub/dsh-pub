import { describe, expect, it } from 'vitest';

import { marketplaceEntries } from './catalog.js';
import { provenanceStatus, type CatalogEntry } from './catalog-types.js';
import { copy } from './i18n.js';
import {
  RELATED_PLUGIN_LIMIT,
  relatedGuideHash,
  relatedPluginScore,
  relatedPlugins,
} from './related-plugins.js';
import { topicForEntry } from './topics.js';

const bySlug = (slug: string) => {
  const entry = marketplaceEntries.find((item) => item.slug === slug);
  expect(entry).toBeDefined();
  return entry!;
};

const isBuiltIn = (entry: CatalogEntry) => provenanceStatus(entry) === 'built-in';

const toolNames = (entry: CatalogEntry) =>
  new Set((entry.capabilities.tools ?? []).map((tool) => tool.name.toLocaleLowerCase()));

const uiSlots = (entry: CatalogEntry) =>
  new Set(
    [
      ...(entry.capabilities.uiContributions ?? []).map((item) => item.slot),
      ...(entry.capabilities.uiSlotsDeclared ?? []).map((item) => item.slot),
    ].map((slot) => slot.toLocaleLowerCase()),
  );

const sharesToolsOrSlots = (entry: CatalogEntry, candidate: CatalogEntry) => {
  const originTools = toolNames(entry);
  const originSlots = uiSlots(entry);
  return (
    [...toolNames(candidate)].some((name) => originTools.has(name)) ||
    [...uiSlots(candidate)].some((slot) => originSlots.has(slot))
  );
};

describe('related plugin ranking', () => {
  it('never includes the current record and stays within the public limit', () => {
    const sample = [
      bySlug('client-ui-trajectory'),
      bySlug('tool-bash'),
      bySlug('dsh-genui'),
      bySlug('web-app'),
    ];

    for (const entry of sample) {
      const related = relatedPlugins(entry, marketplaceEntries);
      expect(related.length).toBeGreaterThanOrEqual(Math.min(3, marketplaceEntries.length - 1));
      expect(related.length).toBeLessThanOrEqual(RELATED_PLUGIN_LIMIT);
      expect(related.some((item) => item.slug === entry.slug)).toBe(false);
      expect(new Set(related.map((item) => item.slug)).size).toBe(related.length);
    }
  });

  it('is deterministic for the same catalog snapshot', () => {
    const trajectory = bySlug('client-ui-trajectory');
    expect(relatedPlugins(trajectory, marketplaceEntries).map((item) => item.slug)).toEqual(
      relatedPlugins(trajectory, marketplaceEntries).map((item) => item.slug),
    );
  });

  it('ranks shared tools or UI slots ahead of empty-slot neighbors', () => {
    const genui = bySlug('dsh-genui');
    const atFile = bySlug('dsh-at-file');
    const related = relatedPlugins(genui, marketplaceEntries);
    expect(sharesToolsOrSlots(genui, atFile)).toBe(true);
    expect(related.map((item) => item.slug)).toContain('dsh-at-file');
    const overlapIndex = related.findIndex((item) => item.slug === 'dsh-at-file');
    const emptySlotNeighbor = related.find((item) => !sharesToolsOrSlots(genui, item));
    if (emptySlotNeighbor) {
      expect(relatedPluginScore(genui, atFile)).toBeGreaterThan(
        relatedPluginScore(genui, emptySlotNeighbor),
      );
      expect(related.findIndex((item) => item.slug === emptySlotNeighbor.slug)).toBeGreaterThan(
        overlapIndex,
      );
    }
    for (const [index, item] of related.entries()) {
      if (!sharesToolsOrSlots(genui, item)) expect(index).toBeGreaterThan(overlapIndex);
    }
  });

  it('keeps built-in detail pages inside the included distribution boundary', () => {
    for (const slug of ['web-app', 'client-ui-trajectory', 'base', 'attachment-local']) {
      const entry = bySlug(slug);
      const related = relatedPlugins(entry, marketplaceEntries);
      expect(relatedGuideHash(entry)).toBe('included');
      expect(related.every((item) => item.distribution.installable === false)).toBe(true);
      expect(related.every((item) => isBuiltIn(item))).toBe(true);
      expect(related.every((item) => item.slug !== entry.slug)).toBe(true);
    }
  });

  it('keeps installable community details inside the installable boundary', () => {
    const genui = bySlug('dsh-genui');
    const related = relatedPlugins(genui, marketplaceEntries);
    expect(relatedGuideHash(genui)).toBe('installable');
    expect(related.every((item) => item.distribution.installable)).toBe(true);
    expect(related.every((item) => !isBuiltIn(item))).toBe(true);
  });

  it('prefers overlapping built-in UI records over other capabilities', () => {
    const trajectory = bySlug('client-ui-trajectory');
    const related = relatedPlugins(trajectory, marketplaceEntries);
    expect(related.every((item) => topicForEntry(item).id === 'ui-client')).toBe(true);
    expect(related.map((item) => item.slug)).toContain('client-ui-conversation');
    expect(related.every((item) => !item.distribution.installable)).toBe(true);
  });

  it('prefers other included model-tool records for a built-in tool plugin', () => {
    const bash = bySlug('tool-bash');
    const related = relatedPlugins(bash, marketplaceEntries);
    expect(related.every((item) => topicForEntry(item).id === 'model-tools')).toBe(true);
    expect(related.every((item) => item.distribution.installable === false)).toBe(true);
    expect(relatedPluginScore(bash, related[0]!)).toBeGreaterThan(0);
  });

  it('does not treat the Harness monorepo as a community source sibling', () => {
    const trajectory = bySlug('client-ui-trajectory');
    const bash = bySlug('tool-bash');
    expect(relatedPluginScore(trajectory, bash)).toBeLessThan(
      relatedPluginScore(trajectory, bySlug('client-ui-conversation')),
    );
  });

  it('discloses overlap ranking without similarity or compatibility claims', () => {
    expect(copy.en.relatedMethod.toLocaleLowerCase()).not.toMatch(
      /\b(similar|best|compatible|download|unique users?)\b/,
    );
    expect(copy.zh.relatedMethod).not.toMatch(/相似|最佳|兼容|下载|独立用户/);
    expect(copy.en.cliInstalls).toBe('CLI-reported installs');
    expect(copy.zh.cliInstalls).toContain('CLI 上报');
  });
});
