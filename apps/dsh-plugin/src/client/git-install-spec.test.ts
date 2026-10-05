import { describe, expect, it } from 'vitest';

import { directoryGitInstallSpec } from './git-install-spec.js';

const commit = 'a'.repeat(40);

describe('directory git install spec', () => {
  it('pins an installable GitHub repository to its catalog commit', () => {
    expect(
      directoryGitInstallSpec({
        installable: true,
        repository: 'https://github.com/example/beta-tools',
        directory: '',
        commit,
      }),
    ).toBe(`github:example/beta-tools#${commit}`);
  });

  it('keeps a safe relative directory as a pnpm path selector', () => {
    expect(
      directoryGitInstallSpec({
        installable: true,
        repository: 'https://github.com/example/beta-tools.git/',
        directory: 'packages/web',
        commit,
      }),
    ).toBe(`github:example/beta-tools#${commit}&path:/packages/web`);
  });

  it('refuses built-ins, non-GitHub hosts, and unsafe paths', () => {
    expect(
      directoryGitInstallSpec({
        installable: false,
        repository: 'https://github.com/example/beta-tools',
        directory: '',
        commit,
      }),
    ).toBeNull();
    expect(
      directoryGitInstallSpec({
        installable: true,
        repository: 'https://gitlab.com/example/beta-tools',
        directory: '',
        commit,
      }),
    ).toBeNull();
    expect(
      directoryGitInstallSpec({
        installable: true,
        repository: 'https://github.com/example/beta-tools',
        directory: '../outside',
        commit,
      }),
    ).toBeNull();
    expect(
      directoryGitInstallSpec({
        installable: true,
        repository: 'https://github.com/example/beta-tools',
        directory: '',
        commit: 'main',
      }),
    ).toBeNull();
  });
});
