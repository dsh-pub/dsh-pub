import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { check } from 'prettier';
import { describe, expect, it } from 'vitest';

import { writeFormattedJson } from './lib/json-file.mjs';

describe('generated JSON files', () => {
  it('preserves the data and satisfies the repository formatter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-pub-json-'));
    const path = join(directory, 'nested', 'catalog.json');
    const value = {
      entries: [
        {
          description:
            'A long source-derived description that exercises the same wrapping behavior as generated catalog entries.',
          profiles: ['default', 'web'],
          repository: 'https://github.com/example/dsh-clock',
        },
      ],
    };

    try {
      await writeFormattedJson(path, value);
      const content = await readFile(path, 'utf8');

      expect(JSON.parse(content)).toEqual(value);
      expect(await check(content, { parser: 'json', printWidth: 100 })).toBe(true);
      expect(content.endsWith('\n')).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
