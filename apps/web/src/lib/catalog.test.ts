import { describe, expect, it } from 'vitest';

import {
  builtInEntries,
  bundleEntries,
  catalog,
  communityEntries,
  featuredEntries,
  installableEntries,
} from './catalog.js';
import {
  installCommand,
  installMetricSlug,
  localized,
  provenanceStatus,
  sourceUrl,
} from './catalog-types.js';

describe('web catalog projection', () => {
  it('keeps source-backed totals and install boundaries visible', () => {
    expect(catalog.totals).toMatchObject({
      packages: 219,
      plugins: 170,
      seams: 15,
      libraries: 34,
      bundles: 3,
    });
    expect(installableEntries).toHaveLength(5);
    expect(bundleEntries).toHaveLength(3);
    expect(builtInEntries.length).toBe(170);
    expect(bundleEntries.every((entry) => entry.distribution.activation === 'profile-layer')).toBe(
      true,
    );
  });

  it('merges reviewed community entries without changing official totals', () => {
    expect(communityEntries).toHaveLength(5);
    expect(
      communityEntries.every((entry) => provenanceStatus(entry) === 'community-reviewed'),
    ).toBe(true);
    expect(communityEntries.every((entry) => entry.distribution.installable)).toBe(true);
    expect(new Set([...builtInEntries, ...communityEntries].map((entry) => entry.slug)).size).toBe(
      builtInEntries.length + communityEntries.length,
    );
  });

  it('builds pinned root-repository install commands without an empty path flag', () => {
    const genui = communityEntries.find((entry) => entry.slug === 'dsh-genui');
    expect(genui).toBeDefined();
    if (!genui) return;
    const command = installCommand(genui);
    expect(command).toBe(
      'npx dshpub add omdsh-dev/dsh-genui --ref 57b4338222632f8ea81c2665d44e5f9e80b52686',
    );
    expect(command).not.toContain('--path');
    expect(sourceUrl(genui)).toBe(
      'https://github.com/omdsh-dev/dsh-genui/tree/57b4338222632f8ea81c2665d44e5f9e80b52686',
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
