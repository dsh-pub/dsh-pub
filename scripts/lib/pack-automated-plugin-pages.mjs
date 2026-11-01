import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import {
  packedPluginPageAssetPath,
  pluginPageShardIndex,
  PLUGIN_PAGE_ASSET_PREFIX,
  PLUGIN_PAGE_SHARD_COUNT,
  WORKERS_STATIC_ASSET_FILE_LIMIT,
  WORKERS_STATIC_ASSET_FILE_SIZE_LIMIT,
} from './plugin-page-shards.mjs';

const LOCALES = ['en', 'zh'];
const IGNORED_ASSET_NAMES = new Set(['.ds_store']);

const assetRelativePath = (root, filePath) => relative(root, filePath).split(sep).join('/');

const isIgnoredAsset = (name) => IGNORED_ASSET_NAMES.has(name.toLocaleLowerCase());

export async function listAssetFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (isIgnoredAsset(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAssetFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function assertWorkerAssetLimits(
  distRoot,
  {
    fileLimit = WORKERS_STATIC_ASSET_FILE_LIMIT,
    fileSizeLimit = WORKERS_STATIC_ASSET_FILE_SIZE_LIMIT,
  } = {},
) {
  const files = await listAssetFiles(distRoot);
  const oversized = [];
  for (const filePath of files) {
    const { size } = await stat(filePath);
    if (size > fileSizeLimit) {
      oversized.push(
        `${assetRelativePath(distRoot, filePath)} is ${size} bytes (limit ${fileSizeLimit})`,
      );
    }
  }
  if (oversized.length > 0) {
    throw new Error(
      `Workers Static Assets reject files larger than ${fileSizeLimit} bytes:\n${oversized.join('\n')}`,
    );
  }
  if (files.length > fileLimit) {
    throw new Error(
      `Workers Static Assets allow ${fileLimit} files on the Free plan; ${files.length} files remain in ${distRoot}.`,
    );
  }
  return { fileCount: files.length, fileLimit };
}

export async function assertCategoryPageSizeLimits(
  distRoot,
  { fileSizeLimit = WORKERS_STATIC_ASSET_FILE_SIZE_LIMIT } = {},
) {
  const oversized = [];
  for (const locale of LOCALES) {
    const categoryRoot = join(distRoot, locale, 'categories');
    let entries;
    try {
      entries = await readdir(categoryRoot, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pagePath = join(categoryRoot, entry.name, 'index.html');
      let size = 0;
      try {
        ({ size } = await stat(pagePath));
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }
      if (size > fileSizeLimit) {
        oversized.push(
          `${assetRelativePath(distRoot, pagePath)} is ${size} bytes (limit ${fileSizeLimit})`,
        );
      }
    }
  }

  if (oversized.length > 0) {
    throw new Error(
      `Category topic pages must stay under ${fileSizeLimit} bytes to satisfy Workers per-file limits:\n${oversized.join('\n')}`,
    );
  }
}

const automatedSlugs = (catalog) =>
  new Set(
    (catalog?.entries ?? [])
      .filter((entry) => entry?.provenance?.status === 'community-automated')
      .map((entry) => entry.slug)
      .filter((slug) => typeof slug === 'string' && slug.length > 0),
  );

const shardDirectory = (distRoot, locale) => join(distRoot, PLUGIN_PAGE_ASSET_PREFIX, locale);

const shardFilePath = (distRoot, locale, shardIndex) =>
  join(distRoot, packedPluginPageAssetPath(locale, shardIndex).slice(1));

async function writeShards(distRoot, locale, pages) {
  const grouped = Array.from({ length: PLUGIN_PAGE_SHARD_COUNT }, () => ({}));
  for (const [slug, html] of pages) {
    grouped[pluginPageShardIndex(slug)][slug] = html;
  }
  await mkdir(shardDirectory(distRoot, locale), { recursive: true });
  await Promise.all(
    grouped.map((body, shardIndex) =>
      writeFile(shardFilePath(distRoot, locale, shardIndex), JSON.stringify(body)),
    ),
  );
}

async function readAutomatedPage(distRoot, locale, slug) {
  const directory = join(distRoot, locale, 'plugins', slug);
  try {
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    return { directory, html };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function packAutomatedPluginPages({
  root,
  catalog,
  distRoot = join(root, 'apps/web/dist'),
  fileLimit = WORKERS_STATIC_ASSET_FILE_LIMIT,
  fileSizeLimit = WORKERS_STATIC_ASSET_FILE_SIZE_LIMIT,
} = {}) {
  if (!root) throw new Error('packAutomatedPluginPages requires a repository root');
  const resolvedCatalog =
    catalog ??
    JSON.parse(await readFile(join(root, 'packages/catalog/src/community.generated.json'), 'utf8'));
  const slugs = automatedSlugs(resolvedCatalog);
  let packed = 0;

  for (const locale of LOCALES) {
    const pages = [];
    for (const slug of slugs) {
      const page = await readAutomatedPage(distRoot, locale, slug);
      if (!page) continue;
      pages.push([slug, page.html]);
      await rm(page.directory, { recursive: true, force: true });
    }
    if (pages.length > 0) {
      await writeShards(distRoot, locale, pages);
      packed += pages.length;
    }
  }

  if (packed > 0) {
    await mkdir(join(distRoot, PLUGIN_PAGE_ASSET_PREFIX), { recursive: true });
    await writeFile(
      join(distRoot, PLUGIN_PAGE_ASSET_PREFIX, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        packed,
        shardCount: PLUGIN_PAGE_SHARD_COUNT,
      }),
    );
  }

  await assertCategoryPageSizeLimits(distRoot, { fileSizeLimit });
  const limits = await assertWorkerAssetLimits(distRoot, { fileLimit, fileSizeLimit });
  return { packed, slugs: slugs.size, ...limits };
}
