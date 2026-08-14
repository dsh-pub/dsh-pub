import installableRegistry from './installable-slugs.generated.json' with { type: 'json' };

const CLI_REPORTED_METRIC = 'CLI-reported completed installs';
const MAX_BODY_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTRY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const VERSION_PATTERN = /^[\x21-\x7e]{1,128}$/;
const INSTALLABLE_SLUGS = new Set<string>(installableRegistry.slugs);

export interface D1ResultLike<Row = Record<string, unknown>> {
  meta: { changes: number };
  results: Row[];
  success: true;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
}

export interface D1DatabaseLike {
  batch<Row = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<Row>[]>;
  prepare(query: string): D1PreparedStatementLike;
}

interface FetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerBindings {
  ASSETS: FetcherLike;
  DB: D1DatabaseLike;
}

interface InstallEventRow {
  completion_id: string | null;
  event_id: string;
  slug: string;
  status: 'pending' | 'completed';
  version: string;
}

interface PluginStatsRow {
  completed_total: number;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
};

const isAllowedOrigin = (origin: string) =>
  origin === 'https://dsh.pub' || /^https?:\/\/localhost(?::\d+)?$/.test(origin);

const preferredLocale = (acceptLanguage: string | null) => {
  const supported = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [language = '', quality = ''] = part.trim().toLowerCase().split(';');
      const locale = language === 'zh' || language.startsWith('zh-') ? 'zh' : 'en';
      const parsedQuality = /^q=([01](?:\.\d+)?)$/.exec(quality.trim())?.[1];
      return { index, locale, quality: parsedQuality ? Number(parsedQuality) : 1 };
    })
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  return supported[0]?.locale ?? 'en';
};

const corsHeaders = (origin: string | null) => {
  const headers = new Headers({ Vary: 'Origin' });
  if (origin && isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return headers;
};

const json = (body: unknown, status = 200, origin: string | null = null) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return Response.json(body, { headers, status });
};

const readJson = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }

  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new ApiError(400, 'invalid_json', 'A JSON request body is required.');
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
};

const validateEventId = (value: unknown) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, 'invalid_event_id', 'eventId must be a UUID.');
  }
  return value.toLowerCase();
};

const validateSlug = (value: unknown) => {
  if (typeof value !== 'string' || !REGISTRY_SLUG_PATTERN.test(value)) {
    throw new ApiError(400, 'invalid_slug', 'slug must be a public registry install-unit slug.');
  }
  return value;
};

const validateInstallableSlug = (value: unknown) => {
  const slug = validateSlug(value);
  if (!INSTALLABLE_SLUGS.has(slug)) {
    throw new ApiError(404, 'plugin_not_found', 'No installable registry entry exists for slug.');
  }
  return slug;
};

const validateVersion = (value: unknown) => {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    throw new ApiError(
      400,
      'invalid_version',
      'version must be a non-empty public ref or version.',
    );
  }
  return value;
};

const createInstallIntent = async (request: Request, db: D1DatabaseLike, origin: string | null) => {
  const body = await readJson(request);
  if (!isRecord(body) || !hasOnlyKeys(body, ['eventId', 'slug', 'version'])) {
    throw new ApiError(400, 'invalid_body', 'Expected only eventId, slug, and version.');
  }

  const eventId = validateEventId(body.eventId);
  const slug = validateInstallableSlug(body.slug);
  const version = validateVersion(body.version);
  const results = await db.batch<InstallEventRow>([
    db
      .prepare(
        `INSERT INTO install_events (event_id, slug, version, status)
         VALUES (?1, ?2, ?3, 'pending')
         ON CONFLICT(event_id) DO NOTHING`,
      )
      .bind(eventId, slug, version),
    db
      .prepare(
        `SELECT event_id, slug, version, status, completion_id
         FROM install_events WHERE event_id = ?1`,
      )
      .bind(eventId),
  ]);
  const event = results[1]?.results[0];
  if (!event) throw new ApiError(500, 'storage_error', 'Install intent was not stored.');
  if (event.slug !== slug || event.version !== version) {
    throw new ApiError(
      409,
      'event_conflict',
      'eventId is already associated with another install.',
    );
  }

  const created = (results[0]?.meta.changes ?? 0) === 1;
  return json({ eventId, status: event.status }, created ? 201 : 200, origin);
};

const completeInstall = async (request: Request, db: D1DatabaseLike, origin: string | null) => {
  const body = await readJson(request);
  if (!isRecord(body) || !hasOnlyKeys(body, ['eventId'])) {
    throw new ApiError(400, 'invalid_body', 'Expected only eventId.');
  }

  const eventId = validateEventId(body.eventId);
  const completionId = crypto.randomUUID();
  const results = await db.batch<InstallEventRow>([
    db
      .prepare(
        `UPDATE install_events
         SET status = 'completed', completion_id = ?1, completed_at = unixepoch()
         WHERE event_id = ?2 AND status = 'pending'`,
      )
      .bind(completionId, eventId),
    db
      .prepare(
        `INSERT INTO plugin_stats (slug, completed_total, updated_at)
         SELECT slug, 1, unixepoch() FROM install_events
         WHERE event_id = ?1 AND completion_id = ?2
         ON CONFLICT(slug) DO UPDATE SET
           completed_total = completed_total + 1,
           updated_at = unixepoch()`,
      )
      .bind(eventId, completionId),
    db
      .prepare(
        `SELECT event_id, slug, version, status, completion_id
         FROM install_events WHERE event_id = ?1`,
      )
      .bind(eventId),
  ]);
  const event = results[2]?.results[0];
  if (!event) throw new ApiError(404, 'intent_not_found', 'No install intent exists for eventId.');

  return json(
    {
      counted: event.completion_id === completionId,
      eventId,
      metric: CLI_REPORTED_METRIC,
      status: event.status,
    },
    200,
    origin,
  );
};

const getStats = async (slugValue: string, db: D1DatabaseLike, origin: string | null) => {
  const slug = validateInstallableSlug(decodeURIComponent(slugValue));
  const row = await db
    .prepare('SELECT completed_total FROM plugin_stats WHERE slug = ?1')
    .bind(slug)
    .first<PluginStatsRow>();
  return json({ metric: CLI_REPORTED_METRIC, slug, total: row?.completed_total ?? 0 }, 200, origin);
};

export const handleRequest = async (request: Request, env: WorkerBindings): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    const locale = preferredLocale(request.headers.get('Accept-Language'));
    return Response.redirect(new URL(`/${locale}/`, url), 302);
  }

  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin)) {
    return json({ error: 'origin_not_allowed', message: 'Origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin), status: 204 });
  }

  try {
    if (request.method === 'POST' && url.pathname === '/api/install-intents') {
      return await createInstallIntent(request, env.DB, origin);
    }
    if (request.method === 'POST' && url.pathname === '/api/install-completions') {
      return await completeInstall(request, env.DB, origin);
    }
    const statsMatch = /^\/api\/plugins\/([^/]+)\/stats$/.exec(url.pathname);
    if (request.method === 'GET' && statsMatch?.[1]) {
      return await getStats(statsMatch[1], env.DB, origin);
    }
    return json({ error: 'not_found', message: 'API route not found.' }, 404, origin);
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.code, message: error.message }, error.status, origin);
    }
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        message: 'install telemetry request failed',
        path: url.pathname,
      }),
    );
    return json({ error: 'internal_error', message: 'Internal server error.' }, 500, origin);
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
