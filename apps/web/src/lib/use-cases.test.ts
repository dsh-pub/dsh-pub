import { describe, expect, it } from 'vitest';

import { marketplaceEntries } from './catalog.js';
import { useCaseCounts, useCaseFor, useCaseIds, useCaseLabel } from './use-cases.js';

const bySlug = new Map(marketplaceEntries.map((entry) => [entry.slug, entry]));

function useCaseOfSlug(slug: string) {
  const entry = bySlug.get(slug);
  expect(entry, `missing catalog entry: ${slug}`).toBeDefined();
  return entry ? useCaseFor(entry) : undefined;
}

describe('use-case classification', () => {
  it('assigns every catalog record exactly one known use case', () => {
    const assigned = marketplaceEntries.map((entry) => useCaseFor(entry));
    expect(assigned).toHaveLength(marketplaceEntries.length);
    expect(assigned.every((id) => useCaseIds.includes(id))).toBe(true);
  });

  it('reads package names as whole tokens so a substring cannot pick the bucket', () => {
    // `bot` inside `bottom`, `store` inside `plugin-store`, and `browser` inside
    // `plugin-browser` each used to hijack the classification.
    expect(useCaseOfSlug('dsh-bottom-stats')).toBe('usage-cost');
    expect(useCaseOfSlug('dsh-plugin-store')).toBe('runtime-core');
    expect(useCaseOfSlug('dsh-plugin-browser')).toBe('runtime-core');
  });

  it('routes representative community plugins to the use case a reader would expect', () => {
    expect(useCaseOfSlug('dsh-open-in-vscode')).toBe('dev-code');
    expect(useCaseOfSlug('dsh-cc-tui')).toBe('dev-code');
    expect(useCaseOfSlug('dsh-skin')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-minigames')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-notification')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-at-file')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-vision')).toBe('vision-media');
    expect(useCaseOfSlug('dsh-tavily-search')).toBe('browser-web');
    expect(useCaseOfSlug('dsh-feishu')).toBe('integrations');
    expect(useCaseOfSlug('dsh-wallet')).toBe('usage-cost');
    expect(useCaseOfSlug('dsh-task-memory')).toBe('memory-context');
    expect(useCaseOfSlug('dsh-mcp-manager')).toBe('agent-tools');
    expect(useCaseOfSlug('dsh-automation')).toBe('automation');
  });

  it('reads the phrasings this ecosystem repeats instead of giving up on them', () => {
    // Domain toolkits, Web UI surfaces, and plugin-management plugins are the three
    // shapes that dominated the unclassified tail.
    expect(useCaseOfSlug('dsh-pdf')).toBe('agent-tools');
    expect(useCaseOfSlug('dsh-plugin-finance-data')).toBe('agent-tools');
    expect(useCaseOfSlug('dsh-eyecare')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-custom-wallpaper')).toBe('ui-surface');
    expect(useCaseOfSlug('dsh-auto-collapse')).toBe('ui-surface');
    expect(useCaseOfSlug('dshp')).toBe('runtime-core');
    expect(useCaseOfSlug('dsh-nanobananapro')).toBe('vision-media');
    expect(useCaseOfSlug('dsh-read-url')).toBe('browser-web');
    expect(useCaseOfSlug('dsh-batch-regression')).toBe('automation');
  });

  it('leaves the unclassified tail small enough to be an honest bucket', () => {
    // Descriptions that stay vague belong in `other`; a classifier that guesses
    // instead would put a confidently wrong label on the home page.
    const described = marketplaceEntries.filter(
      (entry) =>
        !/is an automatically discovered DeepSeek Harness plugin bundle\.?$/iu.test(
          entry.description.en.trim(),
        ),
    );
    const other = described.filter((entry) => useCaseFor(entry) === 'other');
    expect(other.length / described.length).toBeLessThan(0.15);
  });

  it('exposes bilingual labels for every use case', () => {
    for (const id of useCaseIds) {
      expect(useCaseLabel(id, 'en')).not.toHaveLength(0);
      expect(useCaseLabel(id, 'zh')).not.toHaveLength(0);
    }
  });

  it('counts use cases in descending order without inventing empty buckets', () => {
    const counts = useCaseCounts(marketplaceEntries);
    expect(counts.every(({ count }) => count > 0)).toBe(true);
    expect(counts.reduce((total, { count }) => total + count, 0)).toBe(marketplaceEntries.length);
    const values = counts.map(({ count }) => count);
    expect([...values].sort((left, right) => right - left)).toEqual(values);
  });
});
