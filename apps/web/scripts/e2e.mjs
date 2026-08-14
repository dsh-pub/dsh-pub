import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const cwd = dirname(fileURLToPath(import.meta.url));
const appRoot = join(cwd, '..');
const distRoot = join(appRoot, 'dist');
const registryRoot = join(appRoot, '..', '..');
const sourceCatalog = JSON.parse(
  await readFile(join(registryRoot, 'packages/catalog/src/catalog.generated.json'), 'utf8'),
);
const communityCatalog = JSON.parse(
  await readFile(join(registryRoot, 'packages/catalog/src/community.generated.json'), 'utf8'),
);
const ecosystemCatalog = JSON.parse(
  await readFile(join(registryRoot, 'packages/catalog/src/ecosystem.generated.json'), 'utf8'),
);
const marketplaceCount =
  sourceCatalog.entries.filter((entry) => entry.type === 'plugin' || entry.type === 'bundle')
    .length + communityCatalog.entries.length;
const reviewedCommunityCount = communityCatalog.entries.filter(
  (entry) => entry.provenance?.status === 'community-reviewed',
).length;
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
  '.json': 'application/json; charset=utf-8',
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
  const localizedHtml = (await readdir(distRoot, { recursive: true })).filter((path) =>
    /^(en|zh)\/.*index\.html$/.test(path),
  );
  if (urls.length !== localizedHtml.length || urls.includes('https://dsh.pub/')) {
    throw new Error(
      `Expected ${localizedHtml.length} indexable URLs without the locale redirect, received ${urls.length}.`,
    );
  }
  if (!sitemap.includes('hreflang="en"') || !sitemap.includes('hreflang="zh-CN"')) {
    throw new Error('The sitemap does not pair English and Chinese variants.');
  }
  if (
    !sitemap.includes('https://dsh.pub/en/categories/ui-client/') ||
    !sitemap.includes('https://dsh.pub/zh/categories/ui-client/')
  ) {
    throw new Error('The sitemap does not include bilingual registry topic hubs.');
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
    !homepage.includes('<title>DeepSeek Harness 插件目录 · dsh.pub</title>') ||
    !homepage.includes('"@type":"WebSite"') ||
    !homepage.includes(
      '"alternateName":["DeepSeek Harness Plugin Registry","DSH Plugin Registry"]',
    ) ||
    !homepage.includes('"@type":"SearchAction"') ||
    !homepage.includes('"@type":"FAQPage"') ||
    !homepage.includes('"name":"如何安装 DSH 插件？"') ||
    !homepage.includes('id="faq-title"') ||
    !homepage.includes('DeepSeek Harness 插件常见问题</h2>') ||
    !homepage.includes('googletagmanager.com/gtag/js?id=G-TEST123456')
  ) {
    throw new Error('The localized homepage SEO or conditional Analytics tag is incomplete.');
  }

  const englishHomepage = await responseBody('/en/');
  if (
    !englishHomepage.includes('DeepSeek Harness plugin FAQ') ||
    !englishHomepage.includes(
      'What is the difference between built-in and community DSH plugins?',
    ) ||
    !englishHomepage.includes('How should I choose a DeepSeek Harness plugin?')
  ) {
    throw new Error('The English homepage FAQ is incomplete.');
  }

  const registry = await responseBody('/en/plugins/');
  for (const expected of [
    '<title>DeepSeek Harness Plugin Registry: Browse DSH Plugins · dsh.pub</title>',
    '>DeepSeek Harness plugin registry</h1>',
    'Find, install, and publish DSH plugins',
    '"@type":"CollectionPage"',
    '"@type":"ItemList"',
    `"numberOfItems":${marketplaceCount}`,
    '"@type":"BreadcrumbList"',
  ]) {
    if (!registry.includes(expected)) throw new Error(`Registry SEO is missing ${expected}.`);
  }

  const detail = await responseBody('/en/plugins/dsh-genui/');
  for (const expected of [
    '<title>@omdsh-dev/dsh-genui — DeepSeek Harness plugin · dsh.pub</title>',
    '"@type":"SoftwareSourceCode"',
    '"@type":"BreadcrumbList"',
  ]) {
    if (!detail.includes(expected)) throw new Error(`Plugin JSON-LD is missing ${expected}.`);
  }

  const topic = await responseBody('/en/categories/ui-client/');
  for (const expected of [
    '<title>UI &amp; client plugins for DeepSeek Harness · dsh.pub</title>',
    '>UI &amp; client plugins</h1>',
    '"@type":"CollectionPage"',
    '"@type":"ItemList"',
    '"@type":"BreadcrumbList"',
  ]) {
    if (!topic.includes(expected)) throw new Error(`Registry topic SEO is missing ${expected}.`);
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
    brand.readUInt32BE(16) !== 384 ||
    brand.readUInt32BE(20) !== 254 ||
    brand.readUInt8(25) !== 6
  ) {
    throw new Error('The dsh.pub mascot must be a 384 × 254 RGBA PNG.');
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
    if (
      !page.includes('data-harness-backdrop') ||
      !page.includes('data-backdrop-atmosphere') ||
      !page.includes('data-backdrop-signals')
    ) {
      throw new Error(`${path} does not render the animated Harness backdrop.`);
    }
    if (!page.includes('https://dsh.pub/plugins.json')) {
      throw new Error(`${path} does not direct agents to the static plugin index.`);
    }
  }

  const llms = await responseBody('/llms.txt');
  if (
    !llms.includes('https://dsh.pub/develop-plugin.md') ||
    !llms.includes('https://dsh.pub/plugins.json')
  ) {
    throw new Error('llms.txt does not advertise the Agent guides and static plugin index.');
  }

  const indexResponse = await fetch(`${origin}/plugins.json`);
  const index = await indexResponse.json();
  if (
    !indexResponse.ok ||
    indexResponse.headers.get('content-type') !== 'application/json; charset=utf-8' ||
    index.schemaVersion !== 1 ||
    index.totals?.registry !== marketplaceCount ||
    index.totals?.ecosystem !== ecosystemCatalog.entries.length ||
    !index.registry?.some(
      (entry) =>
        entry.slug === 'dsh-automation' &&
        entry.source?.commit === '3c0188d7d94ed5b1e8caffeb73d7ac7ab34aabb3' &&
        entry.install?.installable === true,
    ) ||
    !index.ecosystem?.some(
      (entry) => entry.name === 'deepseek-harness' && entry.discoveryOnly === true,
    )
  ) {
    throw new Error('The static plugin index is incomplete or inconsistent with catalog sources.');
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
  await assertPage('/en/', 'DeepSeek Harness plugin registry');
  await assertPage('/zh/', 'DeepSeek Harness 插件目录');
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
  await assertPage('/zh/plugins/dsh-genui/', 'href="/zh/categories/ui-client/"');
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
  await assertPage('/zh/plugins/dsh-automation/', 'rel="ugc"');
  await assertPage('/en/submit/', 'Submit a DSH plugin');
  await assertPage('/zh/submit/', '提交一个 DSH 插件');
  await assertPage('/en/submit/', 'This is taking longer than expected. Please try again.');
  await assertPage('/zh/submit/', '处理时间超出预期，请重试。');
  await assertPage('/en/', 'href="/en/submit/"');
  await assertPage('/zh/', 'href="/zh/submit/"');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/zh/`);
    const signalCanvas = page.locator('[data-backdrop-signals]');
    await signalCanvas.waitFor();
    const firstPointer = { x: 900, y: 350 };
    const secondPointer = { x: 1060, y: 440 };
    const strongCursorPixels = async (point) =>
      signalCanvas.evaluate(
        (canvas, { point }) => {
          const context = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d', {
            willReadFrequently: true,
          });
          const bounds = canvas.getBoundingClientRect();
          const scaleX = canvas.width / bounds.width;
          const scaleY = canvas.height / bounds.height;
          const patchSize = 120;
          const data = context.getImageData(
            Math.round((point.x - bounds.left - patchSize / 2) * scaleX),
            Math.round((point.y - bounds.top - patchSize / 2) * scaleY),
            Math.round(patchSize * scaleX),
            Math.round(patchSize * scaleY),
          );
          let strongPixels = 0;
          for (let offset = 3; offset < data.data.length; offset += 4) {
            if (data.data[offset] >= 70) strongPixels += 1;
          }
          return strongPixels;
        },
        { point },
      );
    const baselineCursorPixels = await strongCursorPixels(secondPointer);
    await page.mouse.move(firstPointer.x, firstPointer.y);
    await page.waitForTimeout(650);
    const firstCursorPixels = await strongCursorPixels(firstPointer);
    await page.mouse.move(secondPointer.x, secondPointer.y);
    await page.waitForTimeout(650);
    const secondCursorPixels = await strongCursorPixels(secondPointer);
    if (
      firstCursorPixels < baselineCursorPixels + 60 ||
      secondCursorPixels < baselineCursorPixels + 60
    ) {
      throw new Error(
        `Hero cursor particles did not follow the pointer: ${JSON.stringify({ baselineCursorPixels, firstCursorPixels, secondCursorPixels })}`,
      );
    }

    await page.goto(`${origin}/en/plugins/?provenance=community-reviewed`);
    await page.waitForFunction(
      (expected) =>
        globalThis.document.querySelector('[data-result-count]')?.textContent?.trim() ===
        String(expected),
      reviewedCommunityCount,
    );
    const browserState = await page.evaluate(() => {
      const rows = [...globalThis.document.querySelectorAll('[data-plugin-row]')];
      const visibleRows = rows.filter((row) => !row.hasAttribute('hidden'));
      return {
        provenance: globalThis.document.querySelector('[data-provenance-filter]')?.value,
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
      browserState.provenance !== 'community-reviewed' ||
      browserState.count !== String(reviewedCommunityCount) ||
      browserState.visible !== reviewedCommunityCount ||
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

    await page.route('https://dsh.pub/api/badges/**', async (route) => {
      await route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="123" height="20"></svg>',
        contentType: 'image/svg+xml',
        status: 200,
      });
    });
    await page.route('**/api/submission-config', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ turnstileSiteKey: '1x00000000000000000000AA' }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.route(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      async (route) => {
        await route.fulfill({
          body: `globalThis.turnstile = {
          render(_container, options) {
            globalThis.__dshTurnstileOptions = options;
            setTimeout(() => options.callback('turnstile-e2e-token'), 0);
            return 'turnstile-widget-1';
          },
          reset() {
            setTimeout(() => globalThis.__dshTurnstileOptions.callback('turnstile-retry-token'), 0);
          }
        };`,
          contentType: 'application/javascript',
          status: 200,
        });
      },
    );
    let submissionPosts = 0;
    const submissionIdempotencyKeys = [];
    await page.route('**/api/submissions**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/submissions') {
        const body = request.postDataJSON();
        const idempotencyKey = request.headers()['idempotency-key'];
        if (
          body.repository !== 'https://github.com/example/dsh-clock' ||
          body.turnstileToken !==
            (submissionPosts === 0 ? 'turnstile-e2e-token' : 'turnstile-retry-token') ||
          !/^[0-9a-f-]{36}$/.test(idempotencyKey ?? '')
        ) {
          throw new Error(
            `Unexpected submission request: ${JSON.stringify({ body, idempotencyKey })}`,
          );
        }
        submissionPosts += 1;
        submissionIdempotencyKeys.push(idempotencyKey);
        if (submissionPosts === 1) {
          await route.fulfill({
            body: JSON.stringify({
              error: 'submission_start_failed',
              message: 'The submission could not be started.',
            }),
            contentType: 'application/json',
            status: 503,
          });
          return;
        }
        await route.fulfill({
          body: JSON.stringify({
            id: 'submission-123',
            status: 'queued',
            statusUrl: '/api/submissions/submission-123',
          }),
          contentType: 'application/json',
          status: 202,
        });
        return;
      }
      if (request.method() === 'GET' && url.pathname === '/api/submissions/submission-123') {
        await route.fulfill({
          body: JSON.stringify({
            id: 'submission-123',
            prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/42',
            status: 'pr_created',
            statusUrl: '/api/submissions/submission-123',
          }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.abort();
    });
    await page.goto(`${origin}/en/submit/`);
    const repository = page.locator('input[name="repository"]');
    if ((await page.locator('[data-submission-form] input, textarea, select').count()) !== 1) {
      throw new Error('Submission form must ask for exactly one repository field.');
    }
    await repository.fill('https://example.com/not-github');
    await repository.blur();
    const invalidSubmissionState = await page.evaluate(() => {
      const control = globalThis.document.querySelector('input[name="repository"]');
      const error = globalThis.document.querySelector('#repository-error');
      const badgePanel = globalThis.document.querySelector('[data-badge-panel]');
      return {
        describedBy: control?.getAttribute('aria-describedby'),
        error: error?.textContent?.trim(),
        invalid: control?.getAttribute('aria-invalid'),
        badgeHidden: badgePanel?.hasAttribute('hidden'),
      };
    });
    if (
      invalidSubmissionState.describedBy !== 'repository-error' ||
      invalidSubmissionState.invalid !== 'true' ||
      !invalidSubmissionState.error ||
      !invalidSubmissionState.badgeHidden
    ) {
      throw new Error(
        `Submission validation accessibility failed: ${JSON.stringify(invalidSubmissionState)}`,
      );
    }

    await repository.fill('https://github.com/example/dsh-clock');
    await page.waitForFunction(() => {
      const badge = globalThis.document.querySelector('[data-badge-image]');
      const panel = globalThis.document.querySelector('[data-badge-panel]');
      return (
        !panel?.hasAttribute('hidden') &&
        badge instanceof globalThis.HTMLImageElement &&
        badge.complete &&
        badge.naturalWidth > 0
      );
    });
    await page.waitForFunction(() => {
      const button = globalThis.document.querySelector('[data-submit-button]');
      return button instanceof globalThis.HTMLButtonElement && !button.disabled;
    });
    const badgeReadyState = await page.evaluate(() => {
      const submitButton = globalThis.document.querySelector('[data-submit-button]');
      const badge = globalThis.document.querySelector('[data-badge-image]');
      const markdown = globalThis.document.querySelector(
        '[data-snippet="markdown"] [data-snippet-value]',
      );
      const markdownCopy = globalThis.document.querySelector('[data-snippet="markdown"] button');
      const htmlCopy = globalThis.document.querySelector('[data-snippet="html"] button');
      return {
        alt: badge?.getAttribute('alt'),
        disabled: submitButton?.hasAttribute('disabled'),
        htmlCopyName: htmlCopy?.getAttribute('aria-label'),
        markdown: markdown?.textContent,
        markdownCopyName: markdownCopy?.getAttribute('aria-label'),
      };
    });
    if (
      badgeReadyState.disabled ||
      !badgeReadyState.markdown?.includes('/api/badges/example/dsh-clock.svg') ||
      !badgeReadyState.alt?.includes('listed or not listed') ||
      !badgeReadyState.markdownCopyName?.includes('Markdown') ||
      !badgeReadyState.htmlCopyName?.includes('HTML') ||
      badgeReadyState.markdownCopyName === badgeReadyState.htmlCopyName
    ) {
      throw new Error(`Submission badge preview failed: ${JSON.stringify(badgeReadyState)}`);
    }

    const turnstileAction = await page.evaluate(() => globalThis.__dshTurnstileOptions?.action);
    if (turnstileAction !== 'plugin-submission') {
      throw new Error(`Turnstile action mismatch: ${String(turnstileAction)}`);
    }
    await repository.press('Enter');
    await page.waitForFunction(() => {
      const button = globalThis.document.querySelector('[data-submit-button]');
      const status = globalThis.document.querySelector('[data-ready-status]');
      return (
        button instanceof globalThis.HTMLButtonElement &&
        !button.disabled &&
        status?.textContent?.includes('could not be created')
      );
    });
    await repository.press('Enter');
    const pullRequestLink = page.locator('[data-pull-request-link]');
    await pullRequestLink.waitFor({ state: 'visible' });
    const submissionState = {
      href: await pullRequestLink.getAttribute('href'),
      idempotencyKeys: submissionIdempotencyKeys,
      message: await page.locator('[data-ready-status]').textContent(),
      posts: submissionPosts,
      url: page.url(),
    };
    if (
      submissionState.href !== 'https://github.com/dsh-pub/dsh-pub/pull/42' ||
      !submissionState.message?.includes('Pull request created') ||
      submissionState.posts !== 2 ||
      submissionState.idempotencyKeys[0] === submissionState.idempotencyKeys[1] ||
      submissionState.url !== `${origin}/en/submit/`
    ) {
      throw new Error(`Asynchronous submission failed: ${JSON.stringify(submissionState)}`);
    }

    const timeoutPage = await browser.newPage();
    await timeoutPage.addInitScript(() => {
      const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
      globalThis.setTimeout = (handler, timeout = 0, ...arguments_) =>
        nativeSetTimeout(handler, timeout === 1_000 ? 0 : timeout, ...arguments_);
    });
    await timeoutPage.route('https://dsh.pub/api/badges/**', async (route) => {
      await route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="123" height="20"></svg>',
        contentType: 'image/svg+xml',
        status: 200,
      });
    });
    await timeoutPage.route('**/api/submission-config', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ turnstileSiteKey: '1x00000000000000000000AA' }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await timeoutPage.route(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      async (route) => {
        await route.fulfill({
          body: `globalThis.turnstile = {
          render(_container, options) {
            globalThis.__dshTurnstileOptions = options;
            setTimeout(() => options.callback('turnstile-timeout-token'), 0);
            return 'turnstile-timeout-widget';
          },
          reset() {
            setTimeout(() => globalThis.__dshTurnstileOptions.callback('turnstile-retry-token'), 0);
          }
        };`,
          contentType: 'application/javascript',
          status: 200,
        });
      },
    );
    let timeoutStatusGets = 0;
    const timeoutIdempotencyKeys = [];
    await timeoutPage.route('**/api/submissions**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname === '/api/submissions') {
        timeoutIdempotencyKeys.push(request.headers()['idempotency-key']);
        await route.fulfill({
          body: JSON.stringify(
            timeoutIdempotencyKeys.length === 1
              ? {
                  id: 'submission-timeout',
                  status: 'queued',
                  statusUrl: '/api/submissions/submission-timeout',
                }
              : {
                  id: 'submission-retry',
                  prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/43',
                  status: 'pr_created',
                  statusUrl: '/api/submissions/submission-retry',
                },
          ),
          contentType: 'application/json',
          status: timeoutIdempotencyKeys.length === 1 ? 202 : 200,
        });
        return;
      }
      if (request.method() === 'GET' && url.pathname === '/api/submissions/submission-timeout') {
        timeoutStatusGets += 1;
        await route.fulfill({
          body: JSON.stringify(
            timeoutStatusGets > 65
              ? {
                  id: 'submission-timeout',
                  prUrl: 'https://github.com/dsh-pub/dsh-pub/pull/99',
                  status: 'pr_created',
                  statusUrl: '/api/submissions/submission-timeout',
                }
              : {
                  id: 'submission-timeout',
                  status: 'queued',
                  statusUrl: '/api/submissions/submission-timeout',
                },
          ),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.abort();
    });
    await timeoutPage.goto(`${origin}/en/submit/`);
    const timeoutRepository = timeoutPage.locator('input[name="repository"]');
    await timeoutRepository.fill('https://github.com/example/dsh-timeout');
    await timeoutPage.waitForFunction(() => {
      const button = globalThis.document.querySelector('[data-submit-button]');
      return button instanceof globalThis.HTMLButtonElement && !button.disabled;
    });
    await timeoutRepository.press('Enter');
    await timeoutPage.waitForFunction(
      () => {
        const button = globalThis.document.querySelector('[data-submit-button]');
        const status = globalThis.document.querySelector('[data-ready-status]');
        return (
          button instanceof globalThis.HTMLButtonElement &&
          !button.disabled &&
          status?.textContent?.includes('taking longer than expected')
        );
      },
      undefined,
      { timeout: 2_000 },
    );
    const requestsAtTimeout = timeoutStatusGets;
    await timeoutPage.waitForTimeout(50);
    if (timeoutStatusGets !== requestsAtTimeout) {
      throw new Error('Submission polling continued after the timeout state.');
    }
    await timeoutRepository.press('Enter');
    await timeoutPage.locator('[data-pull-request-link]').waitFor({ state: 'visible' });
    if (
      timeoutIdempotencyKeys.length !== 2 ||
      timeoutIdempotencyKeys[0] === timeoutIdempotencyKeys[1] ||
      (await timeoutPage.locator('[data-pull-request-link]').getAttribute('href')) !==
        'https://github.com/dsh-pub/dsh-pub/pull/43'
    ) {
      throw new Error(
        `Submission timeout retry failed: ${JSON.stringify({ timeoutIdempotencyKeys, timeoutStatusGets })}`,
      );
    }
    await timeoutPage.close();
  } finally {
    await browser.close();
  }
  console.log('Web static routes passed bilingual smoke checks.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
