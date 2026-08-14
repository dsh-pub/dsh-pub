import type { Locale } from './i18n.js';

export type CatalogType = 'plugin' | 'bundle' | 'seam' | 'library';

export interface LocalizedText {
  en: string;
  zh: string;
}

export type CatalogProvenance =
  | { status: 'built-in' }
  | {
      status: 'community-reviewed';
      discoveredVia: 'github-topic:dsh-plugin';
      reviewedAt: string;
      statement: LocalizedText;
    }
  | {
      status: 'community-submitted';
      submittedVia: 'github-issue';
      submittedAt: string;
      issue: string;
      statement: LocalizedText;
    }
  | {
      status: 'community-automated';
      discoveredVia: 'github-topic:dsh-plugin';
      analyzedAt: string;
      statement: LocalizedText;
    };

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  license: string;
  type: CatalogType;
  category: string;
  builtIn: boolean;
  provenance?: CatalogProvenance;
  analysis?: {
    method: 'automated-static-contract';
    revision: 1;
    status: 'verified';
    checks: Record<string, boolean>;
  };
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
    hostLoadable: boolean | null;
    configurable: boolean | null;
    client?: null | boolean | { platform?: string; inject?: string[]; injects?: string[] };
    hostInjects?: string[];
  };
  capabilities: {
    tools: Array<{ name: string; description?: string; writes?: string[] }> | null;
    uiContributions: Array<{ slot: string; id?: string; component?: string }> | null;
    uiSlotsDeclared: Array<{ slot: string; kind?: string; scope?: string }> | null;
  };
  availability: {
    profiles: string[] | null;
    defaultWeb: boolean | 'enabled' | 'disabled' | 'conditional' | 'absent' | null;
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
  const path = entry.source.directory ? `/${entry.source.directory}` : '';
  return `${repository}/tree/${entry.source.commit}${path}`;
}

export function sourceCoordinate(entry: CatalogEntry): string {
  return new URL(entry.source.repository).pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '');
}

export function provenanceStatus(entry: CatalogEntry): CatalogProvenance['status'] {
  return entry.provenance?.status ?? (entry.builtIn ? 'built-in' : 'community-reviewed');
}

export function installCommand(entry: CatalogEntry): string | undefined {
  if (!entry.distribution.installable) return undefined;
  const path = entry.source.directory ? ` --path ${entry.source.directory}` : '';
  return `npx dshpub add ${sourceCoordinate(entry)} --ref ${entry.source.commit}${path}`;
}

export function displayName(entry: CatalogEntry): string {
  return entry.name.replace('@deepseek-ai/dsh-', 'dsh-');
}

function fitSnippet(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).replace(/[，、,;:\s]+$/u, '')}…`;
}

export function seoDescription(entry: CatalogEntry, locale: Locale): string {
  const name = displayName(entry);
  if (locale === 'zh') {
    return fitSnippet(
      `在 dsh.pub 查看 ${name} 这款 DeepSeek Harness 插件的 ${entry.category} 能力、运行时、工具、UI 贡献、固定源码与安装方式。`,
      100,
    );
  }
  return fitSnippet(
    `Explore ${name}, a DeepSeek Harness (DSH) ${entry.category} ${entry.type}. Review its runtime, tools, UI contributions, pinned source, and install path.`,
    170,
  );
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
