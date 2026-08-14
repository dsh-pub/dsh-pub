import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import builtInCatalog from '../../../packages/catalog/src/catalog.generated.json' with { type: 'json' };
import communityCatalog from '../../../packages/catalog/src/community.generated.json' with { type: 'json' };
import { registryTopics, topicForCategory } from '../../../packages/catalog/src/topics.ts';

interface RawEntry {
  slug: string;
  name: string;
  description: { en: string; zh: string };
  type: 'plugin' | 'bundle' | 'seam' | 'library';
  category: string;
  builtIn: boolean;
  provenance?: { status: string };
  source: { repository: string; directory: string; commit: string };
  runtime: {
    hostLoadable: boolean | null;
    client?: null | false | true | { inject?: string[]; injects?: string[] };
    hostInjects?: string[];
  };
  capabilities: {
    tools: unknown[] | null;
    uiContributions: unknown[] | null;
    uiSlotsDeclared: unknown[] | null;
  };
  distribution: { installable: boolean };
}

function compact(entry: RawEntry) {
  const surfaces: Array<'host' | 'client' | 'profile'> = [];
  if (entry.runtime.hostLoadable) surfaces.push('host');
  if (entry.runtime.client) surfaces.push('client');
  if (entry.type === 'bundle' && surfaces.length === 0) surfaces.push('profile');

  const clientInjects =
    entry.runtime.client && typeof entry.runtime.client === 'object'
      ? (entry.runtime.client.inject ?? entry.runtime.client.injects ?? [])
      : [];
  const capabilityCount =
    (entry.capabilities.tools?.length ?? 0) +
    (entry.capabilities.uiContributions?.length ?? 0) +
    (entry.capabilities.uiSlotsDeclared?.length ?? 0) +
    (entry.runtime.hostInjects?.length ?? 0) +
    clientInjects.length;

  return {
    slug: entry.slug,
    name: entry.name.replace('@deepseek-ai/dsh-', 'dsh-'),
    description: entry.description,
    topic: topicForCategory(entry.category).id,
    category: entry.category,
    type: entry.type as 'plugin' | 'bundle',
    provenance: entry.builtIn ? ('built-in' as const) : ('community' as const),
    surfaces,
    installable: entry.distribution.installable,
    capabilityCount,
    repository: entry.source.repository,
    directory: entry.source.directory,
    commit: entry.source.commit,
  };
}

const publicEntries = [
  ...(builtInCatalog.entries as RawEntry[]),
  ...(communityCatalog.entries as RawEntry[]),
].filter((entry) => entry.type === 'plugin' || entry.type === 'bundle');

const snapshot = {
  schemaVersion: 1,
  sources: {
    builtIn: builtInCatalog.source,
    community: communityCatalog.source,
  },
  topics: registryTopics.map(({ id, label }) => ({ id, label })),
  entries: publicEntries.map(compact),
};

const output = fileURLToPath(new URL('../src/client/catalog.generated.json', import.meta.url));
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
