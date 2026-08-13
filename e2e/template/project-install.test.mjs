import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { runCommand } from '../support/run-command.mjs';
import { createTempWorkspace } from '../support/temp-workspace.mjs';

const prepareScript = resolve('scripts/prepare-project.mjs');

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function createFixture(t) {
  const workspace = await createTempWorkspace('onee-product-install-');
  t.after(workspace.cleanup);
  const fixtureRoot = workspace.root;
  const root = join(fixtureRoot, 'acme-product');

  await mkdir(join(root, 'apps/android'), { recursive: true });
  await mkdir(join(root, 'apps/ios'), { recursive: true });
  await mkdir(join(root, 'apps/web'), { recursive: true });
  await mkdir(join(root, 'packages/ui'), { recursive: true });
  await writeFile(join(root, 'apps/android/.gitkeep'), '');
  await writeFile(join(root, 'apps/ios/.gitkeep'), '');
  await writeJson(join(root, 'package.json'), {
    name: 'onee-product-template',
    description: 'A public GitHub template repository for npm-workspace TypeScript projects.',
    dependencies: {
      '@template/ui': '*',
    },
    private: true,
    scripts: {
      postinstall: `"${process.execPath}" "${prepareScript}"`,
    },
    workspaces: ['apps/*', 'packages/*'],
  });
  await writeJson(join(root, 'apps/web/package.json'), {
    dependencies: {
      '@template/ui': '*',
    },
    name: '@template/web',
    private: true,
  });
  await writeJson(join(root, 'packages/ui/package.json'), {
    name: '@template/ui',
    private: true,
  });
  await writeJson(join(root, 'package-lock.json'), {
    name: 'onee-product-template',
    lockfileVersion: 3,
    packages: {
      '': {
        dependencies: { '@template/ui': '*' },
        name: 'onee-product-template',
      },
      'apps/web': {
        dependencies: { '@template/ui': '*' },
        name: '@template/web',
      },
      'node_modules/@template/ui': { link: true, resolved: 'packages/ui' },
      'packages/ui': { name: '@template/ui' },
    },
  });
  await writeFile(
    join(root, 'README.md'),
    '# Onee Product Template\n\nThis repository is a public GitHub template.\n\n```text\nonee-product-template/\n```\n',
  );

  return { root };
}

function runInstall(fixture, environment = {}) {
  return runCommand('npm', ['install'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...environment,
    },
    timeoutMs: 120_000,
  });
}

test('[template.install-initializes-identity] npm install initializes project identity across workspace metadata', async (t) => {
  const fixture = await createFixture(t);
  const { root } = fixture;
  const result = runInstall(fixture, {
    ONEE_PROJECT_SCOPE: 'acme',
    ONEE_PROJECT_TITLE: 'Acme Product',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readJson(join(root, 'package.json'))).name, 'acme-product');
  assert.equal((await readJson(join(root, 'package.json'))).description, 'Acme Product workspace.');
  assert.deepEqual((await readJson(join(root, 'package.json'))).dependencies, {
    '@acme/ui': '*',
  });
  assert.equal((await readJson(join(root, 'apps/web/package.json'))).name, '@acme/web');
  assert.deepEqual((await readJson(join(root, 'apps/web/package.json'))).dependencies, {
    '@acme/ui': '*',
  });
  assert.equal((await readJson(join(root, 'packages/ui/package.json'))).name, '@acme/ui');
  assert.equal((await readJson(join(root, 'package-lock.json'))).name, 'acme-product');
  assert.equal(
    (await readJson(join(root, 'package-lock.json'))).packages['packages/ui'].name,
    '@acme/ui',
  );
  assert.deepEqual(
    (await readJson(join(root, 'package-lock.json'))).packages['apps/web'].dependencies,
    { '@acme/ui': '*' },
  );
  assert.deepEqual(
    (await readJson(join(root, 'package-lock.json'))).packages['node_modules/@acme/ui'],
    { link: true, resolved: 'packages/ui' },
  );
  assert.equal(
    (await readJson(join(root, 'package-lock.json'))).packages['node_modules/@template/ui'],
    undefined,
  );
  assert.match(await readFile(join(root, 'README.md'), 'utf8'), /^# Acme Product/m);
  assert.match(await readFile(join(root, 'README.md'), 'utf8'), /acme-product\//);
  assert.match(result.stdout, /Initialized acme-product/);
  assert.match(result.stdout, /complete Project Context in AGENTS\.md/);
});

test('[template.install-idempotent] npm install initialization is idempotent', async (t) => {
  const fixture = await createFixture(t);

  const first = runInstall(fixture);
  const second = runInstall(fixture);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(first.stdout, /Initialized acme-product/);
  assert.doesNotMatch(second.stdout, /Initialized acme-product/);
});

test('[template.install-rejects-custom-package] npm install refuses custom workspace package names without partial writes', async (t) => {
  const fixture = await createFixture(t);
  const { root } = fixture;
  const rootManifestBefore = await readFile(join(root, 'package.json'), 'utf8');
  await writeJson(join(root, 'packages/ui/package.json'), {
    name: '@custom/ui',
    private: true,
  });

  const result = runInstall(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Refusing to replace custom workspace package name/,
  );
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), rootManifestBefore);
});
