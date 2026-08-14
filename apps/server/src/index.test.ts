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

interface StoredSubmission {
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

class FakeWorkflow {
  readonly calls: Array<{ id: string; params: unknown }> = [];
  readonly instances = new Set<string>();
  error: Error | undefined;
  persistBeforeError = false;

  async create(options: { id: string; params: unknown }) {
    this.calls.push(options);
    if (this.persistBeforeError) this.instances.add(options.id);
    if (this.error) throw this.error;
    this.instances.add(options.id);
    return { id: options.id };
  }

  async get(id: string) {
    if (!this.instances.has(id)) throw new Error('workflow instance not found');
    return { id, status: async () => ({ status: 'running' }) };
  }
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
    if (sql.includes('FROM plugin_submissions WHERE id = ?1')) {
      const submission = this.database.submissions.get(String(this.params[0]));
      return submission === undefined ? null : ({ ...submission } as Row);
    }
    if (sql.includes('FROM plugin_submissions WHERE repository_key = ?1')) {
      const key = String(this.params[0]);
      const submission = [...this.database.submissions.values()].find(
        (value) => value.repository_key === key && ['queued', 'creating_pr'].includes(value.status),
      );
      return submission === undefined ? null : ({ ...submission } as Row);
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
  readonly submissions = new Map<string, StoredSubmission>();

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
    if (sql.startsWith('INSERT INTO plugin_submissions')) {
      const [id, repository, owner, repo, suppliedKey] = statement.params.map(String);
      const repositoryKey = suppliedKey || `${owner}/${repo}`.toLocaleLowerCase();
      if (!id || !repository || !owner || !repo || !repositoryKey) {
        throw new Error('Missing submission values');
      }
      if (this.submissions.has(id)) return result<Row>();
      if (
        [...this.submissions.values()].some(
          (value) =>
            value.repository_key === repositoryKey &&
            ['queued', 'creating_pr'].includes(value.status),
        )
      ) {
        return result<Row>();
      }
      this.submissions.set(id, {
        error_code: null,
        error_message: null,
        id,
        owner,
        pull_request_number: null,
        pull_request_url: null,
        repo,
        repository_key: repositoryKey,
        repository,
        status: 'queued',
      });
      return result<Row>([], 1);
    }
    if (sql.startsWith("UPDATE plugin_submissions SET status = 'failed'")) {
      const errorCode = String(statement.params[0] ?? '');
      const errorMessage = String(statement.params[1] ?? '');
      const id = String(statement.params[2] ?? '');
      if (!errorCode || !errorMessage || !id) throw new Error('Missing failure values');
      const submission = this.submissions.get(id);
      if (!submission) return result<Row>();
      submission.status = 'failed';
      submission.error_code = errorCode;
      submission.error_message = errorMessage;
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
const submissionId = '796c8a18-d7f3-47e1-9b91-a290d1ad44f8';
const duplicateSubmissionId = '0efde98d-99a8-485f-9c62-b5c34f8a01f0';
const slug = 'omdsh-dev--dsh-genui';

const createEnv = () => {
  const db = new FakeD1();
  const workflow = new FakeWorkflow();
  const env: WorkerBindings = {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    PLUGIN_SUBMISSION_WORKFLOW: workflow,
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_SITE_KEY: 'turnstile-site-key',
  };
  return { db, env, workflow };
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

const verifiedTurnstileFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  expect(String(input)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  expect(JSON.parse(String(init?.body))).toMatchObject({
    idempotency_key: submissionId,
    response: 'verified-turnstile-token',
    secret: 'turnstile-secret',
  });
  return Response.json({ action: 'plugin-submission', hostname: 'dsh.pub', success: true });
};

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

describe('plugin submission intake', () => {
  it('publishes only the public Turnstile configuration', async () => {
    const { env } = createEnv();

    const response = await handleRequest(new Request('https://dsh.pub/api/submission-config'), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      turnstileSiteKey: 'turnstile-site-key',
    });
  });

  it('accepts one repository and starts a durable workflow', async () => {
    const { db, env, workflow } = createEnv();
    const request = post(
      '/api/submissions',
      {
        repository: 'https://github.com/Example/dsh-clock',
        turnstileToken: 'verified-turnstile-token',
      },
      'https://dsh.pub',
    );
    request.headers.set('Idempotency-Key', submissionId);

    const response = await handleRequest(request, env, verifiedTurnstileFetch);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      id: submissionId,
      repository: 'https://github.com/Example/dsh-clock',
      status: 'queued',
      statusUrl: `/api/submissions/${submissionId}`,
    });
    expect(db.submissions.get(submissionId)).toMatchObject({
      owner: 'Example',
      repo: 'dsh-clock',
      status: 'queued',
    });
    expect(workflow.calls).toEqual([
      {
        id: submissionId,
        params: {
          owner: 'Example',
          repo: 'dsh-clock',
          repository: 'https://github.com/Example/dsh-clock',
          submissionId,
        },
      },
    ]);
  });

  it('returns an existing submission without redeeming Turnstile twice', async () => {
    const { env, workflow } = createEnv();
    const request = () => {
      const value = post(
        '/api/submissions',
        {
          repository: 'Example/dsh-clock',
          turnstileToken: 'verified-turnstile-token',
        },
        'https://dsh.pub',
      );
      value.headers.set('Idempotency-Key', submissionId);
      return value;
    };
    let verificationCalls = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      verificationCalls += 1;
      if (verificationCalls > 1) throw new Error('Turnstile token was redeemed twice');
      return verifiedTurnstileFetch(input, init);
    };

    const first = await handleRequest(request(), env, fetcher);
    const duplicate = await handleRequest(request(), env, fetcher);

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    expect(verificationCalls).toBe(1);
    expect(workflow.calls).toHaveLength(1);
  });

  it('deduplicates the same repository across different idempotency keys', async () => {
    const { env, workflow } = createEnv();
    const submit = (id: string) => {
      const request = post(
        '/api/submissions',
        {
          repository: 'https://github.com/example/DSH-CLOCK',
          turnstileToken: 'verified-turnstile-token',
        },
        'https://dsh.pub',
      );
      request.headers.set('Idempotency-Key', id);
      return handleRequest(request, env, verifiedTurnstileFetch);
    };

    const first = await submit(submissionId);
    const duplicate = await submit(duplicateSubmissionId);

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ id: submissionId });
    expect(workflow.calls).toHaveLength(1);
  });

  it.each(['pr_created', 'already_submitted'])(
    'allows a new request after the previous submission reached %s',
    async (status) => {
      const { db, env, workflow } = createEnv();
      db.submissions.set(submissionId, {
        error_code: null,
        error_message: null,
        id: submissionId,
        owner: 'Example',
        pull_request_number: status === 'pr_created' ? 42 : null,
        pull_request_url:
          status === 'pr_created' ? 'https://github.com/dsh-pub/dsh-pub/pull/42' : null,
        repo: 'dsh-clock',
        repository_key: 'example/dsh-clock',
        repository: 'https://github.com/Example/dsh-clock',
        status,
      });
      const request = post(
        '/api/submissions',
        {
          repository: 'https://github.com/Example/dsh-clock',
          turnstileToken: 'verified-turnstile-token',
        },
        'https://dsh.pub',
      );
      request.headers.set('Idempotency-Key', duplicateSubmissionId);

      const response = await handleRequest(request, env, async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          idempotency_key: duplicateSubmissionId,
        });
        return Response.json({ action: 'plugin-submission', hostname: 'dsh.pub', success: true });
      });

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        id: duplicateSubmissionId,
        status: 'queued',
      });
      expect(workflow.calls).toEqual([
        {
          id: duplicateSubmissionId,
          params: expect.objectContaining({ submissionId: duplicateSubmissionId }),
        },
      ]);
    },
  );

  it('returns the current asynchronous status and pull request URL', async () => {
    const { db, env } = createEnv();
    db.submissions.set(submissionId, {
      error_code: null,
      error_message: null,
      id: submissionId,
      owner: 'Example',
      pull_request_number: 42,
      pull_request_url: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      repo: 'dsh-clock',
      repository_key: 'example/dsh-clock',
      repository: 'https://github.com/Example/dsh-clock',
      status: 'pr_created',
    });

    const response = await handleRequest(
      new Request(`https://dsh.pub/api/submissions/${submissionId}`),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: submissionId,
      prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
      repository: 'https://github.com/Example/dsh-clock',
      status: 'pr_created',
      statusUrl: `/api/submissions/${submissionId}`,
    });
  });

  it('only exposes allowlisted public error codes for failed submissions', async () => {
    const { db, env } = createEnv();
    db.submissions.set(submissionId, {
      error_code: 'submission_automation_failed',
      error_message: 'GitHub returned a private implementation detail.',
      id: submissionId,
      owner: 'Example',
      pull_request_number: null,
      pull_request_url: null,
      repo: 'dsh-clock',
      repository_key: 'example/dsh-clock',
      repository: 'https://github.com/Example/dsh-clock',
      status: 'failed',
    });

    const response = await handleRequest(
      new Request(`https://dsh.pub/api/submissions/${submissionId}`),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      errorCode: 'submission_automation_failed',
      id: submissionId,
      repository: 'https://github.com/Example/dsh-clock',
      status: 'failed',
      statusUrl: `/api/submissions/${submissionId}`,
    });
    expect(JSON.stringify(body)).not.toContain('private implementation detail');

    db.submissions.get(submissionId)!.error_code = 'github_private_error';
    const unknown = await handleRequest(
      new Request(`https://dsh.pub/api/submissions/${submissionId}`),
      env,
    );
    expect(await unknown.json()).not.toHaveProperty('errorCode');
  });

  it('records a failed dispatch instead of leaving a permanently queued task', async () => {
    const { db, env, workflow } = createEnv();
    workflow.error = new Error('workflow unavailable');
    const request = post(
      '/api/submissions',
      { repository: 'Example/dsh-clock', turnstileToken: 'verified-turnstile-token' },
      'https://dsh.pub',
    );
    request.headers.set('Idempotency-Key', submissionId);

    const response = await handleRequest(request, env, verifiedTurnstileFetch);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'submission_start_failed' });
    expect(db.submissions.get(submissionId)).toMatchObject({
      error_code: 'submission_start_failed',
      status: 'failed',
    });
  });

  it('keeps a queued task when workflow creation succeeded but its response was lost', async () => {
    const { db, env, workflow } = createEnv();
    workflow.error = new Error('response lost');
    workflow.persistBeforeError = true;
    const request = post(
      '/api/submissions',
      { repository: 'Example/dsh-clock', turnstileToken: 'verified-turnstile-token' },
      'https://dsh.pub',
    );
    request.headers.set('Idempotency-Key', submissionId);

    const response = await handleRequest(request, env, verifiedTurnstileFetch);

    expect(response.status).toBe(202);
    expect(db.submissions.get(submissionId)?.status).toBe('queued');
  });

  it('rejects submission before writing D1 when Turnstile validation fails', async () => {
    const { db, env, workflow } = createEnv();
    const request = post(
      '/api/submissions',
      { repository: 'Example/dsh-clock', turnstileToken: 'invalid-token' },
      'https://dsh.pub',
    );
    request.headers.set('Idempotency-Key', submissionId);

    const response = await handleRequest(request, env, async () =>
      Response.json({ 'error-codes': ['invalid-input-response'], success: false }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'turnstile_failed' });
    expect(db.submissions).toHaveLength(0);
    expect(workflow.calls).toHaveLength(0);
  });

  it('rejects a valid-looking Turnstile result on an unapproved Worker hostname', async () => {
    const { env } = createEnv();
    const request = new Request('https://dsh-pub.example.workers.dev/api/submissions', {
      body: JSON.stringify({
        repository: 'Example/dsh-clock',
        turnstileToken: 'verified-turnstile-token',
      }),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': submissionId,
      },
      method: 'POST',
    });

    const response = await handleRequest(request, env, async () =>
      Response.json({
        action: 'plugin-submission',
        hostname: 'dsh-pub.example.workers.dev',
        success: true,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'turnstile_failed' });
  });
});
