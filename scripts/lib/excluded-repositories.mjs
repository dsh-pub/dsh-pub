import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PUBLISHER_DELISTED = {
  code: 'publisher_delisted',
  message: 'Repository is excluded from the catalog by publisher request.',
};

const defaultListPath = fileURLToPath(
  new URL('../../packages/catalog/src/excluded-repositories.json', import.meta.url),
);

export const normalizeRepositoryCoordinate = (repository) =>
  String(repository).trim().replace(/\/+$/g, '').toLocaleLowerCase();

export const createExcludedRepositorySet = (repositories = []) =>
  new Set(
    [...repositories].map((entry) =>
      normalizeRepositoryCoordinate(typeof entry === 'string' ? entry : entry.repository),
    ),
  );

export const parseExcludedRepositoryList = (value) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.repositories) ||
    value.repositories.some(
      (entry) =>
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry) ||
        typeof entry.repository !== 'string' ||
        !entry.repository.trim(),
    )
  ) {
    throw new Error('excluded-repositories.json must list repository coordinates.');
  }
  return createExcludedRepositorySet(value.repositories);
};

export const loadExcludedRepositories = (path = defaultListPath) =>
  parseExcludedRepositoryList(JSON.parse(readFileSync(path, 'utf8')));

export const isExcludedRepository = (repository, excluded = loadExcludedRepositories()) =>
  excluded.has(normalizeRepositoryCoordinate(repository));
