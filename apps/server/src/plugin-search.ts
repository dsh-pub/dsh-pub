import {
  isPluginSearchIndex,
  PLUGIN_SEARCH_LIMIT_MAX,
  PLUGIN_SEARCH_QUERY_MAX_LENGTH,
  searchPluginIndex,
  type PluginSearchIndex,
  type PluginSearchQuery,
  type PluginSearchResponse,
} from '@dsh-pub/catalog/plugin-search';

/** Static asset the web build emits with the compact registry projection. */
export const PLUGIN_SEARCH_INDEX_PATH = '/plugins-search.json';

/** Highest accepted `offset`, keeping deep paging bounded. */
export const PLUGIN_SEARCH_OFFSET_MAX = 10_000;

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

/** Raised when a request cannot be turned into a valid query. */
export class PluginSearchQueryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PluginSearchQueryError';
  }
}

let cachedIndex: Promise<PluginSearchIndex> | undefined;

const fetchPluginSearchIndex = async (
  assets: AssetsBinding,
  request: Request,
): Promise<PluginSearchIndex> => {
  const target = new URL(PLUGIN_SEARCH_INDEX_PATH, request.url);
  const response = await assets.fetch(new Request(target));
  if (!response.ok) {
    throw new Error(`plugin search index responded with status ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isPluginSearchIndex(body)) {
    throw new Error('plugin search index has an unsupported shape');
  }
  return body;
};

/**
 * Read the registry projection, fetching it at most once per isolate. A failed
 * load is not cached, so a transient asset error cannot wedge every later
 * request in the same isolate.
 *
 * @param assets - the static-asset binding.
 * @param request - the request whose origin resolves the asset URL.
 * @returns the projection document.
 */
export const loadPluginSearchIndex = (
  assets: AssetsBinding,
  request: Request,
): Promise<PluginSearchIndex> => {
  cachedIndex ??= fetchPluginSearchIndex(assets, request).catch((error: unknown) => {
    cachedIndex = undefined;
    throw error;
  });
  return cachedIndex;
};

const readBoolean = (params: URLSearchParams, name: string): boolean | undefined => {
  const raw = params.get(name);
  if (raw === null || raw === '') return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new PluginSearchQueryError(`invalid_${name}`, `${name} must be true or false.`);
};

const readInteger = (
  params: URLSearchParams,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined => {
  const raw = params.get(name);
  if (raw === null || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new PluginSearchQueryError(`invalid_${name}`, `${name} must be an integer.`);
  }
  const value = Number(raw);
  if (value < minimum || value > maximum) {
    throw new PluginSearchQueryError(
      `invalid_${name}`,
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return value;
};

/**
 * Turn a request into a normalized query.
 *
 * @param request - the incoming request.
 * @returns the query the index is searched with.
 * @throws PluginSearchQueryError when a parameter is malformed.
 */
export const parsePluginSearchQuery = (request: Request): PluginSearchQuery => {
  const params = new URL(request.url).searchParams;
  const q = params.get('q')?.trim() ?? '';
  if (q.length > PLUGIN_SEARCH_QUERY_MAX_LENGTH) {
    throw new PluginSearchQueryError(
      'invalid_q',
      `q must be at most ${PLUGIN_SEARCH_QUERY_MAX_LENGTH} characters.`,
    );
  }
  return {
    q,
    category: params.get('category')?.trim() || undefined,
    type: params.get('type')?.trim() || undefined,
    installable: readBoolean(params, 'installable'),
    builtIn: readBoolean(params, 'builtIn'),
    limit: readInteger(params, 'limit', 1, PLUGIN_SEARCH_LIMIT_MAX),
    offset: readInteger(params, 'offset', 0, PLUGIN_SEARCH_OFFSET_MAX),
  };
};

/**
 * Run one registry search against the published projection.
 *
 * @param assets - the static-asset binding.
 * @param request - the incoming request.
 * @returns the response body the API serializes.
 * @throws PluginSearchQueryError when a parameter is malformed.
 */
export const runPluginSearch = async (
  assets: AssetsBinding,
  request: Request,
): Promise<PluginSearchResponse> => {
  const query = parsePluginSearchQuery(request);
  const index = await loadPluginSearchIndex(assets, request);
  return searchPluginIndex(index, query);
};
