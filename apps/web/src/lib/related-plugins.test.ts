import { describe, expect, it } from 'vitest';

import { marketplaceEntries } from './catalog.js';
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

describe('related plugin ranking', () => {
  it('never includes the current record and stays within the public limit', () => {
    const sample = [
      ...new Set([
        'client-ui-trajectory',
        'tool-bash',
        'dsh-genui',
        'web-app',
        ...marketplaceEntries.filter((_, index) => index % 800 === 0).map((entry) => entry.slug),
      ]),
    ]
      .map((slug) => marketplaceEntries.find((entry) => entry.slug === slug))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    expect(sample.length).toBeGreaterThan(3);
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

  it('keeps UI detail pages inside the UI topic before mixing in other capabilities', () => {
    const trajectory = bySlug('client-ui-trajectory');
    const related = relatedPlugins(trajectory, marketplaceEntries);
    expect(related.length).toBe(RELATED_PLUGIN_LIMIT);
    expect(related.every((item) => topicForEntry(item).id === 'ui-client')).toBe(true);
    expect(related.map((item) => item.slug)).toContain('client-ui-conversation');
  });

  it('prefers other model-tool records for a built-in tool plugin', () => {
    const bash = bySlug('tool-bash');
    const related = relatedPlugins(bash, marketplaceEntries);
    expect(related.every((item) => topicForEntry(item).id === 'model-tools')).toBe(true);
    expect(relatedPluginScore(bash, related[0]!)).toBeGreaterThan(0);
  });

  it('points installable community UI plugins at other client-ui records', () => {
    const genui = bySlug('dsh-genui');
    const related = relatedPlugins(genui, marketplaceEntries);
    expect(relatedGuideHash(genui)).toBe('installable');
    expect(related.every((item) => topicForEntry(item).id === 'ui-client')).toBe(true);
    expect(related.some((item) => item.distribution.installable)).toBe(true);
    expect(related.some((item) => item.slug.startsWith('dsh-g'))).toBe(true);
    expect(related.every((item) => !item.slug.startsWith('1010'))).toBe(true);
  });

  it('labels built-in profile layers as included rather than installable', () => {
    const webApp = bySlug('web-app');
    expect(relatedGuideHash(webApp)).toBe('included');
    expect(relatedPlugins(webApp, marketplaceEntries).length).toBeGreaterThanOrEqual(3);
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
