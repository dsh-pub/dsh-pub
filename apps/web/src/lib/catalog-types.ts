import type { Locale } from './i18n.js';

export type CatalogType = 'plugin' | 'bundle' | 'seam' | 'library';

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  license: string;
  type: CatalogType;
  category: string;
  builtIn: boolean;
  description: LocalizedText;
  docs?: {
    readme?: Partial<LocalizedText>;
    modelExperience?: Partial<LocalizedText>;
    limitations?: Partial<LocalizedText>;
  };
  source: {
    repository: string;
    directory: string;
    commit: string;
  };
  runtime: {
    hostLoadable: boolean;
    configurable: boolean;
    client?: boolean | { platform?: string; injects?: string[] };
    hostInjects?: string[];
  };
  capabilities: {
    tools: Array<{ name: string; description?: string; writes?: string[] }>;
    uiContributions: Array<{ slot: string; id?: string; component?: string }>;
    uiSlotsDeclared: Array<{ slot: string; kind?: string; scope?: string }>;
  };
  availability: {
    profiles: string[];
    defaultWeb: boolean | 'enabled' | 'disabled' | 'conditional' | 'absent';
    bundles?: string[];
    presets?: string[];
  };
  distribution: {
    installable: boolean;
    mode: 'built-in' | 'bundle' | 'included' | 'git-bundle' | 'package';
    activation?: 'profile-layer';
    note?: LocalizedText;
    command?: string;
  };
}

export interface CatalogData {
  source: {
    repository: string;
    commit: string;
    generatedAt?: string;
  };
  totals: {
    packages: number;
    plugins: number;
    seams: number;
    libraries: number;
    bundles: number;
    configurable?: number;
    client?: number;
  };
  entries: CatalogEntry[];
}

export function localized(text: Partial<LocalizedText> | undefined, locale: Locale): string {
  return text?.[locale] || text?.en || text?.zh || '';
}

export function sourceUrl(entry: CatalogEntry): string {
  const repository = entry.source.repository.replace(/\.git$/, '');
  return `${repository}/tree/${entry.source.commit}/${entry.source.directory}`;
}

export function displayName(entry: CatalogEntry): string {
  return entry.name.replace('@deepseek-ai/dsh-', 'dsh-');
}

const metricSlugPart = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function installMetricSlug(entry: CatalogEntry): string {
  const repository = new URL(entry.source.repository).pathname.replace(/^\/|\/$/g, '');
  return [...repository.split('/'), ...entry.source.directory.split('/')]
    .map(metricSlugPart)
    .filter(Boolean)
    .join('--');
}
