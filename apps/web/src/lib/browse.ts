import { communityEntries, installableEntries, marketplaceEntries } from './catalog.js';
import { displayName, type CatalogEntry } from './catalog-types.js';
import { ecosystemEntries } from './ecosystem.js';
import type { Locale } from './i18n.js';
import { useCaseCounts, useCaseFor, type UseCaseId } from './use-cases.js';

// Topic auto-discovery writes this exact sentence whenever a repository exposes a valid
// bundle contract but no usable summary, so it is a description field with no content.
// Roughly a fifth of the registry is in that state; those records are searchable in the
// full catalog but are kept off the home page, where every row has to earn its space.
const generatedDescription = /is an automatically discovered DeepSeek Harness plugin bundle\.?$/iu;

export function hasWrittenDescription(entry: CatalogEntry): boolean {
  return !generatedDescription.test(entry.description.en.trim());
}

// Catalog order puts the 171 built-in Harness modules first, which would open the wall on
// internal seams like `dsh-api-gateway` and `dsh-client-hmr`. Community plugins lead
// instead, in catalog order so the source-reviewed and submitted records come before the
// auto-discovered tail; the built-in modules follow.
export const browsableEntries = [
  ...communityEntries.filter(hasWrittenDescription),
  ...marketplaceEntries.filter((entry) => entry.builtIn && hasWrittenDescription(entry)),
];

export const browseUseCases = useCaseCounts(browsableEntries);

export const browseTotals = {
  browsable: browsableEntries.length,
  registry: marketplaceEntries.length,
  installable: installableEntries.length,
  withoutDescription: marketplaceEntries.length - browsableEntries.length,
};

const starsByRepository = new Map(
  ecosystemEntries.map((entry) => [entry.sourceRepository.toLocaleLowerCase(), entry.stars]),
);

export function starsFor(entry: CatalogEntry): number {
  return starsByRepository.get(entry.source.repository.toLocaleLowerCase()) ?? 0;
}

// Built-in modules all resolve to the Harness monorepo, so they would every one of them
// inherit its star count and crowd out the community plugins this list exists to surface.
export const communityHighlights = communityEntries
  .filter((entry) => hasWrittenDescription(entry) && starsFor(entry) > 0)
  .sort((left, right) => starsFor(right) - starsFor(left));

/** Rows rendered into the page itself; the rest arrive from the browse index on demand. */
export const initialTileCount = 60;

export interface BrowseTile {
  slug: string;
  name: string;
  description: string;
  useCase: UseCaseId;
}

// A tile clamps its summary to two lines, so anything past this is never painted but
// would still be paid for in the browse index, which carries every browsable record.
const summaryLimit = 120;

function summarize(value: string): string {
  const text = value.trim();
  if (text.length <= summaryLimit) return text;
  return `${text.slice(0, summaryLimit - 1).replace(/[\s，、,;:.]+$/u, '')}…`;
}

export function browseTile(entry: CatalogEntry, locale: Locale): BrowseTile {
  return {
    slug: entry.slug,
    name: displayName(entry),
    description: summarize(entry.description[locale] || entry.description.en),
    useCase: useCaseFor(entry),
  };
}
