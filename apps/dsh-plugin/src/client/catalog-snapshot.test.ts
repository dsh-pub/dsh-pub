import snapshot from './catalog.generated.json';
import { marketplaceEntries } from '../../../web/src/lib/catalog.js';

import { directoryTopicIds, type DirectoryEntry } from './catalog-query.js';

describe('bundled directory snapshot', () => {
  const entries = snapshot.entries as DirectoryEntry[];

  it('contains exactly the website public plugin and bundle surface', () => {
    expect(entries).toHaveLength(marketplaceEntries.length);
    expect(entries.map((entry) => entry.slug).sort()).toEqual(
      marketplaceEntries.map((entry) => entry.slug).sort(),
    );
  });

  it('keeps pinned source and bilingual copy for every entry', () => {
    for (const entry of entries) {
      expect(entry.description.en).toBeTruthy();
      expect(entry.description.zh).toBeTruthy();
      expect(entry.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(directoryTopicIds).toContain(entry.topic);
      expect(entry.surfaces.length).toBeGreaterThan(0);
    }
  });

  it('ships topic labels and source revision metadata with the snapshot', () => {
    expect(snapshot.topics.map((topic) => topic.id)).toEqual(directoryTopicIds);
    expect(snapshot.topics.every((topic) => topic.label.en && topic.label.zh)).toBe(true);
    expect(snapshot.sources.builtIn.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(snapshot.sources.community.generatedAt).toBeTruthy();
  });
});
