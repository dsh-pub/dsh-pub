import catalog, { getCatalogEntry } from './index.js';

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
      expect(entry.docs.readme.en).toEqual(expect.any(String));
      expect(entry.docs.readme.zh).toEqual(expect.any(String));
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
});
