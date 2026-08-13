import { describe, expect, it } from 'vitest';

import {
  builtInEntries,
  bundleEntries,
  catalog,
  featuredEntries,
  installableEntries,
} from './catalog.js';
import { installMetricSlug, localized, sourceUrl } from './catalog-types.js';

describe('web catalog projection', () => {
  it('keeps source-backed totals and install boundaries visible', () => {
    expect(catalog.totals).toMatchObject({
      packages: 219,
      plugins: 170,
      seams: 15,
      libraries: 34,
      bundles: 3,
    });
    expect(installableEntries).toHaveLength(0);
    expect(bundleEntries).toHaveLength(3);
    expect(builtInEntries.length).toBe(170);
    expect(bundleEntries.every((entry) => entry.distribution.activation === 'profile-layer')).toBe(
      true,
    );
  });

  it('provides bilingual text and pinned source links', () => {
    const entry = featuredEntries[0] ?? builtInEntries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(localized(entry.description, 'en')).not.toHaveLength(0);
    expect(localized(entry.description, 'zh')).not.toHaveLength(0);
    expect(sourceUrl(entry)).toContain(entry.source.commit);
    expect(sourceUrl(entry)).toContain(entry.source.directory);
  });

  it('adds known high-value capability coordinates without changing source truth', () => {
    const trajectory = builtInEntries.find((entry) => entry.slug === 'client-ui-trajectory');
    const bash = builtInEntries.find((entry) => entry.slug === 'tool-bash');
    expect(trajectory?.capabilities.uiContributions[0]?.slot).toBe('conversation.view');
    expect(bash?.capabilities.tools[0]?.name).toBe('bash');
  });

  it('keeps bundle metric slugs deterministic without claiming the built-ins are installable', () => {
    const webBundle = bundleEntries.find((entry) => entry.slug === 'web-app');
    expect(webBundle && installMetricSlug(webBundle)).toBe(
      'deepseek-ai--deepseek-harness--packages--bundle--web-app',
    );
  });
});
