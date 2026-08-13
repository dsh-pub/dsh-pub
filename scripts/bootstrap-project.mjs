import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

const TEMPLATE_NAME = 'onee-product-template';
const TEMPLATE_DESCRIPTION =
  'A public GitHub template repository for npm-workspace TypeScript projects.';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function validateSlug(value, label) {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(`${label} must use lowercase kebab-case: ${value || '(empty)'}`);
  }
}

function normalizeScope(value) {
  const scope = value.startsWith('@') ? value.slice(1) : value;
  validateSlug(scope, 'Scope');
  return `@${scope}`;
}

function titleFromName(name) {
  return name
    .split('-')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function workspacePackagePaths(root, patterns) {
  const paths = [];

  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const parent = join(root, pattern.slice(0, -2));
      let entries = [];

      try {
        entries = await readdir(parent, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = join(parent, entry.name, 'package.json');
        try {
          await access(manifestPath);
          paths.push(manifestPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      continue;
    }

    paths.push(join(root, pattern, 'package.json'));
  }

  return paths.sort();
}

function relativePackagePath(root, manifestPath) {
  return relative(root, dirname(manifestPath)).split(sep).join('/');
}

function renamedWorkspacePackage(currentName, scope) {
  if (typeof currentName !== 'string' || !currentName.includes('/')) {
    throw new Error(`Workspace package has an invalid name: ${currentName || '(empty)'}`);
  }

  if (!currentName.startsWith('@template/') && !currentName.startsWith(`${scope}/`)) {
    throw new Error(`Refusing to replace custom workspace package name: ${currentName}`);
  }

  return `${scope}/${currentName.slice(currentName.indexOf('/') + 1)}`;
}

function renamedTemplateReference(packageName, scope) {
  return packageName.startsWith('@template/')
    ? `${scope}/${packageName.slice('@template/'.length)}`
    : packageName;
}

function renameRecordKeys(record, scope) {
  const renamed = {};

  for (const [key, value] of Object.entries(record)) {
    const nextKey = renamedTemplateReference(key, scope);
    if (Object.hasOwn(renamed, nextKey)) {
      throw new Error(`Package reference rename would create a duplicate key: ${nextKey}`);
    }
    renamed[nextKey] = value;
  }

  return renamed;
}

function renameManifestReferences(manifest, scope) {
  for (const field of DEPENDENCY_FIELDS) {
    if (manifest[field] && !Array.isArray(manifest[field])) {
      manifest[field] = renameRecordKeys(manifest[field], scope);
    }
  }

  for (const field of ['bundleDependencies', 'bundledDependencies']) {
    if (Array.isArray(manifest[field])) {
      manifest[field] = manifest[field].map((name) => renamedTemplateReference(name, scope));
    }
  }
}

function renameLockfileReferences(lock, scope) {
  if (lock.dependencies) lock.dependencies = renameRecordKeys(lock.dependencies, scope);
  if (!lock.packages) return;

  const packages = {};
  for (const [packagePath, metadata] of Object.entries(lock.packages)) {
    renameManifestReferences(metadata, scope);
    const nextPath = packagePath.startsWith('node_modules/@template/')
      ? `node_modules/${scope}/${packagePath.slice('node_modules/@template/'.length)}`
      : packagePath;
    if (Object.hasOwn(packages, nextPath)) {
      throw new Error(`Lockfile package rename would create a duplicate key: ${nextPath}`);
    }
    packages[nextPath] = metadata;
  }
  lock.packages = packages;
}

export async function bootstrapProject({ name, root, scope, title }) {
  validateSlug(name, 'Project name');
  const normalizedScope = normalizeScope(scope || name);
  const projectTitle = title || titleFromName(name);
  const rootManifestPath = join(root, 'package.json');
  const rootManifest = await readJson(rootManifestPath);

  if (rootManifest.name !== TEMPLATE_NAME && rootManifest.name !== name) {
    throw new Error(`Refusing to rename initialized project: ${rootManifest.name}`);
  }

  const changes = new Map();
  rootManifest.name = name;
  renameManifestReferences(rootManifest, normalizedScope);
  if (!rootManifest.description || rootManifest.description === TEMPLATE_DESCRIPTION) {
    rootManifest.description = `${projectTitle} workspace.`;
  }
  changes.set(rootManifestPath, serializeJson(rootManifest));

  const workspaceNames = new Map();
  const workspacePaths = await workspacePackagePaths(root, rootManifest.workspaces || []);
  for (const manifestPath of workspacePaths) {
    const manifest = await readJson(manifestPath);
    manifest.name = renamedWorkspacePackage(manifest.name, normalizedScope);
    renameManifestReferences(manifest, normalizedScope);
    const workspacePath = relativePackagePath(root, manifestPath);
    workspaceNames.set(workspacePath, manifest.name);
    changes.set(manifestPath, serializeJson(manifest));
  }

  const lockPath = join(root, 'package-lock.json');
  try {
    const lock = await readJson(lockPath);
    lock.name = name;
    renameLockfileReferences(lock, normalizedScope);
    if (lock.packages?.['']) lock.packages[''].name = name;
    for (const [workspacePath, packageName] of workspaceNames) {
      if (lock.packages?.[workspacePath]) lock.packages[workspacePath].name = packageName;
    }
    changes.set(lockPath, serializeJson(lock));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const readmePath = join(root, 'README.md');
  try {
    const readme = await readFile(readmePath, 'utf8');
    const nextReadme = readme
      .replace('# Onee Product Template', `# ${projectTitle}`)
      .replace(
        'This repository is a public GitHub template for npm-workspace TypeScript projects.',
        `${projectTitle} is an npm-workspace TypeScript project.`,
      )
      .replace('onee-product-template/', `${name}/`);
    changes.set(readmePath, nextReadme);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const changedPaths = [];
  for (const [path, content] of changes) {
    const current = await readFile(path, 'utf8');
    if (current === content) continue;
    await writeFile(path, content);
    changedPaths.push(relative(root, path));
  }

  if (changedPaths.length > 0) {
    console.log(`Initialized ${name}:`);
    for (const path of changedPaths) console.log(`  ${path}`);
  } else {
    console.log(`No initialization changes were needed for ${name}.`);
  }

  return changedPaths;
}
