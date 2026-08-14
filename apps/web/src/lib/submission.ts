export interface GitHubRepositoryCoordinate {
  coordinate: string;
  owner: string;
  repo: string;
  repository: string;
}

export interface SubmissionInput {
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

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export function buildSubmissionArtifacts(input: SubmissionInput): SubmissionArtifacts {
  const repository = normalizeGitHubRepository(input.repository);
  const issueUrl = new URL('https://github.com/dsh-pub/dsh-pub/issues/new');
  issueUrl.searchParams.set('template', 'plugin-submission.yml');
  issueUrl.searchParams.set('title', `[Plugin submission] ${repository.coordinate}`);
  issueUrl.searchParams.set('repository', repository.repository);

  const badgeUrl = new URL(`https://dsh.pub/api/badges/${repository.owner}/${repository.repo}.svg`);
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
