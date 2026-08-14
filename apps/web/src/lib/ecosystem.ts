import rawEcosystem from '../../../../packages/catalog/src/ecosystem.generated.json';

import { marketplaceEntries } from './catalog.js';

export interface EcosystemEntry {
  id: string;
  slug: string;
  name: string;
  owner: string;
  description: string;
  sourceRepository: string;
  avatarUrl: string;
  resourceType: string;
  category: string;
  activity: string;
  stars: number;
  forks: number;
  updatedLabel: string;
  detailUrl: string;
}

export interface EcosystemCatalog {
  source: {
    index: string;
    canonical: string;
    generatedAt: string;
    policy: 'discovery-only-public-ecosystem-signals';
    statement: { en: string; zh: string };
  };
  totals: { indexed: number };
  entries: EcosystemEntry[];
}

export const ecosystemCatalog = rawEcosystem as EcosystemCatalog;
export const ecosystemEntries = ecosystemCatalog.entries;

const registeredRepositories = new Set(
  marketplaceEntries.map((entry) =>
    entry.source.repository.replace(/\/$/u, '').toLocaleLowerCase(),
  ),
);

export const ecosystemCandidates = ecosystemEntries.filter(
  (entry) => !registeredRepositories.has(entry.sourceRepository.toLocaleLowerCase()),
);

export const ecosystemCategories = [...new Set(ecosystemEntries.map((entry) => entry.category))]
  .map((category) => ({
    category,
    count: ecosystemEntries.filter((entry) => entry.category === category).length,
  }))
  .sort((left, right) => right.count - left.count);

export const trendingEcosystemEntries = [...ecosystemEntries]
  .sort((left, right) => right.stars - left.stars || right.forks - left.forks)
  .slice(0, 6);

export const recentlyActiveEcosystemEntries = ecosystemEntries
  .filter((entry) => entry.updatedLabel === 'today' || /\b[1-7]d ago$/u.test(entry.updatedLabel))
  .slice(0, 6);

export function ecosystemSearchText(entry: EcosystemEntry): string {
  return [
    entry.name,
    entry.owner,
    entry.description,
    entry.resourceType,
    entry.category,
    entry.activity,
    entry.sourceRepository,
  ]
    .join(' ')
    .toLocaleLowerCase();
}
