import { describe, expect, it } from 'vitest';

import {
  handleRequest,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1ResultLike,
  type WorkerBindings,
} from './index.js';

interface StoredEvent {
  completion_id: string | null;
  event_id: string;
  slug: string;
  status: 'pending' | 'completed';
  version: string;
}

class FakeStatement implements D1PreparedStatementLike {
  params: unknown[] = [];

  constructor(
    readonly database: FakeD1,
    readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  async first<Row = Record<string, unknown>>(): Promise<Row | null> {
    const sql = normalize(this.query);
    if (sql.startsWith('SELECT completed_total FROM plugin_stats')) {
      const total = this.database.stats.get(String(this.params[0]));
      return total === undefined ? null : ({ completed_total: total } as Row);
    }
    throw new Error(`Unsupported first query: ${sql}`);
  }
}

const normalize = (query: string) => query.replace(/\s+/g, ' ').trim();

const result = <Row>(rows: Row[] = [], changes = 0): D1ResultLike<Row> => ({
  meta: { changes },
  results: rows,
  success: true,
});

class FakeD1 implements D1DatabaseLike {
  readonly events = new Map<string, StoredEvent>();
  readonly stats = new Map<string, number>();

  prepare(query: string) {
    return new FakeStatement(this, query);
  }

  async batch<Row = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<Row>[]> {
    return statements.map((statement) => this.execute<Row>(statement as FakeStatement));
  }

  private execute<Row>(statement: FakeStatement): D1ResultLike<Row> {
    const sql = normalize(statement.query);
    if (sql.startsWith('INSERT INTO install_events')) {
      const [eventId, slug, version] = statement.params.map(String);
      if (!eventId || !slug || !version) throw new Error('Missing event values');
      if (this.events.has(eventId)) return result<Row>();
      this.events.set(eventId, {
        completion_id: null,
        event_id: eventId,
        slug,
        status: 'pending',
        version,
      });
      return result<Row>([], 1);
    }
    if (sql.startsWith('UPDATE install_events')) {
      const [completionId, eventId] = statement.params.map(String);
      const event = eventId ? this.events.get(eventId) : undefined;
      if (!event || event.status !== 'pending' || !completionId) return result<Row>();
      event.status = 'completed';
      event.completion_id = completionId;
      return result<Row>([], 1);
    }
    if (sql.startsWith('INSERT INTO plugin_stats')) {
      const [eventId, completionId] = statement.params.map(String);
      const event = eventId ? this.events.get(eventId) : undefined;
      if (!event || event.completion_id !== completionId) return result<Row>();
      this.stats.set(event.slug, (this.stats.get(event.slug) ?? 0) + 1);
      return result<Row>([], 1);
    }
    if (sql.startsWith('SELECT event_id, slug, version, status, completion_id')) {
      const event = this.events.get(String(statement.params[0]));
      return result(event ? [{ ...event } as Row] : []);
    }
    throw new Error(`Unsupported batch query: ${sql}`);
  }
}

const eventId = 'bc7b48d3-1513-49ab-aa71-a0debe74d92b';
const slug = 'omdsh-dev--dsh-genui';

const createEnv = () => {
  const db = new FakeD1();
  const env: WorkerBindings = {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
  };
  return { db, env };
};

const post = (path: string, body: unknown, origin?: string) =>
  new Request(`https://dsh.pub${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    method: 'POST',
  });

const sendIntent = (env: WorkerBindings, id = eventId) =>
  handleRequest(post('/api/install-intents', { eventId: id, slug, version: 'main' }), env);

describe('install telemetry worker', () => {
  it('serves an embeddable registry badge with a truthful listing state', async () => {
    const { env } = createEnv();
    const listed = await handleRequest(
      new Request('https://dsh.pub/api/badges/omdsh-dev/dsh-genui.svg'),
      env,
    );
    const missing = await handleRequest(
      new Request('https://dsh.pub/api/badges/example/not-yet-listed.svg'),
      env,
    );
    const head = await handleRequest(
      new Request('https://dsh.pub/api/badges/omdsh-dev/dsh-genui.svg', {
        headers: { Origin: 'https://github.com' },
        method: 'HEAD',
      }),
      env,
    );
    const invalidPath = await handleRequest(
      new Request('https://dsh.pub/api/badges/example/plugin.svg?path=../escape'),
      env,
    );

    expect(listed.status).toBe(200);
    expect(listed.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
    expect(listed.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await listed.text()).toContain('listed');
    expect(await missing.text()).toContain('not listed');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(invalidPath.status).toBe(400);
    await expect(invalidPath.json()).resolves.toMatchObject({ error: 'invalid_badge_path' });
  });

  it('creates an install intent idempotently', async () => {
    const { db, env } = createEnv();

    const first = await sendIntent(env);
    const second = await sendIntent(env);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ eventId, status: 'pending' });
    expect(db.events).toHaveLength(1);
  });

  it('rejects completion when no intent exists', async () => {
    const { db, env } = createEnv();

    const response = await handleRequest(post('/api/install-completions', { eventId }), env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'intent_not_found' });
    expect(db.stats.get(slug)).toBeUndefined();
  });

  it('counts a completed install only once', async () => {
    const { db, env } = createEnv();
    await sendIntent(env);

    const first = await handleRequest(post('/api/install-completions', { eventId }), env);
    const duplicate = await handleRequest(post('/api/install-completions', { eventId }), env);
    const stats = await handleRequest(
      new Request(`https://dsh.pub/api/plugins/${slug}/stats`),
      env,
    );

    await expect(first.json()).resolves.toMatchObject({ counted: true, status: 'completed' });
    await expect(duplicate.json()).resolves.toMatchObject({ counted: false, status: 'completed' });
    await expect(stats.json()).resolves.toEqual({
      metric: 'CLI-reported completed installs',
      slug,
      total: 1,
    });
    expect(db.stats.get(slug)).toBe(1);
  });

  it('allows dsh.pub and localhost CORS origins but rejects others', async () => {
    const { env } = createEnv();
    const allowed = await handleRequest(
      post('/api/install-intents', { eventId, slug, version: 'main' }, 'https://dsh.pub'),
      env,
    );
    const localhost = await handleRequest(
      new Request(`https://dsh.pub/api/plugins/${slug}/stats`, {
        headers: { Origin: 'http://localhost:4321' },
      }),
      env,
    );
    const rejected = await handleRequest(
      new Request(`https://dsh.pub/api/plugins/${slug}/stats`, {
        headers: { Origin: 'https://example.com' },
      }),
      env,
    );

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://dsh.pub');
    expect(localhost.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4321');
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects non-registry slugs and redirects the root by locale', async () => {
    const { env } = createEnv();
    const invalid = await handleRequest(
      post('/api/install-intents', {
        eventId,
        slug: 'https://github.com/private/repo',
        version: 'main',
      }),
      env,
    );
    const redirect = await handleRequest(
      new Request('https://dsh.pub/', { headers: { 'Accept-Language': 'zh-CN,en;q=0.8' } }),
      env,
    );
    const englishRedirect = await handleRequest(
      new Request('https://dsh.pub/', { headers: { 'Accept-Language': 'en-US,zh;q=0.8' } }),
      env,
    );

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: 'invalid_slug' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('Location')).toBe('https://dsh.pub/zh/');
    expect(englishRedirect.headers.get('Location')).toBe('https://dsh.pub/en/');
  });

  it('rejects well-formed slugs that are not in the curated registry', async () => {
    const { env } = createEnv();
    const intent = await handleRequest(
      post('/api/install-intents', {
        eventId,
        slug: 'unknown-owner--unknown-plugin',
        version: 'main',
      }),
      env,
    );
    const stats = await handleRequest(
      new Request('https://dsh.pub/api/plugins/unknown-owner--unknown-plugin/stats'),
      env,
    );

    expect(intent.status).toBe(404);
    await expect(intent.json()).resolves.toMatchObject({ error: 'plugin_not_found' });
    expect(stats.status).toBe(404);
    await expect(stats.json()).resolves.toMatchObject({ error: 'plugin_not_found' });
  });
});
