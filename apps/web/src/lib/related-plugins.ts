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

interface IndexedEntry {
  entry: CatalogEntry;
  installable: boolean;
  slots: Set<string>;
  tools: Set<string>;
}

interface RelatedIndex {
  byCategory: Map<string, IndexedEntry[]>;
  bySource: Map<string, IndexedEntry[]>;
  byTopic: Map<string, IndexedEntry[]>;
}

const relatedIndexCache = new WeakMap<readonly CatalogEntry[], RelatedIndex>();
const relatedFeatureCache = new WeakMap<CatalogEntry, RelatedFeatures>();

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

const featuresFor = (entry: CatalogEntry): RelatedFeatures => {
  const cached = relatedFeatureCache.get(entry);
  if (cached) return cached;
  const created: RelatedFeatures = {
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
  };
  relatedFeatureCache.set(entry, created);
  return created;
};

const pushIndexed = (index: Map<string, IndexedEntry[]>, key: string, item: IndexedEntry) => {
  const bucket = index.get(key);
  if (bucket) bucket.push(item);
  else index.set(key, [item]);
};

const indexCatalog = (catalog: readonly CatalogEntry[]): RelatedIndex => {
  const cached = relatedIndexCache.get(catalog);
  if (cached) return cached;

  const byCategory = new Map<string, IndexedEntry[]>();
  const bySource = new Map<string, IndexedEntry[]>();
  const byTopic = new Map<string, IndexedEntry[]>();
  for (const entry of catalog) {
    const item: IndexedEntry = {
      entry,
      installable: entry.distribution.installable,
      slots: uiSlots(entry),
      tools: toolNames(entry),
    };
    pushIndexed(byCategory, entry.category, item);
    pushIndexed(byTopic, topicForEntry(entry).id, item);
    if (!isBuiltIn(entry)) pushIndexed(bySource, sourceKey(entry), item);
  }

  const created = { byCategory, bySource, byTopic };
  for (const buckets of [byCategory, bySource, byTopic]) {
    for (const bucket of buckets.values()) {
      bucket.sort((left, right) => left.entry.slug.localeCompare(right.entry.slug));
    }
  }
  relatedIndexCache.set(catalog, created);
  return created;
};

const slugNeighbors = (peers: readonly IndexedEntry[], slug: string, count: number) => {
  const sorted = peers.filter((item) => item.entry.slug !== slug);
  if (sorted.length <= count) return sorted.map((item) => item.entry);
  const index = sorted.findIndex((item) => item.entry.slug > slug);
  const at = index === -1 ? sorted.length : index;
  const start = Math.max(0, Math.min(at - Math.floor(count / 2), sorted.length - count));
  return sorted.slice(start, start + count).map((item) => item.entry);
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
  const siblings = (index.bySource.get(sourceKey(entry)) ?? [])
    .map((item) => item.entry)
    .filter(
      (candidate) =>
        candidate.slug !== entry.slug && candidate.source.directory !== entry.source.directory,
    );
  const overlapping: CatalogEntry[] = [];
  if (originTools.size > 0 || originSlots.size > 0) {
    for (const item of categoryPeers) {
      if (overlapping.length >= RELATED_POOL_LIMIT) break;
      if (item.entry.slug === entry.slug) continue;
      if (
        intersectionSize(originTools, item.tools) > 0 ||
        intersectionSize(originSlots, item.slots) > 0
      ) {
        overlapping.push(item.entry);
      }
    }
  }
  const sameAvailabilityPeers = categoryPeers.filter(
    (item) => item.entry.slug !== entry.slug && item.installable === entry.distribution.installable,
  );

  const selected: CatalogEntry[] = [];
  const seen = new Set<string>([entry.slug]);
  takeUnique(selected, seen, siblings, RELATED_POOL_LIMIT);
  takeUnique(selected, seen, overlapping, RELATED_POOL_LIMIT);
  takeUnique(
    selected,
    seen,
    slugNeighbors(sameAvailabilityPeers, entry.slug, 24),
    RELATED_POOL_LIMIT,
  );
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
