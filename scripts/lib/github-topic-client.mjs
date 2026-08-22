import { setTimeout as delay } from 'node:timers/promises';

const API_URL = 'https://api.github.com/graphql';
const BATCH_SIZE = 50;
const INSPECTION_BATCH_SIZE = 20;
const MAX_CONCURRENCY = 4;
const TOPIC_PAGE_SIZE = 100;
const TOPIC_PAGE_BUFFER = 10;
export const TOPIC_MAX_PAGES = 250;
const RETRYABLE_STATUS = new Set([403, 429, 502, 503, 504]);
const RATE_LIMIT_STATUS = new Set([403, 429]);
const RATE_LIMIT_MESSAGE = /(?:rate limit|abuse detection|submitted too quickly)/i;

const TOPIC_QUERY = `
  query TopicRepositories($topic: String!, $cursor: String) {
    topic(name: $topic) {
      repositories(
        first: 100
        after: $cursor
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          nameWithOwner
          url
          description
          isArchived
          isPrivate
          updatedAt
          defaultBranchRef { name target { oid } }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

const chunks = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
};

const parallelBatches = async (values, worker, batchSize = BATCH_SIZE) => {
  const batches = chunks(values, batchSize);
  const results = new Array(batches.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(MAX_CONCURRENCY, batches.length) }, async () => {
    while (next < batches.length) {
      const index = next;
      next += 1;
      results[index] = await worker(batches[index]);
    }
  });
  await Promise.all(runners);
  return results;
};

const blobSelection = (includeText) => `... on Blob { byteSize oid${includeText ? ' text' : ''} }`;

const batchQuery = (batch, mode) => {
  const definitions = [];
  const fields = [];
  const variables = {};
  for (const [index, item] of batch.entries()) {
    const alias = mode === 'manifest' ? `m${index}` : `r${index}`;
    if (mode === 'manifest') {
      definitions.push(
        `$owner${index}: String!`,
        `$name${index}: String!`,
        `$manifest${index}: String!`,
      );
      fields.push(`
        ${alias}: repository(owner: $owner${index}, name: $name${index}) {
          object(expression: $manifest${index}) { ${blobSelection(true)} }
        }
      `);
      variables[`manifest${index}`] = `${item.commit}:package.json`;
    } else {
      const paths = {
        patch: item.contract.patchPath,
        runtime: item.contract.runtimePath,
        ...(item.contract.client.entryPath ? { client: item.contract.client.entryPath } : {}),
        readme: 'README.md',
        readmeZhCn: 'README.zh-CN.md',
        readmeZh: 'README.zh.md',
        license: 'LICENSE',
        licenseMd: 'LICENSE.md',
      };
      definitions.push(`$owner${index}: String!`, `$name${index}: String!`);
      const objects = [];
      for (const [key, path] of Object.entries(paths)) {
        const variable = `${key}${index}`;
        definitions.push(`$${variable}: String!`);
        variables[variable] = `${item.repository.commit}:${path}`;
        const includeText = ['patch', 'readme', 'readmeZhCn', 'readmeZh'].includes(key);
        objects.push(`${key}: object(expression: $${variable}) { ${blobSelection(includeText)} }`);
      }
      fields.push(`
        ${alias}: repository(owner: $owner${index}, name: $name${index}) {
          ${objects.join('\n')}
        }
      `);
    }
    const [owner, name] = item.nameWithOwner
      ? item.nameWithOwner.split('/')
      : item.repository.nameWithOwner.split('/');
    variables[`owner${index}`] = owner;
    variables[`name${index}`] = name;
  }
  return {
    query: `query TopicBatch(${definitions.join(', ')}) { ${fields.join('\n')} rateLimit { cost remaining resetAt } }`,
    variables,
  };
};

const unwrapObject = (repository, field) => repository?.[field] ?? null;

const retryDelay = (response, attempt, rateLimited) => {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1_000, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1_000, date - Date.now());
  }
  const reset = Number(response?.headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.min(600_000, Math.max(1_000, reset * 1_000 - Date.now()));
  }
  return (rateLimited ? 60_000 : 1_000) * 2 ** attempt;
};

export const topicPaginationBudget = (observedTotalCount) =>
  Math.min(
    TOPIC_MAX_PAGES,
    Math.max(1, Math.ceil(observedTotalCount / TOPIC_PAGE_SIZE) + TOPIC_PAGE_BUFFER),
  );

export function createGitHubTopicClient({
  fetch: fetcher,
  now = () => new Date(),
  sleep = delay,
  token,
}) {
  if (!token) throw new Error('A GitHub token is required for complete Topic synchronization.');

  const request = async (query, variables) => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await fetcher(API_URL, {
          body: JSON.stringify({ query, variables }),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'dsh.pub-topic-catalog-sync',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          method: 'POST',
          signal: globalThis.AbortSignal.timeout(30_000),
        });
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(retryDelay(undefined, attempt, false));
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`GitHub GraphQL request failed with status ${response.status}.`);
        if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
          await sleep(retryDelay(response, attempt, RATE_LIMIT_STATUS.has(response.status)));
          continue;
        }
        throw lastError;
      }

      const payload = await response.json();
      if (Array.isArray(payload.errors) && payload.errors.length) {
        const rateLimited = payload.errors.some(
          (error) => typeof error?.message === 'string' && RATE_LIMIT_MESSAGE.test(error.message),
        );
        if (rateLimited && attempt < 2) {
          lastError = new Error(`GitHub GraphQL request failed: ${payload.errors[0].message}`);
          await sleep(retryDelay(response, attempt, true));
          continue;
        }
        const onlyMissingRepositories = payload.errors.every(
          (error) =>
            typeof error?.message === 'string' &&
            error.message.startsWith('Could not resolve to a Repository with the name') &&
            Array.isArray(error.path) &&
            typeof error.path[0] === 'string' &&
            /^[mr]\d+$/.test(error.path[0]),
        );
        if (!onlyMissingRepositories) {
          throw new Error(`GitHub GraphQL request failed: ${payload.errors[0].message}`);
        }
      }
      if (!payload.data) throw new Error('GitHub GraphQL response did not contain data.');
      return payload.data;
    }
    throw lastError ?? new Error('GitHub GraphQL request failed after retries.');
  };

  const readManifests = async (repositories) => {
    await parallelBatches(repositories, async (batch) => {
      const operation = batchQuery(batch, 'manifest');
      const data = await request(operation.query, operation.variables);
      for (const [index, repository] of batch.entries()) {
        const manifest = unwrapObject(data[`m${index}`], 'object');
        repository.manifest = typeof manifest?.text === 'string' ? manifest.text : null;
      }
    });
  };

  const readTopicPass = async (topic) => {
    const repositories = [];
    const coordinates = new Set();
    let cursor = null;
    let totalCount;
    let pages = 0;
    let pageBudget = TOPIC_MAX_PAGES;
    let hasNextPage = true;
    while (hasNextPage) {
      pages += 1;
      const data = await request(TOPIC_QUERY, { cursor, topic });
      const connection = data.topic?.repositories;
      if (
        !connection ||
        !Number.isSafeInteger(connection.totalCount) ||
        !Array.isArray(connection.nodes) ||
        typeof connection.pageInfo?.hasNextPage !== 'boolean'
      ) {
        throw new Error('GitHub Topic response is incomplete.');
      }
      totalCount = connection.totalCount;
      pageBudget = topicPaginationBudget(totalCount);
      if (pages > pageBudget) {
        throw new Error(
          `GitHub Topic pagination exceeded the safety limit (${pageBudget} pages for ${totalCount} repositories).`,
        );
      }
      for (const node of connection.nodes) {
        const commit = node.defaultBranchRef?.target?.oid;
        const coordinate = node.nameWithOwner?.toLocaleLowerCase();
        if (!coordinate || coordinates.has(coordinate)) {
          throw new Error('GitHub Topic pagination returned a duplicate or invalid repository.');
        }
        coordinates.add(coordinate);
        repositories.push({
          archived: Boolean(node.isArchived || node.isPrivate),
          commit: typeof commit === 'string' ? commit : '',
          description: typeof node.description === 'string' ? node.description : '',
          manifest: null,
          nameWithOwner: node.nameWithOwner,
          repository: node.url,
          updatedAt: node.updatedAt,
        });
      }
      cursor = connection.pageInfo.endCursor;
      hasNextPage = connection.pageInfo.hasNextPage;
      if (hasNextPage && typeof cursor !== 'string') {
        throw new Error('GitHub Topic pagination is incomplete.');
      }
    }
    return { repositories, totalCount };
  };

  const readCompleteTopicPass = async (topic) => {
    let lastError;
    let bestPass;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const pass = await readTopicPass(topic);
        if (pass.repositories.length === pass.totalCount) {
          return { ...pass, complete: true, unresolvedCount: 0 };
        }
        if (!bestPass || pass.repositories.length > bestPass.repositories.length) bestPass = pass;
        lastError = new Error('GitHub Topic discovery is incomplete.');
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await sleep(1_000 * 2 ** attempt);
    }
    if (bestPass) {
      return {
        ...bestPass,
        complete: false,
        unresolvedCount: Math.max(0, bestPass.totalCount - bestPass.repositories.length),
      };
    }
    throw lastError ?? new Error('GitHub Topic discovery is incomplete.');
  };

  return {
    async discoverTopic(topic) {
      const cutoff = now();
      if (!(cutoff instanceof Date) || Number.isNaN(cutoff.valueOf())) {
        throw new Error('Topic snapshot cutoff is invalid.');
      }
      const pass = await readCompleteTopicPass(topic);
      const repositories = [];
      const deferredRepositories = [];
      for (const repository of pass.repositories) {
        const updatedAt = new Date(repository.updatedAt);
        if (Number.isNaN(updatedAt.valueOf())) {
          throw new Error(`GitHub returned an invalid updatedAt for ${repository.repository}.`);
        }
        (updatedAt <= cutoff ? repositories : deferredRepositories).push(repository);
      }
      repositories.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
      deferredRepositories.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
      await readManifests(repositories);
      return {
        complete: pass.complete,
        deferredRepositories,
        observedTotalCount: Math.max(pass.totalCount, pass.repositories.length),
        repositories,
        snapshotAt: cutoff.toISOString(),
        totalCount: repositories.length,
        unresolvedCount: pass.unresolvedCount,
      };
    },

    async inspectBundles(candidates) {
      const result = new Map();
      await parallelBatches(
        candidates,
        async (batch) => {
          const operation = batchQuery(batch, 'inspection');
          const data = await request(operation.query, operation.variables);
          for (const [index, candidate] of batch.entries()) {
            const repository = data[`r${index}`];
            const readme = unwrapObject(repository, 'readme');
            const readmeZhCn = unwrapObject(repository, 'readmeZhCn');
            const readmeZh = unwrapObject(repository, 'readmeZh');
            const license = unwrapObject(repository, 'license');
            const licenseMd = unwrapObject(repository, 'licenseMd');
            result.set(candidate.repository.repository, {
              client: unwrapObject(repository, 'client'),
              license: license
                ? { ...license, path: 'LICENSE' }
                : licenseMd
                  ? { ...licenseMd, path: 'LICENSE.md' }
                  : null,
              patch: unwrapObject(repository, 'patch'),
              readme: readme ? { ...readme, path: 'README.md' } : null,
              readmeZh: readmeZhCn
                ? { ...readmeZhCn, path: 'README.zh-CN.md' }
                : readmeZh
                  ? { ...readmeZh, path: 'README.zh.md' }
                  : null,
              runtime: unwrapObject(repository, 'runtime'),
            });
          }
        },
        INSPECTION_BATCH_SIZE,
      );
      return result;
    },
  };
}
