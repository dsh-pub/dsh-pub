import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = dirname(fileURLToPath(import.meta.url));
const appRoot = join(cwd, '..');
const distRoot = join(appRoot, 'dist');
const port = 4322;
const origin = `http://127.0.0.1:${port}`;

const build = spawnSync('npm', ['run', 'build'], {
  cwd: appRoot,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
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

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

try {
  await assertPage('/en/', 'Everything is a plugin');
  await assertPage('/zh/', '一切皆插件');
  await assertPage('/en/plugins/', 'Browse plugins');
  await assertPage('/zh/plugins/client-ui-trajectory/', 'dsh-client-ui-trajectory');
  await assertPage('/zh/plugins/web-app/', '内置 Profile 层');
  await assertPageOmits('/zh/plugins/web-app/', 'dsh-pub-0.1.1.tgz');
  console.log('Web static routes passed bilingual smoke checks.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
