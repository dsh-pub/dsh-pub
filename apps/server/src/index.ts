import installableRegistry from './installable-slugs.generated.json' with { type: 'json' };

const CLI_REPORTED_METRIC = 'CLI-reported completed installs';
const MAX_BODY_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTRY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const VERSION_PATTERN = /^[\x21-\x7e]{1,128}$/;
const INSTALLABLE_SLUGS = new Set<string>(installableRegistry.slugs);
const BADGE_ROUTE_PATTERN =
  /^\/api\/badges\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})\.svg$/;
const BADGE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._@-]+$/;
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

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

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SubmissionWorkflowParams {
  owner: string;
  repo: string;
  repository: string;
  submissionId: string;
}

interface WorkflowInstanceLike {
  id: string;
}

interface WorkflowInstanceStatusLike extends WorkflowInstanceLike {
  status(): Promise<{ status: string }>;
}

interface SubmissionWorkflowLike {
  create(options: { id: string; params: SubmissionWorkflowParams }): Promise<WorkflowInstanceLike>;
  get(id: string): Promise<WorkflowInstanceStatusLike>;
}

export interface WorkerBindings {
  ASSETS: FetcherLike;
  DB: D1DatabaseLike;
  PLUGIN_SUBMISSION_WORKFLOW: SubmissionWorkflowLike;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
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

interface PluginSubmissionRow {
  error_code: string | null;
  error_message: string | null;
  id: string;
  owner: string;
  pull_request_number: number | null;
  pull_request_url: string | null;
  repo: string;
  repository_key: string;
  repository: string;
  status: string;
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
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  }
  return headers;
};

const json = (body: unknown, status = 200, origin: string | null = null) => {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return Response.json(body, { headers, status });
};

const metricSlugPart = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const badgeMetricSlug = (owner: string, repository: string, path: string | null) => {
  const segments = path ? path.split('/') : [];
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !BADGE_PATH_SEGMENT_PATTERN.test(segment),
    )
  ) {
    throw new ApiError(400, 'invalid_badge_path', 'Badge path must be repository-relative.');
  }
  return [owner, repository, ...segments].map(metricSlugPart).filter(Boolean).join('--');
};

const registryBadge = (
  request: Request,
  owner: string,
  repository: string,
  path: string | null,
) => {
  const listed = INSTALLABLE_SLUGS.has(badgeMetricSlug(owner, repository, path));
  const status = listed ? 'listed' : 'not listed';
  const statusWidth = listed ? 46 : 68;
  const totalWidth = 55 + statusWidth;
  const statusColor = listed ? '#25804f' : '#687386';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="dsh.pub registry status: ${status}"><title>dsh.pub registry status: ${status}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-opacity=".08"/></linearGradient><clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="55" height="20" fill="#14243a"/><rect x="55" width="${statusWidth}" height="20" fill="${statusColor}"/><rect width="${totalWidth}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="27.5" y="15" fill="#010101" fill-opacity=".3">dsh.pub</text><text x="27.5" y="14">dsh.pub</text><text x="${55 + statusWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${status}</text><text x="${55 + statusWidth / 2}" y="14">${status}</text></g></svg>`;
  return new Response(request.method === 'HEAD' ? null : svg, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
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

const validateIdempotencyKey = (value: string | null) => {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key must be a UUID.');
  }
  return value.toLowerCase();
};

const normalizeGitHubRepository = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'invalid_repository', 'Enter a public GitHub repository.');
  }
  const input = value.trim();
  let coordinate = input;
  if (input.includes('://')) {
    let repositoryUrl: URL;
    try {
      repositoryUrl = new URL(input);
    } catch {
      throw new ApiError(400, 'invalid_repository', 'Enter a valid GitHub repository URL.');
    }
    if (
      repositoryUrl.protocol !== 'https:' ||
      repositoryUrl.hostname.toLocaleLowerCase() !== 'github.com' ||
      repositoryUrl.search ||
      repositoryUrl.hash
    ) {
      throw new ApiError(
        400,
        'invalid_repository',
        'Only public GitHub repositories are supported.',
      );
    }
    coordinate = repositoryUrl.pathname.replace(/^\/+|\/+$/g, '');
  }
  coordinate = coordinate.replace(/\.git$/i, '');
  const parts = coordinate.split('/');
  const owner = parts[0] ?? '';
  const repo = parts[1] ?? '';
  if (
    parts.length !== 2 ||
    !GITHUB_OWNER_PATTERN.test(owner) ||
    !GITHUB_REPOSITORY_PATTERN.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    throw new ApiError(
      400,
      'invalid_repository',
      'Use a GitHub repository in owner/repository form.',
    );
  }
  return { owner, repo, repository: `https://github.com/${owner}/${repo}` };
};

const verifyTurnstile = async (
  request: Request,
  tokenValue: unknown,
  secret: string | undefined,
  idempotencyKey: string,
  fetcher: FetchFunction,
) => {
  if (typeof tokenValue !== 'string' || tokenValue.length < 1 || tokenValue.length > 2_048) {
    throw new ApiError(400, 'turnstile_failed', 'Complete the verification and try again.');
  }
  if (!secret) {
    throw new ApiError(
      503,
      'submission_unavailable',
      'Plugin submission is temporarily unavailable.',
    );
  }
  let response: Response;
  try {
    response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        ...(request.headers.get('CF-Connecting-IP')
          ? { remoteip: request.headers.get('CF-Connecting-IP') }
          : {}),
        response: tokenValue,
        secret,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(503, 'turnstile_unavailable', 'Verification is temporarily unavailable.');
  }
  if (!response.ok) {
    throw new ApiError(503, 'turnstile_unavailable', 'Verification is temporarily unavailable.');
  }
  const result: unknown = await response.json().catch(() => null);
  const expectedHostname = new URL(request.url).hostname.toLocaleLowerCase();
  const allowedHostnames = new Set(['dsh.pub', 'localhost', '127.0.0.1']);
  if (
    !isRecord(result) ||
    result.success !== true ||
    result.action !== 'plugin-submission' ||
    typeof result.hostname !== 'string' ||
    !allowedHostnames.has(expectedHostname) ||
    result.hostname.toLocaleLowerCase() !== expectedHostname
  ) {
    throw new ApiError(400, 'turnstile_failed', 'Complete the verification and try again.');
  }
};

const publicSubmissionErrorCodes = new Set([
  'submission_automation_failed',
  'submission_start_failed',
]);

const submissionResponse = (submission: PluginSubmissionRow) => ({
  ...(submission.status === 'failed' &&
  submission.error_code &&
  publicSubmissionErrorCodes.has(submission.error_code)
    ? { errorCode: submission.error_code }
    : {}),
  id: submission.id,
  ...(submission.pull_request_url ? { prUrl: submission.pull_request_url } : {}),
  repository: submission.repository,
  status: submission.status,
  statusUrl: `/api/submissions/${submission.id}`,
});

const readPluginSubmission = (db: D1DatabaseLike, id: string) =>
  db
    .prepare(
      `SELECT id, repository, owner, repo, status, pull_request_number,
              pull_request_url, error_code, error_message, repository_key
       FROM plugin_submissions WHERE id = ?1`,
    )
    .bind(id)
    .first<PluginSubmissionRow>();

const readActivePluginSubmission = (db: D1DatabaseLike, repositoryKey: string) =>
  db
    .prepare(
      `SELECT id, repository, owner, repo, status, pull_request_number,
              pull_request_url, error_code, error_message, repository_key
       FROM plugin_submissions
       WHERE repository_key = ?1
         AND status IN ('queued', 'creating_pr')
       LIMIT 1`,
    )
    .bind(repositoryKey)
    .first<PluginSubmissionRow>();

const createPluginSubmission = async (
  request: Request,
  env: WorkerBindings,
  origin: string | null,
  fetcher: FetchFunction,
) => {
  const body = await readJson(request);
  if (!isRecord(body) || !hasOnlyKeys(body, ['repository', 'turnstileToken'])) {
    throw new ApiError(400, 'invalid_body', 'Expected repository and turnstileToken.');
  }
  const id = validateIdempotencyKey(request.headers.get('Idempotency-Key'));
  const repository = normalizeGitHubRepository(body.repository);
  const repositoryKey = `${repository.owner}/${repository.repo}`.toLocaleLowerCase();
  const existing = await readPluginSubmission(env.DB, id);
  if (existing) {
    if (existing.repository !== repository.repository) {
      throw new ApiError(409, 'idempotency_conflict', 'Idempotency-Key is already in use.');
    }
    return json(submissionResponse(existing), 200, origin);
  }
  const active = await readActivePluginSubmission(env.DB, repositoryKey);
  if (active) return json(submissionResponse(active), 200, origin);
  await verifyTurnstile(request, body.turnstileToken, env.TURNSTILE_SECRET_KEY, id, fetcher);
  const [insert] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO plugin_submissions
           (id, repository, owner, repo, repository_key, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'queued')
         ON CONFLICT DO NOTHING`,
    ).bind(id, repository.repository, repository.owner, repository.repo, repositoryKey),
  ]);
  const submission =
    (await readPluginSubmission(env.DB, id)) ??
    (await readActivePluginSubmission(env.DB, repositoryKey));
  if (!submission) throw new ApiError(500, 'storage_error', 'Submission was not stored.');
  if (submission.repository !== repository.repository) {
    throw new ApiError(409, 'idempotency_conflict', 'Idempotency-Key is already in use.');
  }
  const created = (insert?.meta.changes ?? 0) === 1;
  if (created) {
    try {
      await env.PLUGIN_SUBMISSION_WORKFLOW.create({
        id,
        params: { ...repository, submissionId: id },
      });
    } catch {
      let started = false;
      try {
        const instance = await env.PLUGIN_SUBMISSION_WORKFLOW.get(id);
        const instanceStatus = await instance.status();
        started = [
          'queued',
          'running',
          'paused',
          'waiting',
          'waitingForPause',
          'complete',
        ].includes(instanceStatus.status);
      } catch {
        // The deterministic workflow instance could not be reconciled.
      }
      if (started) return json(submissionResponse(submission), 202, origin);
      const message = 'The asynchronous submission workflow could not be started.';
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE plugin_submissions
             SET status = 'failed', error_code = ?1, error_message = ?2, updated_at = unixepoch()
             WHERE id = ?3 AND status = 'queued'`,
        ).bind('submission_start_failed', message, id),
      ]);
      throw new ApiError(503, 'submission_start_failed', message);
    }
  }
  return json(submissionResponse(submission), created ? 202 : 200, origin);
};

const getPluginSubmission = async (db: D1DatabaseLike, idValue: string, origin: string | null) => {
  const id = validateIdempotencyKey(idValue);
  const submission = await readPluginSubmission(db, id);
  if (!submission) throw new ApiError(404, 'submission_not_found', 'Submission was not found.');
  return json(submissionResponse(submission), 200, origin);
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

export const handleRequest = async (
  request: Request,
  env: WorkerBindings,
  fetcher: FetchFunction = fetch,
): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    const locale = preferredLocale(request.headers.get('Accept-Language'));
    return Response.redirect(new URL(`/${locale}/`, url), 302);
  }

  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

  const badgeMatch = BADGE_ROUTE_PATTERN.exec(url.pathname);
  if ((request.method === 'GET' || request.method === 'HEAD') && badgeMatch?.[1] && badgeMatch[2]) {
    try {
      return registryBadge(request, badgeMatch[1], badgeMatch[2], url.searchParams.get('path'));
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.code, message: error.message }, error.status);
      }
      throw error;
    }
  }

  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin)) {
    return json({ error: 'origin_not_allowed', message: 'Origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin), status: 204 });
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/submission-config') {
      if (!env.TURNSTILE_SITE_KEY) {
        throw new ApiError(
          503,
          'submission_unavailable',
          'Plugin submission is temporarily unavailable.',
        );
      }
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }, 200, origin);
    }
    if (request.method === 'POST' && url.pathname === '/api/install-intents') {
      return await createInstallIntent(request, env.DB, origin);
    }
    if (request.method === 'POST' && url.pathname === '/api/install-completions') {
      return await completeInstall(request, env.DB, origin);
    }
    if (request.method === 'POST' && url.pathname === '/api/submissions') {
      return await createPluginSubmission(request, env, origin, fetcher);
    }
    const submissionMatch = /^\/api\/submissions\/([0-9a-f-]+)$/.exec(url.pathname);
    if (request.method === 'GET' && submissionMatch?.[1]) {
      return await getPluginSubmission(env.DB, submissionMatch[1], origin);
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
        message: 'API request failed',
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
