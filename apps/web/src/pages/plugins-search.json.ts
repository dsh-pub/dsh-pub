import { buildPluginSearchIndex } from '@dsh-pub/catalog/plugin-search';

import { communityCatalog, marketplaceEntries } from '../lib/catalog.js';

export const prerender = true;

/**
 * Compact search projection of the registry, consumed by the `/api/plugins`
 * Worker route. `/plugins.json` stays the complete public document; this file
 * exists only so server-side search can run without carrying that document.
 */
export const GET = () => {
  const body = buildPluginSearchIndex(marketplaceEntries, communityCatalog.source.generatedAt);
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
