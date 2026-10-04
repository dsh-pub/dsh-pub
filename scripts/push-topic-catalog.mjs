import { spawnSync } from 'node:child_process';

const generatedPaths = [
  'apps/dsh-plugin/lib/client.js',
  'apps/dsh-plugin/src/client/catalog.generated.json',
  'apps/server/src/installable-slugs.generated.json',
  'packages/catalog/src/community.generated.json',
  'packages/catalog/src/community.sources.json',
  'packages/catalog/src/topic-analysis.generated.json',
];
const maxAttempts = 3;

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
  return capture ? result.stdout : result.status;
}

const git = (...args) => run('git', args, { capture: true });
const fetchMain = () => {
  git('fetch', 'origin', 'main');
  return git('rev-parse', 'FETCH_HEAD').trim();
};

function checkGeneratedPaths() {
  // Check the index and working tree separately, including new files, before any reset/add.
  const paths = [
    ...git('diff', '--name-only', '-z').split('\0'),
    ...git('diff', '--cached', '--name-only', '-z').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
  ].filter(Boolean);
  for (const path of paths) {
    if (!generatedPaths.includes(path)) throw new Error(`Unexpected generated path: ${path}`);
  }
}

function main() {
  let base = git('rev-parse', 'HEAD').trim();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    checkGeneratedPaths();
    const remote = fetchMain();
    if (remote !== base) {
      // This script runs only in the disposable sync checkout. Never rebase stale generated data.
      git('merge-base', '--is-ancestor', base, remote);
      console.log('main advanced; regenerating and validating the catalog on its latest commit.');
      git('reset', '--hard', remote);
      base = remote;
      run('npm', ['ci']);
      run(process.execPath, ['scripts/sync-topic-catalog.mjs']);
      run('npm', ['run', 'lint']);
      run('npm', ['run', 'test']);
      run('npm', ['run', 'build']);
      checkGeneratedPaths();
    }

    git('add', '--', ...generatedPaths);
    if (!git('diff', '--cached', '--name-only')) {
      console.log('Topic catalog is already current.');
      return;
    }
    git('commit', '-m', 'chore(catalog): sync dsh-plugin topic');
    if (run('git', ['push', 'origin', 'HEAD:main'], { allowFailure: true }) === 0) return;
    if (fetchMain() === base) {
      throw new Error('Catalog push failed without main advancing; not retrying.');
    }
  }
  throw new Error(`main kept advancing; catalog push failed after ${maxAttempts} attempts.`);
}

try {
  main();
} catch (error) {
  console.error(`push-topic-catalog: ${error.message}`);
  process.exitCode = 1;
}
