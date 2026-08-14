import { allCatalogEntries } from './index.js';
import { registryTopicIds, topicIdForCategory } from './topics.js';

describe('registry topics', () => {
  it('maps every public plugin and bundle to one capability topic', () => {
    const publicEntries = allCatalogEntries.filter(
      (entry) => entry.type === 'plugin' || entry.type === 'bundle',
    );

    expect(publicEntries.length).toBeGreaterThan(700);
    for (const entry of publicEntries) {
      expect(topicIdForCategory(entry.category), entry.name).toBeTruthy();
    }
  });

  it('keeps the capability bus to eight stable topics', () => {
    expect(registryTopicIds).toEqual([
      'ui-client',
      'model-tools',
      'models',
      'storage',
      'workflow',
      'sessions',
      'runtime',
      'other',
    ]);
  });
});
