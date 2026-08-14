import rawCatalog from '../../../../packages/catalog/src/catalog.generated.json';
import rawCommunityCatalog from '../../../../packages/catalog/src/community.generated.json';

import { provenanceStatus, type CatalogData, type CatalogEntry } from './catalog-types.js';

export const catalog = rawCatalog as CatalogData;
export const communityCatalog = rawCommunityCatalog as {
  source: {
    repository: string;
    generatedAt: string;
    policy: 'curated-pinned-source-contracts' | 'pinned-source-contracts';
  };
  totals: { reviewed: number; submitted?: number; installable: number };
  entries: CatalogEntry[];
};

const capabilityOverlays: Record<string, Partial<CatalogEntry['capabilities']>> = {
  'client-ui-trajectory': {
    uiContributions: [{ slot: 'conversation.view', id: 'trajectory', component: 'TrajectoryView' }],
  },
  'client-ui-conversation': {
    uiSlotsDeclared: [
      { slot: 'conversation.view', kind: 'keyed', scope: 'session' },
      { slot: 'conversation.composer', kind: 'single', scope: 'session' },
    ],
  },
  'tool-bash': {
    tools: [{ name: 'bash', description: 'Execute a shell command in the active workspace.' }],
  },
};

function enriched(entry: CatalogEntry): CatalogEntry {
  const overlay = capabilityOverlays[entry.slug];
  if (!overlay) return entry;
  return {
    ...entry,
    capabilities: {
      ...entry.capabilities,
      ...overlay,
    },
  };
}

const officialMarketplaceEntries = catalog.entries
  .filter((entry) => entry.type === 'plugin' || entry.type === 'bundle')
  .map(enriched);

export const communityEntries = communityCatalog.entries.map(enriched);

export const marketplaceEntries = [...officialMarketplaceEntries, ...communityEntries];

export const installableEntries = marketplaceEntries.filter(
  (entry) => entry.distribution.installable,
);

export const bundleEntries = officialMarketplaceEntries.filter((entry) => entry.type === 'bundle');

export const builtInEntries = officialMarketplaceEntries.filter(
  (entry) => entry.runtime.hostLoadable && provenanceStatus(entry) === 'built-in',
);

const featuredFragments = [
  'client-ui-conversation',
  'client-ui-trajectory',
  'tool-bash',
  'goal',
  'llm-deepseek',
  'storage-json',
  'session-persistence-jsonl',
  'client-ui-config',
];

export const featuredEntries = featuredFragments
  .map((fragment) =>
    builtInEntries.find((entry) => entry.slug.includes(fragment) || entry.name.includes(fragment)),
  )
  .filter((entry): entry is CatalogEntry => Boolean(entry));

export function entryBySlug(slug: string): CatalogEntry | undefined {
  return marketplaceEntries.find((entry) => entry.slug === slug);
}

export function categoryCounts(entries: CatalogEntry[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

export function entrySearchText(entry: CatalogEntry): string {
  return [
    entry.name,
    entry.slug,
    entry.description.en,
    entry.description.zh,
    entry.category,
    entry.type,
    provenanceStatus(entry),
    entry.source.repository,
    ...(entry.runtime.hostInjects ?? []),
    ...(entry.capabilities.tools ?? []).map((tool) => tool.name),
    ...(entry.capabilities.uiContributions ?? []).map((item) => item.slot),
  ]
    .join(' ')
    .toLocaleLowerCase();
}
