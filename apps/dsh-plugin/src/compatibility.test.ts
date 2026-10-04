import semver from 'semver';

import manifest from '../package.json' with { type: 'json' };

const desktopRuntimes = ['0.2.0-rc.2', '0.2.0'];

describe('DSH desktop peer compatibility', () => {
  it('accepts the desktop runtime for every @deepseek-ai/dsh peer', () => {
    const peers = Object.entries(manifest.peerDependencies).filter(
      ([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'),
    );

    expect(peers.map(([name]) => name).sort()).toEqual([
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-slots',
    ]);

    for (const runtime of desktopRuntimes) {
      for (const [name, range] of peers) {
        expect(
          semver.satisfies(runtime, range, { includePrerelease: true }),
          `${name} ${range} should accept dsh ${runtime}`,
        ).toBe(true);
      }
    }
  });
});
