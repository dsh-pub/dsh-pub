export const directoryTopicIds = [
  'ui-client',
  'model-tools',
  'models',
  'storage',
  'workflow',
  'sessions',
  'runtime',
  'other',
] as const;

export type DirectoryTopic = (typeof directoryTopicIds)[number];
export type DirectorySurface = 'host' | 'client' | 'profile';
export type DirectoryProvenance = 'built-in' | 'community';
export type DirectoryEntryType = 'plugin' | 'bundle';
export type DirectorySort = 'name' | 'topic' | 'source' | 'capabilities';

export interface DirectoryEntry {
  slug: string;
  name: string;
  description: { en: string; zh: string };
  topic: DirectoryTopic;
  category: string;
  type: DirectoryEntryType;
  provenance: DirectoryProvenance;
  surfaces: DirectorySurface[];
  installable: boolean;
  capabilityCount: number;
  repository: string;
  directory: string;
  commit: string;
}

export interface DirectoryQuery {
  search: string;
  topic: 'all' | DirectoryTopic;
  provenance: 'all' | DirectoryProvenance;
  surface: 'all' | DirectorySurface | 'hybrid';
  distribution: 'all' | 'installable' | 'included';
  type: 'all' | DirectoryEntryType;
  sort: DirectorySort;
  page: number;
  pageSize: number;
}

export interface DirectoryResult {
  entries: DirectoryEntry[];
  total: number;
  page: number;
  pageCount: number;
}

export const defaultDirectoryQuery: DirectoryQuery = {
  search: '',
  topic: 'all',
  provenance: 'all',
  surface: 'all',
  distribution: 'all',
  type: 'all',
  sort: 'name',
  page: 1,
  pageSize: 36,
};

const topicOrder = new Map(directoryTopicIds.map((topic, index) => [topic, index]));

const byName = (left: DirectoryEntry, right: DirectoryEntry): number =>
  left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
  left.slug.localeCompare(right.slug, 'en');

function matchesSurface(entry: DirectoryEntry, surface: DirectoryQuery['surface']): boolean {
  if (surface === 'all') return true;
  if (surface === 'hybrid') {
    return entry.surfaces.includes('host') && entry.surfaces.includes('client');
  }
  return entry.surfaces.includes(surface);
}

function searchText(entry: DirectoryEntry): string {
  return [
    entry.name,
    entry.slug,
    entry.description.en,
    entry.description.zh,
    entry.topic,
    entry.category,
    entry.type,
    entry.provenance,
    ...entry.surfaces,
  ]
    .join(' ')
    .toLocaleLowerCase();
}

function compareEntries(
  sort: DirectorySort,
): (left: DirectoryEntry, right: DirectoryEntry) => number {
  if (sort === 'topic') {
    return (left, right) =>
      (topicOrder.get(left.topic) ?? Number.MAX_SAFE_INTEGER) -
        (topicOrder.get(right.topic) ?? Number.MAX_SAFE_INTEGER) || byName(left, right);
  }
  if (sort === 'source') {
    return (left, right) =>
      Number(left.provenance !== 'built-in') - Number(right.provenance !== 'built-in') ||
      byName(left, right);
  }
  if (sort === 'capabilities') {
    return (left, right) => right.capabilityCount - left.capabilityCount || byName(left, right);
  }
  return byName;
}

export function queryDirectory(
  sourceEntries: readonly DirectoryEntry[],
  query: DirectoryQuery,
): DirectoryResult {
  const needle = query.search.trim().toLocaleLowerCase();
  const filtered = sourceEntries.filter((entry) => {
    if (needle && !searchText(entry).includes(needle)) return false;
    if (query.topic !== 'all' && entry.topic !== query.topic) return false;
    if (query.provenance !== 'all' && entry.provenance !== query.provenance) return false;
    if (!matchesSurface(entry, query.surface)) return false;
    if (query.distribution === 'installable' && !entry.installable) return false;
    if (query.distribution === 'included' && entry.installable) return false;
    if (query.type !== 'all' && entry.type !== query.type) return false;
    return true;
  });

  filtered.sort(compareEntries(query.sort));

  const pageSize = Math.max(1, Math.floor(query.pageSize));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page)), pageCount);
  const start = (page - 1) * pageSize;

  return {
    entries: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageCount,
  };
}

export function topicCounts(
  entries: readonly DirectoryEntry[],
): Record<'all' | DirectoryTopic, number> {
  const counts = Object.fromEntries(directoryTopicIds.map((topic) => [topic, 0])) as Record<
    DirectoryTopic,
    number
  >;
  for (const entry of entries) counts[entry.topic] += 1;
  return { all: entries.length, ...counts };
}
