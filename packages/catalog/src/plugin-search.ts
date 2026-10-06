/**
 * Compact, machine-facing search projection of the public registry.
 *
 * `/plugins.json` is a full dump of every registry entry. At the current catalog
 * size that document is far larger than a model-facing fetch limit can carry, so
 * the registry also publishes this compact projection together with a Worker
 * endpoint that filters it server-side. The web build writes the projection and
 * the Worker reads it; both import this module so the format has one owner.
 *
 * Entries are positional tuples against four shared dictionaries. The tuple
 * order is fixed by {@link PLUGIN_SEARCH_TUPLE_FIELDS} and may only change
 * alongside a {@link PLUGIN_SEARCH_SCHEMA_VERSION} bump.
 *
 * @module @dsh-pub/catalog/plugin-search
 */

/** Version of the projection document this module reads and writes. */
export const PLUGIN_SEARCH_SCHEMA_VERSION = 1;

/** The entry fields a query may match against, mirroring `/plugins.json`. */
export const PLUGIN_SEARCH_FIELDS = [
  'name',
  'description',
  'category',
  'type',
  'tools',
  'uiSlots',
  'profiles',
  'source.repository',
] as const;

export type PluginSearchField = (typeof PLUGIN_SEARCH_FIELDS)[number];

/** Page size applied when a request does not ask for one. */
export const PLUGIN_SEARCH_LIMIT_DEFAULT = 20;

/** Hard cap on a single page, keeping a response well inside a fetch limit. */
export const PLUGIN_SEARCH_LIMIT_MAX = 50;

/** Longest accepted `q` value. */
export const PLUGIN_SEARCH_QUERY_MAX_LENGTH = 200;

/** Most distinct terms a `q` value contributes to matching. */
export const PLUGIN_SEARCH_TERM_MAX_COUNT = 8;

/**
 * Tuple layout, in order. Kept as data so the builder, the decoder, and tests
 * cannot drift apart.
 */
export const PLUGIN_SEARCH_TUPLE_FIELDS = [
  'slug',
  'name',
  'descriptionEn',
  'descriptionZh',
  'categoryIndex',
  'typeIndex',
  'builtIn',
  'provenanceIndex',
  'tools',
  'uiSlots',
  'profileIndexes',
  'repository',
  'directory',
  'commit',
  'installable',
] as const;

export type PluginSearchTuple = [
  string,
  string,
  string,
  string,
  number,
  number,
  0 | 1,
  number,
  string[],
  string[],
  number[],
  string,
  string | null,
  string,
  0 | 1,
];

/** Repeated strings shared by every entry, stored once. */
export interface PluginSearchDictionaries {
  categories: string[];
  types: string[];
  provenances: string[];
  profiles: string[];
}

/** The projection document served as `/plugins-index.json`. */
export interface PluginSearchIndex {
  schemaVersion: typeof PLUGIN_SEARCH_SCHEMA_VERSION;
  generatedAt: string;
  searchFields: readonly PluginSearchField[];
  dictionaries: PluginSearchDictionaries;
  entries: PluginSearchTuple[];
}

/**
 * The subset of a catalog entry the projection needs. `CatalogEntry` satisfies
 * this structurally, which keeps the module free of the catalog JSON imports.
 */
export interface PluginSearchSourceEntry {
  slug: string;
  name: string;
  description: { en: string; zh: string };
  category: string;
  type: string;
  builtIn: boolean;
  provenance?: { status: string } | undefined;
  capabilities: {
    tools?: ReadonlyArray<string | { name: string }> | null | undefined;
    uiContributions?: ReadonlyArray<string | { slot: string }> | null | undefined;
    uiSlotsDeclared?: ReadonlyArray<string | { slot: string }> | null | undefined;
  };
  availability: { profiles?: readonly string[] | null | undefined };
  source: { repository: string; directory: string; commit: string };
  distribution: { installable: boolean };
}

/** One registry entry as returned by the search endpoint. */
export interface PluginSearchEntry {
  slug: string;
  name: string;
  description: { en: string; zh: string };
  category: string;
  type: string;
  builtIn: boolean;
  provenance: string;
  tools: string[];
  uiSlots: string[];
  profiles: string[];
  source: { repository: string; directory: string; commit: string };
  install: { installable: boolean; command: string | null };
  urls: { en: string; zh: string };
}

/** Normalized query accepted by {@link searchPluginIndex}. */
export interface PluginSearchQuery {
  q?: string | undefined;
  category?: string | undefined;
  type?: string | undefined;
  installable?: boolean | undefined;
  builtIn?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/** The search endpoint's response body. */
export interface PluginSearchResponse {
  schemaVersion: number;
  generatedAt: string;
  query: {
    q: string | null;
    category: string | null;
    type: string | null;
    installable: boolean | null;
    builtIn: boolean | null;
    limit: number;
    offset: number;
  };
  total: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  entries: PluginSearchEntry[];
}

/** The `owner/repository` coordinate an install command uses. */
export const pluginRepositoryCoordinate = (repository: string): string =>
  new URL(repository).pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '');

/** The commit-pinned install command the registry publishes for an entry. */
export const pluginInstallCommand = (
  repository: string,
  commit: string,
  directory: string | null,
): string =>
  `npx dshpub add ${repository} --ref ${commit}${directory ? ` --path ${directory}` : ''}`;

const dictionaryIndex = (dictionary: string[], value: string): number => {
  const existing = dictionary.indexOf(value);
  if (existing >= 0) return existing;
  dictionary.push(value);
  return dictionary.length - 1;
};

const toolNames = (entry: PluginSearchSourceEntry): string[] =>
  (entry.capabilities.tools ?? []).map((tool) => (typeof tool === 'string' ? tool : tool.name));

const uiSlotNames = (entry: PluginSearchSourceEntry): string[] => {
  const slots = [
    ...(entry.capabilities.uiContributions ?? []).map((item) =>
      typeof item === 'string' ? item : item.slot,
    ),
    ...(entry.capabilities.uiSlotsDeclared ?? []).map((item) =>
      typeof item === 'string' ? item : item.slot,
    ),
  ];
  return slots.filter((slot, index) => slots.indexOf(slot) === index);
};

/**
 * Project catalog entries into the compact search index.
 *
 * @param entries - registry entries in publication order.
 * @param generatedAt - ISO timestamp recorded on the document.
 * @returns the projection document.
 */
export function buildPluginSearchIndex(
  entries: readonly PluginSearchSourceEntry[],
  generatedAt: string = new Date().toISOString(),
): PluginSearchIndex {
  const dictionaries: PluginSearchDictionaries = {
    categories: [],
    provenances: [],
    profiles: [],
    types: [],
  };
  const tuples: PluginSearchTuple[] = entries.map((entry) => {
    const directory = entry.source.directory ? entry.source.directory : null;
    return [
      entry.slug,
      entry.name,
      entry.description.en,
      entry.description.zh,
      dictionaryIndex(dictionaries.categories, entry.category),
      dictionaryIndex(dictionaries.types, entry.type),
      entry.builtIn ? 1 : 0,
      dictionaryIndex(dictionaries.provenances, entry.provenance?.status ?? 'built-in'),
      toolNames(entry),
      uiSlotNames(entry),
      (entry.availability.profiles ?? []).map((profile) =>
        dictionaryIndex(dictionaries.profiles, profile),
      ),
      pluginRepositoryCoordinate(entry.source.repository),
      directory,
      entry.source.commit,
      entry.distribution.installable ? 1 : 0,
    ];
  });
  return {
    schemaVersion: PLUGIN_SEARCH_SCHEMA_VERSION,
    generatedAt,
    searchFields: PLUGIN_SEARCH_FIELDS,
    dictionaries,
    entries: tuples,
  };
}

const dictionaryValue = (dictionary: readonly string[], index: number): string =>
  dictionary[index] ?? '';

/**
 * Expand one tuple back into the public entry shape.
 *
 * @param index - the document the tuple belongs to.
 * @param tuple - a positional entry.
 * @returns the decoded entry, including its install command and detail URLs.
 */
export function decodePluginSearchEntry(
  index: PluginSearchIndex,
  tuple: PluginSearchTuple,
): PluginSearchEntry {
  const [
    slug,
    name,
    descriptionEn,
    descriptionZh,
    categoryIndex,
    typeIndex,
    builtIn,
    provenanceIndex,
    tools,
    uiSlots,
    profileIndexes,
    repository,
    directory,
    commit,
    installable,
  ] = tuple;
  const installableFlag = installable === 1;
  return {
    slug,
    name,
    description: { en: descriptionEn, zh: descriptionZh },
    category: dictionaryValue(index.dictionaries.categories, categoryIndex),
    type: dictionaryValue(index.dictionaries.types, typeIndex),
    builtIn: builtIn === 1,
    provenance: dictionaryValue(index.dictionaries.provenances, provenanceIndex),
    tools,
    uiSlots,
    profiles: profileIndexes
      .map((profileIndex) => dictionaryValue(index.dictionaries.profiles, profileIndex))
      .filter(Boolean),
    source: {
      repository: `https://github.com/${repository}`,
      directory: directory ?? '',
      commit,
    },
    install: {
      installable: installableFlag,
      command: installableFlag ? pluginInstallCommand(repository, commit, directory) : null,
    },
    urls: {
      en: `https://dsh.pub/en/plugins/${slug}/`,
      zh: `https://dsh.pub/zh/plugins/${slug}/`,
    },
  };
}

/**
 * Split a query into the terms every match must satisfy. Terms are lowercased
 * and separated on whitespace and common punctuation, so both Latin and CJK
 * phrasing behave predictably.
 */
export function tokenizePluginQuery(query: string): string[] {
  const terms: string[] = [];
  for (const raw of query.toLocaleLowerCase().split(/[\s,，、;；/|]+/u)) {
    const term = raw.trim();
    if (!term || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length >= PLUGIN_SEARCH_TERM_MAX_COUNT) break;
  }
  return terms;
}

interface DecodedMatch {
  entry: PluginSearchEntry;
  score: number;
}

const matchScore = (entry: PluginSearchEntry, terms: readonly string[]): number | null => {
  if (terms.length === 0) return 0;
  const repository = pluginRepositoryCoordinate(entry.source.repository).toLocaleLowerCase();
  const name = entry.name.toLocaleLowerCase();
  const slug = entry.slug.toLocaleLowerCase();
  const descriptionEn = entry.description.en.toLocaleLowerCase();
  const descriptionZh = entry.description.zh.toLocaleLowerCase();
  const category = entry.category.toLocaleLowerCase();
  const type = entry.type.toLocaleLowerCase();
  const tools = entry.tools.map((tool) => tool.toLocaleLowerCase());
  const slots = entry.uiSlots.map((slot) => slot.toLocaleLowerCase());
  const profiles = entry.profiles.map((profile) => profile.toLocaleLowerCase());

  let total = 0;
  for (const term of terms) {
    let termScore = 0;
    if (name.includes(term)) termScore += 8;
    if (slug.includes(term)) termScore += 6;
    if (descriptionEn.includes(term) || descriptionZh.includes(term)) termScore += 4;
    if (repository.includes(term)) termScore += 3;
    if (category.includes(term) || type.includes(term)) termScore += 2;
    if (tools.some((tool) => tool.includes(term))) termScore += 2;
    if (slots.some((slot) => slot.includes(term))) termScore += 1;
    if (profiles.some((profile) => profile.includes(term))) termScore += 1;
    if (termScore === 0) return null;
    total += termScore;
  }
  return total;
};

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit)) return PLUGIN_SEARCH_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(limit), 1), PLUGIN_SEARCH_LIMIT_MAX);
};

const normalizeOffset = (offset: number | undefined): number => {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  return Math.max(Math.trunc(offset), 0);
};

const matchesFilters = (entry: PluginSearchEntry, query: PluginSearchQuery): boolean => {
  if (query.category !== undefined && entry.category.toLocaleLowerCase() !== query.category) {
    return false;
  }
  if (query.type !== undefined && entry.type.toLocaleLowerCase() !== query.type) return false;
  if (query.installable !== undefined && entry.install.installable !== query.installable) {
    return false;
  }
  if (query.builtIn !== undefined && entry.builtIn !== query.builtIn) return false;
  return true;
};

/**
 * Filter, rank, and page the index for one query.
 *
 * A query matches when every term appears in at least one search field, ranked
 * by where it appeared (name over slug over description over the rest). Filters
 * are exact and case-insensitive. The ordering is deterministic: score first,
 * then name, then slug.
 *
 * @param index - the projection document.
 * @param query - normalized query; omitted fields impose no constraint.
 * @returns the response body the endpoint serializes.
 */
export function searchPluginIndex(
  index: PluginSearchIndex,
  query: PluginSearchQuery = {},
): PluginSearchResponse {
  const terms = tokenizePluginQuery(query.q ?? '');
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const category = query.category?.trim().toLocaleLowerCase() || undefined;
  const type = query.type?.trim().toLocaleLowerCase() || undefined;
  const normalized: PluginSearchQuery = { ...query, category, limit, offset, type };

  const matches: DecodedMatch[] = [];
  for (const tuple of index.entries) {
    const entry = decodePluginSearchEntry(index, tuple);
    if (!matchesFilters(entry, normalized)) continue;
    const score = matchScore(entry, terms);
    if (score === null) continue;
    matches.push({ entry, score });
  }

  matches.sort(
    (left, right) =>
      right.score - left.score ||
      left.entry.name.localeCompare(right.entry.name) ||
      left.entry.slug.localeCompare(right.entry.slug),
  );

  const page = matches.slice(offset, offset + limit).map((match) => match.entry);
  return {
    schemaVersion: PLUGIN_SEARCH_SCHEMA_VERSION,
    generatedAt: index.generatedAt,
    query: {
      q: query.q?.trim() || null,
      category: category ?? null,
      type: type ?? null,
      installable: query.installable ?? null,
      builtIn: query.builtIn ?? null,
      limit,
      offset,
    },
    total: matches.length,
    returned: page.length,
    offset,
    limit,
    hasMore: offset + page.length < matches.length,
    entries: page,
  };
}

/** Whether a value is a usable projection document. */
export function isPluginSearchIndex(value: unknown): value is PluginSearchIndex {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PluginSearchIndex>;
  return (
    candidate.schemaVersion === PLUGIN_SEARCH_SCHEMA_VERSION &&
    Array.isArray(candidate.entries) &&
    typeof candidate.dictionaries === 'object' &&
    candidate.dictionaries !== null
  );
}
