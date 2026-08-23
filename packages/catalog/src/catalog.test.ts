import communitySources from './community.sources.json';
import catalog, { communityCatalog, getCatalogEntry } from './index.js';
import installableRegistry from '../../../apps/server/src/installable-slugs.generated.json';

const slugPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const installMetricSlug = (repository: string, directory: string) => {
  const url = new URL(repository);
  const repositorySlug = url.pathname.replace(/^\//, '').split('/').map(slugPart).join('--');
  const directorySlug = directory.split('/').map(slugPart).filter(Boolean).join('--');
  return directorySlug ? `${repositorySlug}--${directorySlug}` : repositorySlug;
};

describe('Harness catalog snapshot', () => {
  it('keeps Loader classification totals and bundle overlays distinct', () => {
    expect(catalog.totals).toMatchObject({
      packages: 219,
      plugins: 170,
      seams: 15,
      libraries: 34,
      bundles: 3,
      configurable: 105,
      client: 39,
    });
    expect(catalog.totals.plugins + catalog.totals.seams + catalog.totals.libraries).toBe(
      catalog.totals.packages,
    );
    expect(catalog.entries).toHaveLength(catalog.totals.packages);
    expect(catalog.entries.filter((entry) => entry.runtime.hostLoadable)).toHaveLength(170);
  });

  it('publishes stable required fields for every entry', () => {
    for (const entry of catalog.entries) {
      expect(entry.id).toBe(entry.name);
      expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.name).toMatch(/^@deepseek-ai\/dsh-/);
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(entry.license).toBeTruthy();
      expect(['plugin', 'bundle', 'seam', 'library']).toContain(entry.type);
      expect(entry.description.en).toBeTruthy();
      expect(entry.description.zh).toBeTruthy();
      expect(entry.source.commit).toBe(catalog.source.commit);
      expect(entry.source.directory).toMatch(/^packages\/[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(entry.capabilities.tools).toEqual(expect.any(Array));
      expect(entry.capabilities.uiContributions).toEqual(expect.any(Array));
      expect(entry.capabilities.uiSlotsDeclared).toEqual(expect.any(Array));
      expect(entry.availability.profiles).toEqual(expect.any(Array));
      expect(entry.docs.readmePath).toMatch(/^packages\//);
      expect(entry.docs.readme.en).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/deepseek-ai\/deepseek-harness\//,
      );
      expect(entry.docs.readme.zh).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/deepseek-ai\/deepseek-harness\//,
      );
    }
    const shellEnv = catalog.entries.find((entry) => entry.name === '@deepseek-ai/dsh-shell-env');
    const uiPlan = catalog.entries.find(
      (entry) => entry.name === '@deepseek-ai/dsh-client-ui-plan',
    );
    expect(shellEnv?.docs.modelExperience.zh).not.toBe('');
    expect(shellEnv?.docs.limitations.zh).not.toBe('');
    expect(uiPlan?.docs.limitations.zh).not.toBe('');
  });

  it('keeps manifest-declared bundles as included profile layers, not install targets', () => {
    const installable = catalog.entries.filter((entry) => entry.distribution.installable);
    expect(installable).toHaveLength(0);
    const bundles = catalog.entries.filter((entry) => entry.type === 'bundle');
    expect(bundles.map((entry) => entry.name).sort()).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-headless',
      '@deepseek-ai/dsh-web-app',
    ]);
    for (const entry of catalog.entries) {
      expect(entry.distribution.installable).toBe(false);
      expect(entry.distribution.mode).toBe('built-in');
      expect(entry.distribution).not.toHaveProperty('command');
      if (entry.type === 'bundle') {
        expect(entry.distribution.activation).toBe('profile-layer');
        expect(entry.distribution.note.en).toContain('does not prove');
        expect(entry.distribution.note.zh).toContain('不代表');
      } else {
        expect(entry.distribution).not.toHaveProperty('activation');
      }
    }
    expect(getCatalogEntry('base')?.availability.profiles).toEqual(['base', 'headless', 'web']);
    expect(getCatalogEntry('missing-plugin')).toBeUndefined();
  });

  it('keeps the community collection separate, pinned, and source-contract reviewed', () => {
    expect(communityCatalog.entries).toHaveLength(communitySources.entries.length);
    expect(communityCatalog.totals).toEqual({
      reviewed: communityCatalog.entries.filter(
        (entry) => entry.provenance?.status === 'community-reviewed',
      ).length,
      submitted: communityCatalog.entries.filter(
        (entry) => entry.provenance?.status === 'community-submitted',
      ).length,
      automated: communityCatalog.entries.filter(
        (entry) => entry.provenance?.status === 'community-automated',
      ).length,
      installable: communityCatalog.entries.filter((entry) => entry.distribution.installable)
        .length,
    });

    const officialSlugs = new Set(catalog.entries.map((entry) => entry.slug));
    const communitySlugs = new Set<string>();

    for (const entry of communityCatalog.entries) {
      const source = communitySources.entries.find(
        (candidate) =>
          candidate.repository === entry.source.repository &&
          candidate.directory === entry.source.directory,
      );
      expect(source).toBeDefined();
      expect(entry.source.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(entry.source.commit).toBe(source?.commit);
      expect(entry.source.directory).toBe(source?.directory);
      expect(entry.name).toBe(source?.packageName);
      expect(['community-reviewed', 'community-submitted', 'community-automated']).toContain(
        entry.provenance?.status,
      );
      expect(entry.provenance?.statement.en).toContain('security audit');
      expect(entry.provenance?.statement.zh).toContain('安全审计');
      expect(entry.distribution).toMatchObject({
        installable: true,
        mode: 'git-bundle',
        activation: 'profile-layer',
      });
      expect(officialSlugs.has(entry.slug)).toBe(false);
      expect(communitySlugs.has(entry.slug)).toBe(false);
      communitySlugs.add(entry.slug);
    }

    expect(getCatalogEntry('dsh-genui')?.source.repository).toBe(
      'https://github.com/omdsh-dev/dsh-genui',
    );
    expect(getCatalogEntry('dsh-at-file')?.capabilities.uiContributions).toEqual([
      { slot: 'conversation.input.dock', id: 'at-file', component: 'FilesDock' },
      { slot: 'settings.section', id: 'at-file', component: 'AtFileSection' },
    ]);
    expect(getCatalogEntry('dsh-genui')?.capabilities).toMatchObject({
      tools: [{ name: 'render_ui' }, { name: 'validate_dsh_ui' }],
      uiContributions: [
        { slot: 'tool.call.toolview', id: 'render_ui', component: 'GenuiToolView' },
        { slot: 'conversation.input.dock', id: 'genui-panel', component: 'GenuiPanel' },
      ],
    });
    expect(getCatalogEntry('dsh-cc-tui')?.capabilities.uiContributions).toEqual([]);
    expect(getCatalogEntry('dsh-automation')?.capabilities).toMatchObject({
      tools: [
        { name: 'automation_create' },
        { name: 'automation_list' },
        { name: 'automation_update' },
        { name: 'automation_runs' },
        { name: 'automation_run_now' },
        { name: 'automation_delete' },
      ],
      uiContributions: [
        { slot: 'conversation.view', id: 'automation', component: 'AutomationView' },
      ],
    });
    expect(
      communityCatalog.entries
        .map((entry) => installMetricSlug(entry.source.repository, entry.source.directory))
        .sort(),
    ).toEqual([...installableRegistry.slugs].sort());
  });
});
