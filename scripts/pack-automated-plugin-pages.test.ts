import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  packedPluginPageAssetPath as tsPackedPath,
  pluginPageShardIndex as tsShardIndex,
} from '../apps/server/src/plugin-page-shards.js';

import {
  assertCategoryPageSizeLimits,
  packAutomatedPluginPages,
} from './lib/pack-automated-plugin-pages.mjs';
import {
  packedPluginPageAssetPath,
  pluginPageShardIndex,
  WORKERS_STATIC_ASSET_FILE_LIMIT,
} from './lib/plugin-page-shards.mjs';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const write = (root: string, path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

const catalog = {
  entries: [
    { slug: 'dsh-genui', provenance: { status: 'community-reviewed' } },
    { slug: 'open-sea-skin', provenance: { status: 'community-automated' } },
  ],
};

describe('automated plugin page packing', () => {
  it('keeps the Worker TypeScript shard hash identical to the pack script', () => {
    for (const slug of ['open-sea-skin', 'dsh-genui', 'web-app', 'zh-plugin-name']) {
      expect(pluginPageShardIndex(slug)).toBe(tsShardIndex(slug));
    }
    expect(packedPluginPageAssetPath('zh', 7)).toBe(tsPackedPath('zh', 7));
  });

  it('moves automated HTML into locale shards and keeps reviewed pages as files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-plugin-pages-'));
    directories.push(root);
    const distRoot = join(root, 'apps/web/dist');
    write(distRoot, 'en/plugins/dsh-genui/index.html', '<p>reviewed</p>');
    write(distRoot, 'zh/plugins/dsh-genui/index.html', '<p>已审阅</p>');
    write(distRoot, 'en/plugins/open-sea-skin/index.html', '<p>automated en</p>');
    write(distRoot, 'zh/plugins/open-sea-skin/index.html', '<p>automated zh</p>');
    write(distRoot, 'en/plugins/index.html', '<p>listing</p>');

    const result = await packAutomatedPluginPages({ catalog, distRoot, root });
    expect(result.packed).toBe(2);
    expect(result.fileCount).toBeLessThanOrEqual(WORKERS_STATIC_ASSET_FILE_LIMIT);

    expect(readFileSync(join(distRoot, 'en/plugins/dsh-genui/index.html'), 'utf8')).toBe(
      '<p>reviewed</p>',
    );
    expect(() => readFileSync(join(distRoot, 'en/plugins/open-sea-skin/index.html'))).toThrow();

    const shardIndex = pluginPageShardIndex('open-sea-skin');
    const enShard = JSON.parse(
      readFileSync(join(distRoot, packedPluginPageAssetPath('en', shardIndex).slice(1)), 'utf8'),
    );
    const zhShard = JSON.parse(
      readFileSync(join(distRoot, packedPluginPageAssetPath('zh', shardIndex).slice(1)), 'utf8'),
    );
    expect(enShard['open-sea-skin']).toBe('<p>automated en</p>');
    expect(zhShard['open-sea-skin']).toBe('<p>automated zh</p>');
  });

  it('fails before deploy when the remaining file count exceeds the Workers Free limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-plugin-pages-limit-'));
    directories.push(root);
    const distRoot = join(root, 'apps/web/dist');
    write(distRoot, 'en/index.html', '<p>home</p>');
    write(distRoot, 'zh/index.html', '<p>首页</p>');

    await expect(
      packAutomatedPluginPages({ catalog, distRoot, fileLimit: 1, root }),
    ).rejects.toThrow(/allow 1 files/);
  });

  it('fails before deploy when a remaining file exceeds the 25 MiB Workers limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-plugin-pages-size-'));
    directories.push(root);
    const distRoot = join(root, 'apps/web/dist');
    write(distRoot, 'plugins.json', 'too-large');

    await expect(
      packAutomatedPluginPages({ catalog, distRoot, fileSizeLimit: 4, root }),
    ).rejects.toThrow(/larger than 4 bytes/);
  });

  it('fails before deploy when a category page exceeds the Workers per-file limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pack-plugin-pages-category-size-'));
    directories.push(root);
    const distRoot = join(root, 'apps/web/dist');
    write(distRoot, 'en/categories/ui-client/index.html', 'too-large');

    await expect(assertCategoryPageSizeLimits(distRoot, { fileSizeLimit: 4 })).rejects.toThrow(
      /Category topic pages must stay under 4 bytes/,
    );
  });
});
