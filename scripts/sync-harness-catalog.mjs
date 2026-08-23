import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import ts from 'typescript';

import { githubRawUrl } from './lib/readme-url.mjs';

const SOURCE_COMMIT = '47f943859bef60e4160492346772ded9b24f765a';
const SOURCE_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSourceRoot = resolve(repoRoot, '../../learning/deepseek-harness');
const outputPath = resolve(repoRoot, 'packages/catalog/src/catalog.generated.json');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return resolve(value);
}

function git(sourceRoot, args) {
  return execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' }).trim();
}

function packageDirectories(sourceRoot) {
  const packagesRoot = join(sourceRoot, 'packages');
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((area) =>
      readdirSync(join(packagesRoot, area.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(packagesRoot, area.name, entry.name)),
    )
    .filter((directory) => existsSync(join(directory, 'package.json')))
    .sort();
}

function defaultExport(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      const name = statement.expression.text;
      return (
        sourceFile.statements.find(
          (candidate) =>
            (ts.isClassDeclaration(candidate) || ts.isFunctionDeclaration(candidate)) &&
            candidate.name?.text === name,
        ) ?? null
      );
    }
    if (
      (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
  }
  return null;
}

function applyExport(sourceFile) {
  return (
    sourceFile.statements.find(
      (statement) =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'apply' &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    ) ?? null
  );
}

// This is the classification seam from Harness scripts/gen-config-catalog.ts:
// Loader unwraps a default export first, otherwise a namespace `apply` is the plugin.
function classify(entryPath) {
  const text = readFileSync(entryPath, 'utf8');
  const sourceFile = ts.createSourceFile(entryPath, text, ts.ScriptTarget.Latest, true);
  const dflt = defaultExport(sourceFile);
  const apply = applyExport(sourceFile);
  if (dflt && ts.isClassDeclaration(dflt)) {
    if (dflt.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword)) {
      return { kind: 'seam', configurable: false };
    }
    const constructor = dflt.members.find(ts.isConstructorDeclaration);
    return {
      kind: constructor?.parameters[1] ? 'config' : 'no-config',
      configurable: Boolean(constructor?.parameters[1]),
    };
  }
  const configParameter = dflt?.parameters[1] ?? apply?.parameters[1];
  if (dflt || apply) {
    return {
      kind: configParameter ? 'config' : 'no-config',
      configurable: Boolean(configParameter),
    };
  }
  return { kind: 'library', configurable: false };
}

function yamlPackageNames(path) {
  if (!existsSync(path)) return new Set();
  const names = new Set();
  for (const match of readFileSync(path, 'utf8').matchAll(
    /name:\s*['"](@deepseek-ai\/[^'"\s]+)['"]/g,
  )) {
    names.add(match[1].split('/').slice(0, 2).join('/'));
  }
  return names;
}

function profileMembership(sourceRoot) {
  const base = yamlPackageNames(join(sourceRoot, 'packages/bundle/base/cordis.patch.yml'));
  const webOwn = yamlPackageNames(join(sourceRoot, 'packages/bundle/web-app/cordis.patch.yml'));
  const headlessOwn = yamlPackageNames(
    join(sourceRoot, 'packages/bundle/headless/cordis.patch.yml'),
  );
  const membership = new Map();
  const add = (name, profile) => {
    const profiles = membership.get(name) ?? new Set();
    profiles.add(profile);
    membership.set(name, profiles);
  };
  for (const name of base) {
    add(name, 'base');
    add(name, 'web');
    add(name, 'headless');
  }
  for (const name of webOwn) add(name, 'web');
  for (const name of headlessOwn) add(name, 'headless');

  const presetsRoot = join(sourceRoot, 'apps/cli/config/agent-presets');
  for (const preset of readdirSync(presetsRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  )) {
    for (const name of yamlPackageNames(join(presetsRoot, preset.name, 'agent.cordis.yml'))) {
      add(name, `preset:${preset.name}`);
    }
  }
  return membership;
}

function firstParagraph(markdown) {
  const lines = markdown.split('\n');
  const paragraph = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!paragraph.length && (!line || line.startsWith('#') || /English|中文/.test(line))) continue;
    if (!line && paragraph.length) break;
    if (line) paragraph.push(line);
  }
  return paragraph.join(' ').replace(/\[([^\]]+)]\([^)]*\)/g, '$1');
}

function section(markdown, headings) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    return match && headings.some((heading) => match[2].toLowerCase().includes(heading));
  });
  if (start === -1) return '';
  const level = /^(#+)/.exec(lines[start])?.[1].length ?? 2;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const next = /^(#{1,6})\s+/.exec(lines[index]);
    if (next && next[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

function category(area, packageName, type) {
  if (type === 'bundle') return 'bundles';
  if (type === 'seam') return 'capability-seams';
  if (type === 'library') return 'sdk-internals';
  if (area === 'client') return 'client-ui';
  if (packageName.includes('/dsh-tool-') || packageName === '@deepseek-ai/dsh-tools')
    return 'tools';
  if (area === 'llm') return 'models';
  if (['workflow', 'jobs', 'subagent'].includes(area)) return 'orchestration';
  if (['host', 'api', 'extensions'].includes(area)) return 'platform';
  if (['fs', 'shell', 'sandbox', 'subprocess', 'terminal', 'code-runtime'].includes(area))
    return 'runtime';
  if (area === 'session' || area === 'session-query') return 'sessions';
  return area;
}

function catalogEntry(sourceRoot, directory, memberships) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const repositoryDirectory = relative(sourceRoot, directory).split(sep).join('/');
  const area = repositoryDirectory.split('/')[1];
  const classification = classify(join(directory, 'src/index.ts'));
  const bundle = Boolean(manifest.dsh?.bundle?.patch);
  const type = bundle
    ? 'bundle'
    : classification.kind === 'config' || classification.kind === 'no-config'
      ? 'plugin'
      : classification.kind;
  const readmePath = `${repositoryDirectory}/README.md`;
  const readmeZhPath = `${repositoryDirectory}/README.zh.md`;
  const readmeEn = readFileSync(join(sourceRoot, readmePath), 'utf8');
  const readmeZh = readFileSync(join(sourceRoot, readmeZhPath), 'utf8');
  const profiles = [
    ...(memberships.get(manifest.name) ?? []),
    ...(manifest.name === '@deepseek-ai/dsh-base' ? ['base', 'headless', 'web'] : []),
  ].sort();
  const client = manifest.dsh?.client ?? false;
  const distribution = bundle
    ? {
        installable: false,
        mode: 'built-in',
        activation: 'profile-layer',
        note: {
          en: 'The dsh.bundle manifest proves this is a DSH profile activation layer; it does not prove the Git subdirectory is independently installable.',
          zh: 'dsh.bundle manifest 只证明这是 DSH profile 的激活层，不代表该 Git 子目录可以独立安装。',
        },
      }
    : { installable: false, mode: 'built-in' };

  return {
    id: manifest.name,
    slug: manifest.name.replace(/^@deepseek-ai\/dsh-/, '').replace(/[^a-z0-9]+/g, '-'),
    name: manifest.name,
    version: manifest.version,
    license: manifest.license,
    type,
    category: category(area, manifest.name, type),
    builtIn: true,
    description: {
      en: firstParagraph(readmeEn) || manifest.description,
      zh: firstParagraph(readmeZh) || `DeepSeek Harness 的 ${manifest.name} 模块。`,
    },
    source: {
      repository: SOURCE_REPOSITORY,
      directory: repositoryDirectory,
      commit: SOURCE_COMMIT,
    },
    runtime: {
      hostLoadable: classification.kind === 'config' || classification.kind === 'no-config',
      configurable: classification.configurable,
      client,
    },
    capabilities: {
      tools: [],
      uiContributions: [],
      uiSlotsDeclared: [],
    },
    availability: {
      profiles,
      defaultWeb: profiles.includes('web'),
    },
    distribution,
    docs: {
      readmePath,
      readmeZhPath,
      readme: {
        en: githubRawUrl(SOURCE_REPOSITORY, SOURCE_COMMIT, readmePath),
        zh: githubRawUrl(SOURCE_REPOSITORY, SOURCE_COMMIT, readmeZhPath),
      },
      modelExperience: {
        en: section(readmeEn, ['model experience']),
        zh: section(readmeZh, ['模型体验', 'model experience']),
      },
      limitations: {
        en: section(readmeEn, ['known limitations']),
        zh: section(readmeZh, ['已知限制', '已知局限', 'known limitations']),
      },
    },
    _classification: classification.kind,
  };
}

async function main() {
  const sourceRoot = argument('--source', defaultSourceRoot);
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error(`Harness source checkout not found: ${sourceRoot}`);
  }
  const head = git(sourceRoot, ['rev-parse', 'HEAD']);
  if (head !== SOURCE_COMMIT) {
    throw new Error(`Harness source must be at ${SOURCE_COMMIT}; found ${head}`);
  }
  if (git(sourceRoot, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error(
      'Harness source checkout has changes; catalog generation must read the pinned commit exactly',
    );
  }

  const memberships = profileMembership(sourceRoot);
  const entries = packageDirectories(sourceRoot).map((directory) =>
    catalogEntry(sourceRoot, directory, memberships),
  );
  const counts = entries.reduce(
    (result, entry) => {
      result[entry._classification] += 1;
      return result;
    },
    { config: 0, 'no-config': 0, seam: 0, library: 0 },
  );
  const bundles = entries.filter((entry) => entry.type === 'bundle').length;
  const client = entries.filter((entry) => entry.runtime.client !== false).length;
  for (const entry of entries) delete entry._classification;

  const catalog = {
    source: {
      repository: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      generatedAt: git(sourceRoot, ['show', '-s', '--format=%cI', SOURCE_COMMIT]),
    },
    totals: {
      packages: entries.length,
      plugins: counts.config + counts['no-config'],
      seams: counts.seam,
      libraries: counts.library,
      bundles,
      configurable: counts.config,
      client,
    },
    entries,
  };
  writeFileSync(
    outputPath,
    await format(JSON.stringify(catalog), {
      parser: 'json',
      printWidth: 100,
    }),
  );
  console.log(
    `sync-harness-catalog: wrote ${relative(repoRoot, outputPath)} (${catalog.totals.plugins} plugins, ${bundles} bundle overlays)`,
  );
}

await main();
