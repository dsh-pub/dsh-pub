import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(projectRoot, 'apps/web');
const distRoot = path.join(appRoot, 'dist');
const output = path.join(appRoot, 'public/og/dsh-pub.png');
const host = '127.0.0.1';

const build = spawnSync('npm', ['run', 'build'], {
  cwd: appRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    PUBLIC_GA_MEASUREMENT_ID: '',
    PUBLIC_ADSENSE_CLIENT_ID: '',
    PUBLIC_ADSENSE_SLOT_DETAIL: '',
    PUBLIC_ADSENSE_SLOT_CATALOG: '',
  },
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
  const candidate = path.join(distRoot, pathname);
  const target = (await stat(candidate).catch(() => undefined))?.isDirectory()
    ? path.join(candidate, 'index.html')
    : candidate;

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': contentTypes[path.extname(target)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, host, resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the preview server.');

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    viewport: { width: 1920, height: 1008 },
  });
  await page.addInitScript("localStorage.setItem('dsh-theme', 'dark')");
  await page.goto(`http://${host}:${address.port}/en/`, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready');

  const homepage = await page.screenshot({ animations: 'disabled', type: 'png' });
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(homepage).resize(1200, 630).png({ compressionLevel: 9 }).toFile(output);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

console.log(`rendered English homepage screenshot to ${path.relative(projectRoot, output)}`);
