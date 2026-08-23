/**
 * Build a pinned raw.githubusercontent.com URL for a catalog README path.
 * Catalog JSON stores these URLs instead of README markdown bodies.
 */
export function githubRawUrl(repository, commit, path) {
  if (
    typeof repository !== 'string' ||
    typeof commit !== 'string' ||
    typeof path !== 'string' ||
    !repository ||
    !commit ||
    !path
  ) {
    return '';
  }
  let url;
  try {
    url = new URL(repository.replace(/\.git$/i, ''));
  } catch {
    return '';
  }
  if (url.hostname !== 'github.com') return '';
  const [, owner, repo] = url.pathname.split('/');
  if (!owner || !repo) return '';
  const cleanPath = path.replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${cleanPath}`;
}

export function isReadmeContentUrl(value) {
  return typeof value === 'string' && /^https:\/\/raw\.githubusercontent\.com\//i.test(value);
}
