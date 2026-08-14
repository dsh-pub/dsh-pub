import { describe, expect, it } from 'vitest';

import {
  builtInEntries,
  bundleEntries,
  catalog,
  communityCatalog,
  communityEntries,
  featuredEntries,
  installableEntries,
  marketplaceEntries,
} from './catalog.js';
import {
  installCommand,
  installMetricSlug,
  localized,
  provenanceStatus,
  seoDescription,
  sourceUrl,
} from './catalog-types.js';
import { copy } from './i18n.js';
import { entriesForTopic, registryTopics, topicForEntry } from './topics.js';

describe('web catalog projection', () => {
  it('names the registry around the primary bilingual search intent', () => {
    expect(copy.en.registryPageTitle).toBe('DeepSeek Harness Plugin Registry: Browse DSH Plugins');
    expect(copy.en.registryGuideTitle).toBe('Find, install, and publish DSH plugins');
    expect(copy.zh.registryPageTitle).toContain('DeepSeek Harness 插件目录');
    expect(copy.zh.registryGuideTitle).toBe('查找、安装和发布 DSH 插件');
  });

  it('maps every catalog record into one stable, indexable topic hub', () => {
    const assignments = registryTopics.flatMap((topic) =>
      entriesForTopic(marketplaceEntries, topic).map((entry) => `${entry.slug}:${topic.id}`),
    );
    expect(assignments).toHaveLength(marketplaceEntries.length);
    expect(new Set(assignments.map((assignment) => assignment.split(':')[0])).size).toBe(
      marketplaceEntries.length,
    );
    expect(marketplaceEntries.every((entry) => topicForEntry(entry).id.length > 0)).toBe(true);
  });

  it('keeps source-backed totals and install boundaries visible', () => {
    expect(catalog.totals).toMatchObject({
      packages: 219,
      plugins: 170,
      seams: 15,
      libraries: 34,
      bundles: 3,
    });
    expect(installableEntries).toHaveLength(communityEntries.length);
    expect(bundleEntries).toHaveLength(3);
    expect(builtInEntries.length).toBe(170);
    expect(bundleEntries.every((entry) => entry.distribution.activation === 'profile-layer')).toBe(
      true,
    );
  });

  it('merges pinned community entries without changing official totals', () => {
    expect(communityEntries).toHaveLength(communityCatalog.totals.installable);
    expect(
      communityEntries.every((entry) => provenanceStatus(entry).startsWith('community-')),
    ).toBe(true);
    expect(communityEntries.every((entry) => entry.distribution.installable)).toBe(true);
    expect(new Set([...builtInEntries, ...communityEntries].map((entry) => entry.slug)).size).toBe(
      builtInEntries.length + communityEntries.length,
    );
  });

  it('builds pinned root-repository install commands without an empty path flag', () => {
    const genui = communityEntries.find((entry) => entry.slug === 'dsh-genui');
    const automation = communityEntries.find((entry) => entry.slug === 'dsh-automation');
    expect(genui).toBeDefined();
    expect(automation).toBeDefined();
    if (!genui || !automation) return;
    const command = installCommand(genui);
    expect(command).toBe(
      'npx dshpub add omdsh-dev/dsh-genui --ref 57b4338222632f8ea81c2665d44e5f9e80b52686',
    );
    expect(command).not.toContain('--path');
    expect(sourceUrl(genui)).toBe(
      'https://github.com/omdsh-dev/dsh-genui/tree/57b4338222632f8ea81c2665d44e5f9e80b52686',
    );
    expect(installCommand(automation)).toBe(
      'npx dshpub add titanwings/dsh-automation --ref 3c0188d7d94ed5b1e8caffeb73d7ac7ab34aabb3',
    );
  });

  it('provides bilingual text and pinned source links', () => {
    const entry = featuredEntries[0] ?? builtInEntries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(localized(entry.description, 'en')).not.toHaveLength(0);
    expect(localized(entry.description, 'zh')).not.toHaveLength(0);
    expect(sourceUrl(entry)).toContain(entry.source.commit);
    expect(sourceUrl(entry)).toContain(entry.source.directory);
  });

  it('adds known high-value capability coordinates without changing source truth', () => {
    const trajectory = builtInEntries.find((entry) => entry.slug === 'client-ui-trajectory');
    const bash = builtInEntries.find((entry) => entry.slug === 'tool-bash');
    expect(trajectory?.capabilities.uiContributions?.[0]?.slot).toBe('conversation.view');
    expect(bash?.capabilities.tools?.[0]?.name).toBe('bash');
  });

  it('describes detail pages as DeepSeek Harness plugins without exceeding snippet limits', () => {
    const entry = communityEntries[0] ?? builtInEntries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const english = seoDescription(entry, 'en');
    const chinese = seoDescription(entry, 'zh');
    expect(english).toContain('DeepSeek Harness (DSH)');
    expect(chinese).toContain('DeepSeek Harness 插件');
    for (const item of marketplaceEntries) {
      expect(seoDescription(item, 'en').length).toBeLessThanOrEqual(170);
      expect(seoDescription(item, 'zh').length).toBeLessThanOrEqual(100);
    }
  });

  it('keeps bundle metric slugs deterministic without claiming the built-ins are installable', () => {
    const webBundle = bundleEntries.find((entry) => entry.slug === 'web-app');
    expect(webBundle && installMetricSlug(webBundle)).toBe(
      'deepseek-ai--deepseek-harness--packages--bundle--web-app',
    );
  });
});
