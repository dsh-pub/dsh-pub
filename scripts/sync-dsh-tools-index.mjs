import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

const INDEX_URL = 'https://dsh.tools/plugins';
const MINIMUM_EXPECTED_ENTRIES = 100;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repoRoot, 'packages/catalog/src/ecosystem.generated.json');

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/gu, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;|&#39;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function plainText(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

function numberFrom(card, label) {
  const match = new RegExp(`(\\d[\\d,]*)\\s+${label}`, 'u').exec(plainText(card));
  return match ? Number.parseInt(match[1].replaceAll(',', ''), 10) : 0;
}

export function parseDshToolsIndex(html) {
  const entries = [];
  const cards = html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gu);

  for (const [, card] of cards) {
    const detailMatch = /href="(\/plugins\/([^"?#]+))"[^>]*>([\s\S]*?)<\/a>/u.exec(card);
    const sourceMatch = /href="(https:\/\/github\.com\/([^/"?#]+)\/([^"?#]+))"/u.exec(card);
    if (!detailMatch || !sourceMatch) continue;

    const ownerMatch = /<p class="[^"]*truncate text-xs[^"]*">([\s\S]*?)<\/p>/u.exec(card);
    const descriptionMatch = /<p class="[^"]*line-clamp-3[^"]*">([\s\S]*?)<\/p>/u.exec(card);
    const avatarMatch = /<img[^>]+src="([^"]+)"/u.exec(card);
    const tagBlock = /<div class="[^"]*flex flex-wrap gap-1\.5[^"]*">([\s\S]*?)<\/div>/u.exec(
      card,
    )?.[1];
    const tags = tagBlock
      ? [...tagBlock.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gu)].map((match) =>
          plainText(match[1]),
        )
      : [];
    const updatedMatch = /Updated\s+([^<]+)<\/div>/u.exec(card);
    const sourceRepository = sourceMatch[1].replace(/\/$/u, '');
    const sourceName = sourceMatch[3].replace(/\.git$/u, '');

    entries.push({
      id: `github:${sourceMatch[2].toLocaleLowerCase()}/${sourceName.toLocaleLowerCase()}`,
      slug: detailMatch[2],
      name: plainText(detailMatch[3]) || sourceName,
      owner: plainText(ownerMatch?.[1]) || sourceMatch[2],
      description: plainText(descriptionMatch?.[1]),
      sourceRepository,
      avatarUrl: avatarMatch?.[1] ?? '',
      resourceType: tags[0] || 'Ecosystem resource',
      category: tags[1] || 'Other',
      activity: tags[2] || 'Unknown',
      stars: numberFrom(card, 'stars'),
      forks: numberFrom(card, 'forks'),
      updatedLabel: updatedMatch ? plainText(updatedMatch[1]) : 'Unknown',
      detailUrl: new URL(detailMatch[1], INDEX_URL).href,
    });
  }

  return entries;
}

export async function syncDshToolsIndex({ fetchImpl = fetch, output = outputPath } = {}) {
  const response = await fetchImpl(INDEX_URL, {
    headers: { 'user-agent': 'dsh.pub ecosystem index sync (+https://dsh.pub)' },
  });
  if (!response.ok) throw new Error(`DSH.Tools index request failed with HTTP ${response.status}`);

  const entries = parseDshToolsIndex(await response.text());
  if (entries.length < MINIMUM_EXPECTED_ENTRIES) {
    throw new Error(
      `DSH.Tools index returned only ${entries.length} parseable plugin cards; refusing to replace the catalog`,
    );
  }

  const data = {
    source: {
      index: INDEX_URL,
      canonical: 'https://github.com/topics/dsh-plugin',
      generatedAt: new Date().toISOString(),
      policy: 'discovery-only-public-ecosystem-signals',
      statement: {
        en: 'Imported from the public DSH.Tools ecosystem index. Source repositories remain canonical. Indexed does not mean compatible, installable, reviewed, or safe.',
        zh: '从公开的 DSH.Tools 生态索引导入，源仓库仍是事实来源。被索引不代表兼容、可安装、已审核或安全。',
      },
    },
    totals: { indexed: entries.length },
    entries,
  };
  const json = await format(JSON.stringify(data), { parser: 'json' });
  await writeFile(output, json, 'utf8');
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await syncDshToolsIndex();
  console.log(`sync-dsh-tools-index: wrote ${data.totals.indexed} ecosystem records`);
}
