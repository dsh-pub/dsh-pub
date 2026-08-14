import { catalog, communityCatalog, marketplaceEntries } from '../lib/catalog.js';
import { installCommand, provenanceStatus } from '../lib/catalog-types.js';
import { ecosystemCatalog, ecosystemEntries } from '../lib/ecosystem.js';

export const prerender = true;

const toolNames = (entry: (typeof marketplaceEntries)[number]) =>
  (entry.capabilities.tools ?? []).map((tool) => (typeof tool === 'string' ? tool : tool.name));

const uiSlots = (entry: (typeof marketplaceEntries)[number]) =>
  [
    ...(entry.capabilities.uiContributions ?? []).map((item) =>
      typeof item === 'string' ? item : item.slot,
    ),
    ...(entry.capabilities.uiSlotsDeclared ?? []).map((item) =>
      typeof item === 'string' ? item : item.slot,
    ),
  ].filter((slot, index, slots) => slots.indexOf(slot) === index);

const registry = marketplaceEntries.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  description: entry.description,
  category: entry.category,
  type: entry.type,
  provenance: provenanceStatus(entry),
  builtIn: entry.builtIn,
  tools: toolNames(entry),
  uiSlots: uiSlots(entry),
  profiles: entry.availability.profiles ?? [],
  source: {
    repository: entry.source.repository,
    directory: entry.source.directory,
    commit: entry.source.commit,
  },
  install: {
    installable: entry.distribution.installable,
    command: entry.distribution.installable ? installCommand(entry) : null,
  },
  urls: {
    en: `https://dsh.pub/en/plugins/${entry.slug}/`,
    zh: `https://dsh.pub/zh/plugins/${entry.slug}/`,
  },
}));

const ecosystem = ecosystemEntries.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  owner: entry.owner,
  description: entry.description,
  category: entry.category,
  type: entry.resourceType,
  activity: entry.activity,
  stars: entry.stars,
  forks: entry.forks,
  updated: entry.updatedLabel,
  discoveryOnly: true,
  sourceRepository: entry.sourceRepository,
  sourceIndexUrl: entry.detailUrl,
}));

const body = {
  schemaVersion: 1,
  generatedAt: {
    registry: communityCatalog.source.generatedAt,
    ecosystem: ecosystemCatalog.source.generatedAt,
  },
  sources: {
    officialRegistry: catalog.source,
    communityRegistry: communityCatalog.source,
    ecosystem: ecosystemCatalog.source,
  },
  searchFields: [
    'name',
    'description',
    'category',
    'type',
    'tools',
    'uiSlots',
    'profiles',
    'source.repository',
  ],
  totals: {
    registry: registry.length,
    ecosystem: ecosystem.length,
  },
  registry,
  ecosystem,
};

export const GET = () =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
