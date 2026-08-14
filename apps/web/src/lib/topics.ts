import {
  registryTopicIds,
  registryTopics,
  topicForCategory,
  type RegistryTopic,
  type RegistryTopicId,
} from '@dsh-pub/catalog/topics';

import type { CatalogEntry } from './catalog-types.js';
import type { Locale } from './i18n.js';

export { registryTopicIds, registryTopics, type RegistryTopic, type RegistryTopicId };

export function localizedTopic(value: { en: string; zh: string }, locale: Locale): string {
  return value[locale];
}

export function topicForEntry(entry: CatalogEntry): RegistryTopic {
  return topicForCategory(entry.category);
}

export function entriesForTopic(
  entries: readonly CatalogEntry[],
  topic: RegistryTopic,
): CatalogEntry[] {
  return entries.filter((entry) => topic.sourceCategories.includes(entry.category));
}
