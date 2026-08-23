import type { APIContext } from 'astro';

import { browsableEntries, browseTile } from '../../lib/browse.js';
import { isLocale, locales } from '../../lib/i18n.js';
import { useCaseIds, useCaseLabel } from '../../lib/use-cases.js';

export const prerender = true;

export function getStaticPaths() {
  return locales.map((lang) => ({ params: { lang } }));
}

// The home page wall covers the whole browsable catalog, which is far too much markup to
// ship in the document. It renders the first rows server-side and pulls the rest from
// here the first time a visitor filters or scrolls past them. Rows are positional tuples
// and the use case is an index into `useCases`, which keeps the payload roughly a third
// of what an object-per-entry index would cost.
export function GET({ params }: APIContext) {
  const locale = params.lang;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });

  const body = {
    schemaVersion: 1,
    locale,
    total: browsableEntries.length,
    useCases: useCaseIds,
    useCaseLabels: useCaseIds.map((id) => useCaseLabel(id, locale)),
    rows: browsableEntries.map((entry) => {
      const tile = browseTile(entry, locale);
      return [tile.slug, tile.name, tile.description, useCaseIds.indexOf(tile.useCase)];
    }),
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
