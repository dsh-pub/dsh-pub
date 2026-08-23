import { communityEntries, marketplaceEntries } from './catalog.js';
import { displayName, localized, provenanceStatus, type CatalogEntry } from './catalog-types.js';
import { ecosystemCandidates, type EcosystemEntry } from './ecosystem.js';
import type { Locale } from './i18n.js';

export const catalogModes = ['installable', 'included', 'profile', 'indexed'] as const;
export type CatalogMode = (typeof catalogModes)[number];

export const initialCatalogCount = 24;

export type CatalogListItem =
  { origin: 'registry'; entry: CatalogEntry } | { origin: 'ecosystem'; entry: EcosystemEntry };

// Community installables lead so the first screen is useful plugins, not Harness internals.
// Built-in modules follow; ecosystem candidates that are not already Registry records trail.
export const catalogListItems: CatalogListItem[] = [
  ...communityEntries.map((entry) => ({ origin: 'registry' as const, entry })),
  ...marketplaceEntries
    .filter((entry) => entry.builtIn)
    .map((entry) => ({ origin: 'registry' as const, entry })),
  ...ecosystemCandidates.map((entry) => ({ origin: 'ecosystem' as const, entry })),
];

export function distributionMode(entry: CatalogEntry): Exclude<CatalogMode, 'indexed'> {
  if (entry.distribution.installable) return 'installable';
  if (entry.type === 'bundle') return 'profile';
  return 'included';
}

export function modeLabel(mode: CatalogMode, locale: Locale): string {
  const labels = {
    installable: { en: 'Installable', zh: '可安装' },
    included: { en: 'Included in DSH', zh: 'DSH 已内置' },
    profile: { en: 'Profile layer', zh: 'Profile 层' },
    indexed: { en: 'Ecosystem find', zh: '生态发现' },
  } as const;
  return labels[mode][locale];
}

const summaryLimit = 120;

function summarize(value: string): string {
  const text = value.trim();
  if (text.length <= summaryLimit) return text;
  return `${text.slice(0, summaryLimit - 1).replace(/[\s，、,;:.]+$/u, '')}…`;
}

export interface CatalogCardModel {
  origin: 'registry' | 'ecosystem';
  id: string;
  href: string;
  name: string;
  description: string;
  mode: CatalogMode;
  category: string;
  provenance: string;
  search: string;
  stars: number;
  updated: string;
}

export function catalogCard(
  item: CatalogListItem,
  locale: Locale,
  starsByRepository: Map<string, number>,
): CatalogCardModel {
  if (item.origin === 'registry') {
    const { entry } = item;
    const mode = distributionMode(entry);
    return {
      origin: 'registry',
      id: entry.slug,
      href: `/${locale}/plugins/${entry.slug}/`,
      name: displayName(entry),
      description: summarize(localized(entry.description, locale)),
      mode,
      category: entry.category,
      provenance: provenanceStatus(entry),
      search: [
        displayName(entry),
        localized(entry.description, locale),
        entry.name,
        entry.source.repository,
        entry.category,
        mode,
      ]
        .join(' ')
        .toLocaleLowerCase(),
      stars: starsByRepository.get(entry.source.repository.toLocaleLowerCase()) ?? 0,
      updated: 'registry',
    };
  }

  const { entry } = item;
  return {
    origin: 'ecosystem',
    id: entry.id,
    href: entry.sourceRepository,
    name: entry.name,
    description: summarize(entry.description),
    mode: 'indexed',
    category: entry.category,
    provenance: 'ecosystem-indexed',
    search: [
      entry.name,
      entry.owner,
      entry.description,
      entry.resourceType,
      entry.category,
      entry.sourceRepository,
    ]
      .join(' ')
      .toLocaleLowerCase(),
    stars: entry.stars,
    updated: entry.updatedLabel,
  };
}
