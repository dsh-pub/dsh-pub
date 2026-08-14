import catalogJson from './catalog.generated.json' with { type: 'json' };
import communityCatalogJson from './community.generated.json' with { type: 'json' };

export type CatalogEntryType = 'plugin' | 'bundle' | 'seam' | 'library';

export type CatalogProvenance =
  | { status: 'built-in' }
  | {
      status: 'community-reviewed';
      discoveredVia: 'github-topic:dsh-plugin';
      reviewedAt: string;
      statement: { en: string; zh: string };
    }
  | {
      status: 'community-submitted';
      submittedVia: 'github-pull-request';
      submittedAt: string;
      pullRequest: string;
      statement: { en: string; zh: string };
    }
  | {
      status: 'community-automated';
      discoveredVia: 'github-topic:dsh-plugin';
      analyzedAt: string;
      statement: { en: string; zh: string };
    };

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  license: string;
  type: CatalogEntryType;
  category: string;
  builtIn: boolean;
  provenance?: CatalogProvenance;
  analysis?: {
    method: 'automated-static-contract';
    revision: 1;
    status: 'verified';
    checks: Record<string, boolean>;
  };
  description: { en: string; zh: string };
  source: { repository: string; directory: string; commit: string };
  runtime: {
    hostLoadable: boolean | null;
    configurable: boolean | null;
    client:
      | null
      | false
      | {
          platform: string;
          inject?: string[];
          injects?: string[];
          immediately?: boolean;
        };
  };
  capabilities: {
    tools: Array<string | { name: string; description?: string; writes?: string[] }> | null;
    uiContributions: Array<string | { slot: string; id?: string; component?: string }> | null;
    uiSlotsDeclared: Array<string | { slot: string; kind?: string; scope?: string }> | null;
  };
  availability: {
    profiles: string[] | null;
    defaultWeb: boolean | 'enabled' | 'disabled' | 'conditional' | 'absent' | null;
    bundles?: string[];
    presets?: string[];
  };
  distribution:
    | {
        installable: false;
        mode: 'built-in';
        activation: 'profile-layer';
        note: { en: string; zh: string };
      }
    | { installable: false; mode: 'built-in' }
    | {
        installable: true;
        mode: 'git-bundle';
        activation: 'profile-layer';
        note: { en: string; zh: string };
      };
  docs: {
    readmePath: string;
    readmeZhPath: string;
    readme: { en: string; zh: string };
    modelExperience: { en: string; zh: string };
    limitations: { en: string; zh: string };
  };
}

export interface Catalog {
  source: { repository: string; commit: string; generatedAt: string };
  totals: {
    packages: number;
    plugins: number;
    seams: number;
    libraries: number;
    bundles: number;
    configurable: number;
    client: number;
  };
  entries: CatalogEntry[];
}

export interface CommunityCatalog {
  source: {
    repository: string;
    generatedAt: string;
    policy:
      | 'curated-pinned-source-contracts'
      | 'pinned-source-contracts'
      | 'automated-pinned-source-contracts';
  };
  totals: { reviewed: number; submitted?: number; automated?: number; installable: number };
  entries: CatalogEntry[];
}

export const catalog = catalogJson as Catalog;
export const communityCatalog = communityCatalogJson as CommunityCatalog;
export const allCatalogEntries = [...catalog.entries, ...communityCatalog.entries];

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return allCatalogEntries.find((entry) => entry.slug === slug);
}

export default catalog;
