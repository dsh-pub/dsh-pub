import { confirmedCapabilities } from './capability-facts.js';
import type { CatalogEntry } from './catalog-types.js';
import { topicForEntry } from './topics.js';
import { useCaseFor } from './use-cases.js';

export const RELATED_PLUGIN_LIMIT = 6;
const RELATED_POOL_LIMIT = 48;

interface RelatedFeatures {
  builtIn: boolean;
  capabilities: Set<string>;
  category: string;
  client: boolean | null;
  directory: string;
  entry: CatalogEntry;
  installable: boolean;
  slots: Set<string>;
  slug: string;
  source: string;
  tools: Set<string>;
  topicId: string;
  type: CatalogEntry['type'];
  useCase: string;
}

interface RelatedIndex {
  byCategory: Map<string, CatalogEntry[]>;
  bySource: Map<string, CatalogEntry[]>;
  byTopic: Map<string, CatalogEntry[]>;
}

const relatedIndexCache = new WeakMap<readonly CatalogEntry[], RelatedIndex>();

const isBuiltIn = (entry: CatalogEntry) =>
  (entry.provenance?.status ?? (entry.builtIn ? 'built-in' : undefined)) === 'built-in';

const sourceKey = (entry: CatalogEntry) => entry.source.repository.replace(/\.git$/i, '');

const valueSet = (values: readonly string[]) =>
  new Set(values.map((value) => value.toLocaleLowerCase()));

const intersectionSize = (left: Set<string>, right: Set<string>) => {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
};

const toolNames = (entry: CatalogEntry) =>
  valueSet((entry.capabilities.tools ?? []).map((tool) => tool.name));

const uiSlots = (entry: CatalogEntry) =>
  valueSet([
    ...(entry.capabilities.uiContributions ?? []).map((item) => item.slot),
    ...(entry.capabilities.uiSlotsDeclared ?? []).map((item) => item.slot),
  ]);

const featuresFor = (entry: CatalogEntry): RelatedFeatures => ({
  builtIn: isBuiltIn(entry),
  capabilities: new Set(confirmedCapabilities(entry)),
  category: entry.category,
  client: entry.runtime.client === null ? null : Boolean(entry.runtime.client),
  directory: entry.source.directory,
  entry,
  installable: entry.distribution.installable,
  slots: uiSlots(entry),
  slug: entry.slug,
  source: sourceKey(entry),
  tools: toolNames(entry),
  topicId: topicForEntry(entry).id,
  type: entry.type,
  useCase: useCaseFor(entry),
});

const pushIndexed = (index: Map<string, CatalogEntry[]>, key: string, entry: CatalogEntry) => {
  const bucket = index.get(key);
  if (bucket) bucket.push(entry);
  else index.set(key, [entry]);
};

const indexCatalog = (catalog: readonly CatalogEntry[]): RelatedIndex => {
  const cached = relatedIndexCache.get(catalog);
  if (cached) return cached;

  const byCategory = new Map<string, CatalogEntry[]>();
  const bySource = new Map<string, CatalogEntry[]>();
  const byTopic = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    pushIndexed(byCategory, entry.category, entry);
    pushIndexed(byTopic, topicForEntry(entry).id, entry);
    if (!isBuiltIn(entry)) pushIndexed(bySource, sourceKey(entry), entry);
  }

  const created = { byCategory, bySource, byTopic };
  relatedIndexCache.set(catalog, created);
  return created;
};

const slugNeighbors = (peers: readonly CatalogEntry[], slug: string, count: number) => {
  const sorted = peers
    .filter((entry) => entry.slug !== slug)
    .sort((left, right) => left.slug.localeCompare(right.slug));
  if (sorted.length <= count) return sorted;
  const index = sorted.findIndex((entry) => entry.slug > slug);
  const at = index === -1 ? sorted.length : index;
  const start = Math.max(0, Math.min(at - Math.floor(count / 2), sorted.length - count));
  return sorted.slice(start, start + count);
};

const takeUnique = (
  selected: CatalogEntry[],
  seen: Set<string>,
  candidates: readonly CatalogEntry[],
  limit: number,
) => {
  for (const candidate of candidates) {
    if (selected.length >= limit || seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    selected.push(candidate);
  }
};

const relatedPool = (entry: CatalogEntry, catalog: readonly CatalogEntry[]): CatalogEntry[] => {
  const index = indexCatalog(catalog);
  const originTools = toolNames(entry);
  const originSlots = uiSlots(entry);
  const categoryPeers = index.byCategory.get(entry.category) ?? [];
  const topicPeers = index.byTopic.get(topicForEntry(entry).id) ?? [];
  const siblings = (index.bySource.get(sourceKey(entry)) ?? []).filter(
    (candidate) =>
      candidate.slug !== entry.slug && candidate.source.directory !== entry.source.directory,
  );
  const overlapping =
    originTools.size === 0 && originSlots.size === 0
      ? []
      : categoryPeers.filter((candidate) => {
          if (candidate.slug === entry.slug) return false;
          return (
            intersectionSize(originTools, toolNames(candidate)) > 0 ||
            intersectionSize(originSlots, uiSlots(candidate)) > 0
          );
        });
  const sameAvailability = categoryPeers.filter(
    (candidate) =>
      candidate.slug !== entry.slug &&
      candidate.distribution.installable === entry.distribution.installable,
  );

  const selected: CatalogEntry[] = [];
  const seen = new Set<string>([entry.slug]);
  takeUnique(selected, seen, siblings, RELATED_POOL_LIMIT);
  takeUnique(selected, seen, overlapping, RELATED_POOL_LIMIT);
  takeUnique(selected, seen, sameAvailability, RELATED_POOL_LIMIT);
  takeUnique(selected, seen, slugNeighbors(categoryPeers, entry.slug, 16), RELATED_POOL_LIMIT);
  takeUnique(selected, seen, slugNeighbors(topicPeers, entry.slug, 16), RELATED_POOL_LIMIT);
  return selected;
};

const scoreFeatures = (entry: RelatedFeatures, candidate: RelatedFeatures): number => {
  if (entry.slug === candidate.slug) return 0;

  let score = 0;
  if (
    !entry.builtIn &&
    !candidate.builtIn &&
    entry.source === candidate.source &&
    entry.directory !== candidate.directory
  ) {
    score += 8;
  }

  if (entry.category === candidate.category) score += 4;
  else if (entry.topicId === candidate.topicId) score += 2;

  if (entry.installable === candidate.installable) score += 1;
  if (entry.type === candidate.type) score += 1;
  if (entry.useCase !== 'other' && entry.useCase === candidate.useCase) score += 2;

  score += intersectionSize(entry.capabilities, candidate.capabilities);
  score += intersectionSize(entry.tools, candidate.tools) * 2;
  score += intersectionSize(entry.slots, candidate.slots) * 2;

  if (entry.client !== null && candidate.client !== null && entry.client === candidate.client) {
    score += 1;
  }

  return score;
};

export function relatedPluginScore(entry: CatalogEntry, candidate: CatalogEntry): number {
  return scoreFeatures(featuresFor(entry), featuresFor(candidate));
}

export function relatedPlugins(
  entry: CatalogEntry,
  catalog: readonly CatalogEntry[],
  limit = RELATED_PLUGIN_LIMIT,
): CatalogEntry[] {
  const origin = featuresFor(entry);
  const ranked = relatedPool(entry, catalog)
    .map((candidate) => ({ candidate, score: scoreFeatures(origin, featuresFor(candidate)) }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.candidate.slug.localeCompare(right.candidate.slug);
    });

  const selected: CatalogEntry[] = [];
  const seen = new Set<string>();
  const take = (candidate: CatalogEntry) => {
    if (selected.length >= limit || seen.has(candidate.slug)) return;
    seen.add(candidate.slug);
    selected.push(candidate);
  };

  for (const { candidate, score } of ranked) {
    if (score > 0) take(candidate);
  }
  if (selected.length < 3) {
    for (const { candidate } of ranked) take(candidate);
  }
  return selected;
}

export function relatedGuideHash(entry: CatalogEntry): 'installable' | 'included' {
  return entry.distribution.installable ? 'installable' : 'included';
}
