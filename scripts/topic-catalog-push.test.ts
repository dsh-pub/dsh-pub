import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./push-topic-catalog.mjs', import.meta.url));
const catalog = 'packages/catalog/src/community.generated.json';
const sources = 'packages/catalog/src/community.sources.json';
const bundle = 'apps/dsh-plugin/lib/client.js';
const generatedPaths = [
  catalog,
  sources,
  bundle,
  'apps/dsh-plugin/src/client/catalog.generated.json',
  'apps/server/src/installable-slugs.generated.json',
  'packages/catalog/src/topic-analysis.generated.json',
];
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'topic-catalog-push-'));
  directories.push(root);
  const remote = join(root, 'remote.git');
  const writer = join(root, 'writer');
  const worker = join(root, 'worker');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.test',
    HUSKY: '0',
    PATH: `${join(root, 'bin')}:${process.env.PATH}`,
  };
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
    return result.stdout.trim();
  };
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(root, 'clone', remote, writer);
  for (const path of generatedPaths) write(writer, path, 'initial');
  write(writer, 'source.txt', 'initial');
  write(
    writer,
    'scripts/sync-topic-catalog.mjs',
    `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
appendFileSync('.git/validation.log', 'sync\\n');
writeFileSync('${catalog}', 'generated:' + readFileSync('${sources}', 'utf8'));
`,
  );
  git(writer, 'add', '.');
  git(writer, 'commit', '-m', 'initial');
  git(writer, 'push', 'origin', 'main');
  // Match actions/checkout's shallow checkout, including the fetch during retries.
  git(root, 'clone', '--depth=1', pathToFileURL(remote).href, worker);
  const base = git(worker, 'rev-parse', 'HEAD');

  // Stub only npm's expensive/service-facing boundary; all Git operations are real.
  write(
    root,
    'bin/npm',
    `#!/usr/bin/env node
const fs = require('node:fs');
const command = process.argv.slice(2).join(' ');
fs.appendFileSync('.git/validation.log', command + '\\n');
if (process.env.FAIL_COMMAND === command) process.exit(1);
if (command === 'run build') {
  fs.writeFileSync('${bundle}', fs.readFileSync('${catalog}'));
}
`,
  );
  git(root, 'config', '--file', join(root, 'gitconfig'), 'protocol.file.allow', 'always');
  // Git invokes this same writer script from pre-push to advance main after our last fetch.
  const advanceScript = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const writer = ${JSON.stringify(writer)};
const env = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  delete env[key];
}
function git(...args) {
  const result = spawnSync('git', args, { cwd: writer, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const countPath = ${JSON.stringify(join(worker, '.git/push-count'))};
const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath)) + 1 : 1;
fs.writeFileSync(countPath, String(count));
if (process.env.RACE_ONCE && count > 1) process.exit(0);
const value = 'remote-' + count;
fs.writeFileSync(writer + '/source.txt', value);
fs.writeFileSync(writer + '/${sources}', value);
const generated = (process.env.ALREADY_SYNCED ? 'generated:' : 'published:') + value;
fs.writeFileSync(writer + '/${catalog}', generated);
fs.writeFileSync(writer + '/${bundle}', generated);
git('add', '.');
git('commit', '-m', 'concurrent main ' + count);
git('push', 'origin', 'main');
`;
  write(root, 'advance.cjs', advanceScript);
  // Executable test shims are scoped to this fixture, never the user's repository.
  chmodSync(join(root, 'bin/npm'), 0o755);
  const advance = (extra = {}) => {
    const result = spawnSync(process.execPath, [join(root, 'advance.cjs')], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return git(writer, 'rev-parse', 'HEAD');
  };
  const race = () => {
    write(worker, '.git/hooks/pre-push', advanceScript);
    chmodSync(join(worker, '.git/hooks/pre-push'), 0o755);
  };
  const run = (extra = {}) => {
    const result = spawnSync(process.execPath, [script], {
      cwd: worker,
      encoding: 'utf8',
      env: { ...env, ...extra },
      timeout: 20_000,
    });
    return { ...result, output: result.stdout + result.stderr };
  };
  const prepare = () => write(worker, catalog, 'stale:initial');
  const readRemote = (path: string) => git(remote, 'show', `main:${path}`);
  const validations = () => readFileSync(join(worker, '.git/validation.log'), 'utf8');
  return {
    advance,
    base,
    git,
    prepare,
    race,
    readRemote,
    remote,
    run,
    validations,
    worker,
    writer,
  };
}

describe('Topic catalog push against a local Git remote', () => {
  it('pushes only the validated generated changes when main is unchanged', () => {
    const f = fixture();
    f.prepare();
    const result = f.run();
    expect(result.status, result.output).toBe(0);
    expect(f.git(f.remote, 'rev-parse', 'main^')).toBe(f.base);
    expect(f.git(f.remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'main')).toBe(
      catalog,
    );
  });

  it('regenerates on latest main when main advances during the original generation/checks', () => {
    const f = fixture();
    f.prepare();
    const concurrent = f.advance();
    const result = f.run();
    expect(result.status, result.output).toBe(0);
    expect(f.git(f.remote, 'rev-parse', 'main^')).toBe(concurrent);
    expect(f.readRemote('source.txt')).toBe('remote-1');
    expect(f.readRemote(catalog)).toBe('generated:remote-1');
    expect(f.readRemote(bundle)).toBe('generated:remote-1');
    expect(f.validations()).toBe('ci\nsync\nrun lint\nrun test\nrun build\n');
  });

  it('recovers from a real non-fast-forward rejection between fetch and push', () => {
    const f = fixture();
    f.prepare();
    f.race();
    const result = f.run({ RACE_ONCE: '1' });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/\[(?:remote )?rejected\]/);
    expect(f.git(f.remote, 'rev-parse', 'main^')).toBe(f.git(f.writer, 'rev-parse', 'HEAD'));
    expect(f.git(f.remote, 'rev-list', '--count', 'main')).toBe('3');
    expect(f.readRemote(catalog)).toBe('generated:remote-1');
    expect(f.readRemote(bundle)).toBe('generated:remote-1');
    expect(f.validations()).toBe('ci\nsync\nrun lint\nrun test\nrun build\n');
  });

  it('returns successfully without another commit when regeneration is already current', () => {
    const f = fixture();
    f.prepare();
    f.race();
    const result = f.run({ RACE_ONCE: '1', ALREADY_SYNCED: '1' });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('already current');
    expect(f.git(f.remote, 'rev-parse', 'main')).toBe(f.git(f.writer, 'rev-parse', 'HEAD'));
    expect(f.git(f.remote, 'rev-list', '--count', 'main')).toBe('2');
  });

  it('does nothing when the original catalog is already current', () => {
    const f = fixture();
    const result = f.run();
    expect(result.status, result.output).toBe(0);
    expect(f.git(f.remote, 'rev-parse', 'main')).toBe(f.base);
  });

  it('fails after three races without overwriting any concurrent commit', () => {
    const f = fixture();
    f.prepare();
    f.race();
    const result = f.run();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('failed after 3 attempts');
    expect(f.git(f.remote, 'rev-list', '--count', 'main')).toBe('4');
    expect(f.readRemote(catalog)).toBe('published:remote-3');
    expect(f.readRemote('source.txt')).toBe('remote-3');
    expect(f.validations()).toBe('ci\nsync\nrun lint\nrun test\nrun build\n'.repeat(2));
  });

  it('does not retry a push rejection when main has not advanced', () => {
    const f = fixture();
    f.prepare();
    write(f.remote, 'hooks/pre-receive', '#!/bin/sh\nexit 1\n');
    chmodSync(join(f.remote, 'hooks/pre-receive'), 0o755);
    const result = f.run();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('without main advancing; not retrying');
    expect(f.git(f.remote, 'rev-parse', 'main')).toBe(f.base);
  });

  it.each(['ci', 'run lint', 'run test', 'run build'])(
    'does not publish regenerated data when %s fails',
    (command) => {
      const f = fixture();
      f.prepare();
      const concurrent = f.advance();
      const result = f.run({ FAIL_COMMAND: command });
      expect(result.status, result.output).toBe(1);
      expect(f.git(f.remote, 'rev-parse', 'main')).toBe(concurrent);
      expect(f.readRemote(catalog)).toBe('published:remote-1');
    },
  );

  it.each(['unstaged', 'staged', 'untracked'])(
    'refuses unexpected %s files before resetting or pushing',
    (state) => {
      const f = fixture();
      f.prepare();
      const path = state === 'untracked' ? 'unexpected.txt' : 'source.txt';
      write(f.worker, path, 'keep my work');
      if (state === 'staged') {
        f.git(f.worker, 'add', path);
        write(f.worker, path, 'initial'); // A net-zero working tree must not hide a staged edit.
      }
      const concurrent = f.advance();
      const result = f.run();
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain(`Unexpected generated path: ${path}`);
      expect(f.git(f.worker, 'rev-parse', 'HEAD')).toBe(f.base);
      expect(f.git(f.remote, 'rev-parse', 'main')).toBe(concurrent);
      expect(
        state === 'staged'
          ? f.git(f.worker, 'show', `:${path}`)
          : readFileSync(join(f.worker, path), 'utf8'),
      ).toBe('keep my work');
    },
  );
});
