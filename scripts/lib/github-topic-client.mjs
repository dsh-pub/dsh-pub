import { setTimeout as delay } from 'node:timers/promises';

const API_URL = 'https://api.github.com/graphql';
const BATCH_SIZE = 50;
const INSPECTION_BATCH_SIZE = 20;
const MAX_CONCURRENCY = 4;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

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

export function createGitHubTopicClient({
  fetch: fetcher,
  now = () => new Date(),
  sleep = delay,
  token,
}) {
  if (!token) throw new Error('A GitHub token is required for complete Topic synchronization.');

  const request = async (query, variables) => {
    let response;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
        if (response.ok || !RETRYABLE_STATUS.has(response.status)) break;
        lastError = new Error(`GitHub GraphQL request failed with status ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await sleep(1_000 * 2 ** attempt);
    }
    if (!response?.ok) {
      throw (
        lastError ?? new Error(`GitHub GraphQL request failed with status ${response?.status}.`)
      );
    }
    const payload = await response.json();
    if (Array.isArray(payload.errors) && payload.errors.length) {
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
    let hasNextPage = true;
    while (hasNextPage) {
      pages += 1;
      if (pages > 100) throw new Error('GitHub Topic pagination exceeded the safety limit.');
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

  return {
    async discoverTopic(topic) {
      const cutoff = now();
      if (!(cutoff instanceof Date) || Number.isNaN(cutoff.valueOf())) {
        throw new Error('Topic snapshot cutoff is invalid.');
      }
      const pass = await readTopicPass(topic);
      if (pass.totalCount > 0 && pass.repositories.length === 0) {
        throw new Error('GitHub Topic discovery is incomplete.');
      }
      const repositories = pass.repositories.filter((repository) => {
        const updatedAt = new Date(repository.updatedAt);
        if (Number.isNaN(updatedAt.valueOf())) {
          throw new Error(`GitHub returned an invalid updatedAt for ${repository.repository}.`);
        }
        return updatedAt <= cutoff;
      });
      repositories.sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
      await readManifests(repositories);
      return {
        observedTotalCount: pass.totalCount,
        repositories,
        snapshotAt: cutoff.toISOString(),
        totalCount: repositories.length,
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
