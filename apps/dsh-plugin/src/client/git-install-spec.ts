import type { DirectoryEntry } from './catalog-query.js';

const githubRepository =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const commitPattern = /^[0-9a-f]{40}$/;
const relativeDirectory = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;

export type DirectoryInstallCoordinates = Pick<
  DirectoryEntry,
  'installable' | 'repository' | 'directory' | 'commit'
>;

/** pnpm git spec for one catalog row, pinned to the recorded commit. */
export function directoryGitInstallSpec(entry: DirectoryInstallCoordinates): string | null {
  if (!entry.installable) return null;
  const repository = githubRepository.exec(entry.repository);
  const owner = repository?.[1];
  const name = repository?.[2];
  if (!owner || !name || name === '.' || name === '..') return null;
  if (!commitPattern.test(entry.commit)) return null;

  const directory = entry.directory.trim();
  if (
    directory &&
    (!relativeDirectory.test(directory) ||
      directory.split('/').some((part) => part === '.' || part === '..'))
  ) {
    return null;
  }

  const spec = `github:${owner}/${name}#${entry.commit}`;
  return directory ? `${spec}&path:/${directory}` : spec;
}
