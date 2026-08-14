export interface GitHubRepositoryCoordinate {
  coordinate: string;
  owner: string;
  repo: string;
  repository: string;
}

export interface SubmissionInput {
  category: string;
  descriptionEn: string;
  descriptionZh: string;
  packagePath: string;
  repository: string;
}

export interface SubmissionArtifacts {
  badgeUrl: string;
  catalogUrl: string;
  html: string;
  issueUrl: string;
  markdown: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._@-]+$/;

export function normalizeGitHubRepository(value: string): GitHubRepositoryCoordinate {
  const input = value.trim();
  if (!input) throw new Error('Enter a public GitHub repository.');

  let coordinate = input;
  if (input.includes('://')) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error('Enter a valid GitHub repository URL.');
    }
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'github.com') {
      throw new Error('Only public GitHub repositories are supported.');
    }
    if (url.search || url.hash) throw new Error('Use the repository URL without query or hash.');
    coordinate = url.pathname.replace(/^\/+|\/+$/g, '');
  }

  coordinate = coordinate.replace(/\.git$/i, '');
  const parts = coordinate.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Use a GitHub repository in owner/repository form.');
  }
  const [owner, repo] = parts;
  if (
    !owner ||
    !repo ||
    !OWNER_PATTERN.test(owner) ||
    !REPOSITORY_PATTERN.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    throw new Error('Use a valid GitHub owner and repository name.');
  }

  return {
    coordinate: `${owner}/${repo}`,
    owner,
    repo,
    repository: `https://github.com/${owner}/${repo}`,
  };
}

export function normalizePackagePath(value: string): string {
  const input = value.trim().replace(/\/+$/g, '');
  if (!input) return '';
  if (input.startsWith('/') || input.includes('\\') || input.includes('?') || input.includes('#')) {
    throw new Error('Package path must be a safe relative repository path.');
  }
  const segments = input.split('/');
  if (
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || !PATH_SEGMENT_PATTERN.test(segment),
    )
  ) {
    throw new Error('Package path must be a safe relative repository path.');
  }
  return segments.join('/');
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export function buildSubmissionArtifacts(input: SubmissionInput): SubmissionArtifacts {
  const repository = normalizeGitHubRepository(input.repository);
  const packagePath = normalizePackagePath(input.packagePath);
  const descriptionEn = input.descriptionEn.trim();
  const descriptionZh = input.descriptionZh.trim() || '_Not provided_';
  const category = input.category.trim();
  const issueUrl = new URL('https://github.com/dsh-pub/dsh-pub/issues/new');
  issueUrl.searchParams.set('template', 'plugin-submission.yml');
  issueUrl.searchParams.set('title', `[Plugin submission] ${repository.coordinate}`);
  issueUrl.searchParams.set('repository', repository.repository);
  issueUrl.searchParams.set('path', packagePath || '_root_');
  issueUrl.searchParams.set('summary-en', descriptionEn);
  issueUrl.searchParams.set('summary-zh', descriptionZh);
  issueUrl.searchParams.set('category', category);

  const badgeUrl = new URL(`https://dsh.pub/api/badges/${repository.owner}/${repository.repo}.svg`);
  if (packagePath) badgeUrl.searchParams.set('path', packagePath);
  const catalogUrl = new URL('https://dsh.pub/en/plugins/');
  catalogUrl.searchParams.set('q', repository.coordinate);
  const markdown = `[![dsh.pub registry status](${badgeUrl})](${catalogUrl})`;
  const html = `<a href="${escapeAttribute(String(catalogUrl))}"><img src="${escapeAttribute(String(badgeUrl))}" alt="dsh.pub registry status"></a>`;

  return {
    badgeUrl: String(badgeUrl),
    catalogUrl: String(catalogUrl),
    html,
    issueUrl: String(issueUrl),
    markdown,
  };
}
