import type { APIContext } from 'astro';

import { catalogCard, catalogListItems, catalogModes, modeLabel } from '../../lib/catalog-list.js';
import { ecosystemEntries } from '../../lib/ecosystem.js';
import { isLocale, locales } from '../../lib/i18n.js';

export const prerender = true;

export function getStaticPaths() {
  return locales.map((lang) => ({ params: { lang } }));
}

export function GET({ params }: APIContext) {
  const locale = params.lang;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });

  const starsByRepository = new Map(
    ecosystemEntries.map((entry) => [entry.sourceRepository.toLocaleLowerCase(), entry.stars]),
  );

  const body = {
    schemaVersion: 1,
    locale,
    total: catalogListItems.length,
    modes: catalogModes,
    modeLabels: catalogModes.map((mode) => modeLabel(mode, locale)),
    // Positional tuples keep the catalog index small enough for client filter + incremental paint.
    rows: catalogListItems.map((item) => {
      const card = catalogCard(item, locale, starsByRepository);
      return [
        card.origin === 'registry' ? 0 : 1,
        card.id,
        card.href,
        card.name,
        card.description,
        catalogModes.indexOf(card.mode),
        card.category,
        card.provenance,
        card.search,
        card.stars,
        card.updated,
      ] as const;
    }),
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
