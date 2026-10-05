import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createExcludedRepositorySet,
  isExcludedRepository,
  loadExcludedRepositories,
  parseExcludedRepositoryList,
} from './lib/excluded-repositories.mjs';

describe('publisher catalog exclusions', () => {
  it('loads the checked-in publisher delistings', () => {
    const excluded = loadExcludedRepositories();

    expect(
      isExcludedRepository('https://github.com/GooDAnDReaDY/dsh-fal-image-gen', excluded),
    ).toBe(true);
    expect(
      isExcludedRepository('https://github.com/GooDAnDReaDY/dsh-im-hub-media/', excluded),
    ).toBe(true);
    expect(isExcludedRepository('https://github.com/GooDAnDReaDY/dsh-image-gen', excluded)).toBe(
      false,
    );
  });

  it('normalizes coordinates and rejects an invalid list', () => {
    expect([...createExcludedRepositorySet(['https://github.com/Example/Repo/'])].sort()).toEqual([
      'https://github.com/example/repo',
    ]);
    expect(() => parseExcludedRepositoryList({ schemaVersion: 1, repositories: [{}] })).toThrow(
      'repository coordinates',
    );

    const path = join(mkdtempSync(join(tmpdir(), 'excluded-repos-')), 'excluded.json');
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        repositories: [{ repository: 'https://github.com/Example/blocked' }],
      }),
    );
    expect(
      isExcludedRepository('https://github.com/example/blocked', loadExcludedRepositories(path)),
    ).toBe(true);
  });
});
