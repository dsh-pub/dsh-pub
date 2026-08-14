import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const cwd = dirname(fileURLToPath(import.meta.url));
const appRoot = join(cwd, '..');
const distRoot = join(appRoot, 'dist');
const host = '127.0.0.1';
let origin = `http://${host}`;

const build = spawnSync('npm', ['run', 'build'], {
  cwd: appRoot,
  encoding: 'utf8',
  env: { ...process.env, PUBLIC_GA_MEASUREMENT_ID: 'G-TEST123456' },
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', origin).pathname;
  const candidate = join(distRoot, pathname);
  const target = (await stat(candidate).catch(() => undefined))?.isDirectory()
    ? join(candidate, 'index.html')
    : candidate;
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': contentTypes[extname(target)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

async function assertPage(path, expected) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();
  if (!response.ok || !body.includes(expected)) {
    throw new Error(
      `${path} did not contain ${JSON.stringify(expected)} (status ${response.status}).`,
    );
  }
}

async function assertPageOmits(path, unexpected) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();
  if (!response.ok || body.includes(unexpected)) {
    throw new Error(
      `${path} unexpectedly contained ${JSON.stringify(unexpected)} (status ${response.status}).`,
    );
  }
}

async function assertStylesContain(path, expected) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();
  const stylesheets = [...body.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
  const styles = await Promise.all(
    stylesheets.map(async (stylesheet) => {
      if (!stylesheet) return '';
      return (await fetch(new URL(stylesheet, origin))).text();
    }),
  );
  if (!response.ok || ![body, ...styles].some((style) => style.includes(expected))) {
    throw new Error(`${path} styles did not contain ${JSON.stringify(expected)}.`);
  }
}

async function responseBody(path) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  return body;
}

function attribute(html, selector, name) {
  const tag = html.match(selector)?.[0];
  return tag?.match(new RegExp(`${name}="([^"]+)"`))?.[1];
}

async function assertSeoSurface() {
  const robots = await responseBody('/robots.txt');
  if (
    !robots.includes('User-agent: *') ||
    !robots.includes('Disallow: /api/') ||
    !robots.includes('Sitemap: https://dsh.pub/sitemap-index.xml')
  ) {
    throw new Error(`robots.txt is incomplete: ${JSON.stringify(robots)}`);
  }

  const sitemapIndex = await responseBody('/sitemap-index.xml');
  if (!sitemapIndex.includes('https://dsh.pub/sitemap-0.xml')) {
    throw new Error('sitemap-index.xml does not reference the generated sitemap.');
  }
  const sitemap = await responseBody('/sitemap-0.xml');
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/dsh\.pub\/[^<]*)<\/loc>/g)].map(
    (match) => match[1],
  );
  if (urls.length !== 358 || urls.includes('https://dsh.pub/')) {
    throw new Error(
      `Expected 358 indexable URLs without the locale redirect, received ${urls.length}.`,
    );
  }
  if (!sitemap.includes('hreflang="en"') || !sitemap.includes('hreflang="zh-CN"')) {
    throw new Error('The sitemap does not pair English and Chinese variants.');
  }

  for (const url of urls) {
    const productionUrl = new URL(url);
    const html = await responseBody(productionUrl.pathname);
    const canonical = attribute(html, /<link[^>]+rel="canonical"[^>]*>/, 'href');
    if (canonical !== url) throw new Error(`${url} has canonical ${canonical}.`);

    const alternates = [...html.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)].map(
      (match) => match[0],
    );
    const alternateLanguages = alternates.map((tag) => attribute(tag, /<link[^>]*>/, 'hreflang'));
    if (!['en', 'zh-CN', 'x-default'].every((language) => alternateLanguages.includes(language))) {
      throw new Error(`${url} is missing a complete hreflang cluster.`);
    }

    const description = attribute(html, /<meta[^>]+name="description"[^>]*>/, 'content') ?? '';
    const maxDescriptionLength = productionUrl.pathname.startsWith('/zh/') ? 100 : 170;
    if (!description || description.length > maxDescriptionLength) {
      throw new Error(`${url} has an invalid ${description.length}-character description.`);
    }
  }

  const homepage = await responseBody('/zh/');
  if (
    !homepage.includes('<title>dsh.pub — DeepSeek Harness 插件目录</title>') ||
    !homepage.includes('"@type":"WebSite"') ||
    !homepage.includes('googletagmanager.com/gtag/js?id=G-TEST123456')
  ) {
    throw new Error('The localized homepage SEO or conditional Analytics tag is incomplete.');
  }

  const detail = await responseBody('/en/plugins/dsh-genui/');
  for (const expected of ['"@type":"SoftwareSourceCode"', '"@type":"BreadcrumbList"']) {
    if (!detail.includes(expected)) throw new Error(`Plugin JSON-LD is missing ${expected}.`);
  }

  const imageResponse = await fetch(`${origin}/og/dsh-pub.png`);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  if (
    !imageResponse.ok ||
    imageResponse.headers.get('content-type') !== 'image/png' ||
    image.readUInt32BE(16) !== 1200 ||
    image.readUInt32BE(20) !== 630
  ) {
    throw new Error('The default social image must be a 1200 × 630 PNG.');
  }

  const brandResponse = await fetch(`${origin}/brand/dshbot.png`);
  const brand = Buffer.from(await brandResponse.arrayBuffer());
  if (
    !brandResponse.ok ||
    brandResponse.headers.get('content-type') !== 'image/png' ||
    brand.readUInt32BE(16) !== 256 ||
    brand.readUInt32BE(20) !== 256 ||
    brand.readUInt8(25) !== 6
  ) {
    throw new Error('The dsh.pub mascot must be a 256 × 256 RGBA PNG.');
  }
}

async function assertAgentGuide() {
  const response = await fetch(`${origin}/develop-plugin.md`);
  const body = await response.text();
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('text/markdown') ||
    !body.includes('# Develop a DeepSeek Harness plugin') ||
    !body.includes('dsh.bundle.patch') ||
    !body.includes('Before changing plugin code') ||
    !body.includes('window.__ModuleLoader__.load') ||
    !body.includes('does not prove row resolution') ||
    !body.includes('## Definition of done')
  ) {
    throw new Error('The remote Agent plugin-development guide is incomplete.');
  }

  for (const path of ['/en/', '/zh/']) {
    const page = await responseBody(path);
    if (!page.includes('href="/develop-plugin.md"')) {
      throw new Error(`${path} does not link to the Agent plugin-development guide.`);
    }
  }

  const llms = await responseBody('/llms.txt');
  if (!llms.includes('https://dsh.pub/develop-plugin.md')) {
    throw new Error('llms.txt does not advertise the Agent plugin-development guide.');
  }
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, host, resolve);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Web E2E server did not expose a TCP port.');
}
origin = `http://${host}:${address.port}`;

try {
  await assertSeoSurface();
  await assertAgentGuide();
  await assertPage('/en/', 'Everything is a plugin');
  await assertPage('/zh/', '一切皆插件');
  await assertPage('/zh/', 'src="/brand/dshbot.png"');
  await assertPageOmits('/zh/', '目录源码');
  await assertPage('/en/plugins/', 'Browse plugins');
  await assertPage('/en/plugins/?provenance=community-reviewed', 'Community · source reviewed');
  await assertPage('/en/plugins/', 'data-provenance="community-reviewed"');
  await assertStylesContain('/en/plugins/', '[hidden]{display:none}');
  await assertPage('/zh/plugins/client-ui-trajectory/', 'dsh-client-ui-trajectory');
  await assertPage('/zh/plugins/web-app/', '内置 Profile 层');
  await assertPage('/zh/plugins/web-app/', '<code>cordis.patch.yml</code>');
  await assertPage('/zh/plugins/web-app/', 'data-technical-overview');
  await assertPage('/zh/plugins/web-app/', '不适用 CLI 安装量');
  await assertPageOmits('/zh/plugins/web-app/', 'npx dshpub add');
  await assertPage('/zh/plugins/dsh-genui/', 'omdsh-dev / dsh-genui');
  await assertPage(
    '/zh/plugins/dsh-genui/',
    'npx dshpub add omdsh-dev/dsh-genui --ref 57b4338222632f8ea81c2665d44e5f9e80b52686',
  );
  await assertPageOmits('/zh/plugins/dsh-genui/', '--path');
  await assertPage('/zh/plugins/dsh-genui/', '不等于安全审计');
  await assertPage('/zh/plugins/dsh-automation/', 'titanwings / dsh-automation');
  await assertPage(
    '/zh/plugins/dsh-automation/',
    'npx dshpub add titanwings/dsh-automation --ref 3c0188d7d94ed5b1e8caffeb73d7ac7ab34aabb3',
  );
  await assertPageOmits('/zh/plugins/dsh-automation/', '--path');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/en/plugins/?provenance=community-reviewed`);
    await page.waitForFunction(
      () => globalThis.document.querySelector('[data-result-count]')?.textContent?.trim() === '6',
    );
    const browserState = await page.evaluate(() => {
      const rows = [...globalThis.document.querySelectorAll('[data-plugin-row]')];
      const visibleRows = rows.filter((row) => !row.hasAttribute('hidden'));
      return {
        checked: globalThis.document.querySelector(
          'input[name="provenance"][value="community-reviewed"]',
        )?.checked,
        count: globalThis.document.querySelector('[data-result-count]')?.textContent?.trim(),
        visible: visibleRows.length,
        visibleAreCommunity: visibleRows.every(
          (row) => row.getAttribute('data-provenance') === 'community-reviewed',
        ),
        builtInsHidden: rows
          .filter((row) => row.getAttribute('data-provenance') === 'built-in')
          .every((row) => row.hasAttribute('hidden')),
      };
    });
    if (
      browserState.checked !== true ||
      browserState.count !== '6' ||
      browserState.visible !== 6 ||
      !browserState.visibleAreCommunity ||
      !browserState.builtInsHidden ||
      !page.url().endsWith('/en/plugins/?provenance=community-reviewed')
    ) {
      throw new Error(`Browser catalog filter failed: ${JSON.stringify(browserState)}`);
    }

    await page.goto(`${origin}/zh/plugins/web-app/`);
    const overview = page.locator('[data-technical-overview]');
    const initialDetailState = await overview.evaluate((element) => {
      const details = /** @type {HTMLDetailsElement} */ (element);
      return {
        open: details.open,
        inlineCode: details.querySelector('code')?.textContent,
        literalBackticks: details.textContent?.includes('`cordis.patch.yml`'),
        installMetric: Boolean(globalThis.document.querySelector('[data-detail-install-count]')),
        builtInDistribution: Boolean(globalThis.document.querySelector('.distribution-panel')),
      };
    });
    if (
      initialDetailState.open ||
      initialDetailState.inlineCode !== 'cordis.patch.yml' ||
      initialDetailState.literalBackticks ||
      initialDetailState.installMetric ||
      !initialDetailState.builtInDistribution
    ) {
      throw new Error(`Built-in detail summary failed: ${JSON.stringify(initialDetailState)}`);
    }
    await overview.locator('summary').click();
    if (!(await overview.evaluate((element) => /** @type {HTMLDetailsElement} */ (element).open))) {
      throw new Error('The technical overview did not expand from its native summary control.');
    }
  } finally {
    await browser.close();
  }
  console.log('Web static routes passed bilingual smoke checks.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
