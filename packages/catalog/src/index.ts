import catalogJson from './catalog.generated.json' with { type: 'json' };

export type CatalogEntryType = 'plugin' | 'bundle' | 'seam' | 'library';

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  version: string;
  license: string;
  type: CatalogEntryType;
  category: string;
  builtIn: boolean;
  description: { en: string; zh: string };
  source: { repository: string; directory: string; commit: string };
  runtime: {
    hostLoadable: boolean;
    configurable: boolean;
    client: false | { platform: string; inject: string[]; immediately?: boolean };
  };
  capabilities: {
    tools: string[];
    uiContributions: string[];
    uiSlotsDeclared: string[];
  };
  availability: { profiles: string[]; defaultWeb: boolean };
  distribution:
    | {
        installable: false;
        mode: 'built-in';
        activation: 'profile-layer';
        note: { en: string; zh: string };
      }
    | { installable: false; mode: 'built-in' };
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

export const catalog = catalogJson as Catalog;

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return catalog.entries.find((entry) => entry.slug === slug);
}

export default catalog;
