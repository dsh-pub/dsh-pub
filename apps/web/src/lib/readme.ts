import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

import type { CatalogEntry } from './catalog-types.js';
import { localized, provenanceStatus } from './catalog-types.js';
import type { Locale } from './i18n.js';

const textCache = new Map<string, Promise<string | null>>();
const MAX_CONCURRENT_README_FETCHES = 8;
let activeReadmeFetches = 0;
const readmeFetchWaiters: Array<() => void> = [];

async function withReadmeFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeReadmeFetches >= MAX_CONCURRENT_README_FETCHES) {
    await new Promise<void>((resolve) => readmeFetchWaiters.push(resolve));
  }
  activeReadmeFetches += 1;
  try {
    return await task();
  } finally {
    activeReadmeFetches -= 1;
    readmeFetchWaiters.shift()?.();
  }
}

export function githubRawUrl(repository: string, commit: string, path: string | undefined): string {
  if (!repository || !commit || !path) return '';
  let url: URL;
  try {
    url = new URL(repository.replace(/\.git$/i, ''));
  } catch {
    return '';
  }
  if (url.hostname !== 'github.com') return '';
  const [, owner, repo] = url.pathname.split('/');
  if (!owner || !repo) return '';
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${path.replace(/^\/+/, '')}`;
}

export function isReadmeContentUrl(value: string): boolean {
  return /^https:\/\/raw\.githubusercontent\.com\//i.test(value);
}

export function readmeContentUrl(entry: CatalogEntry, locale: Locale): string {
  const stored = localized(entry.docs?.readme, locale).trim();
  if (isReadmeContentUrl(stored)) return stored;

  const path =
    locale === 'zh'
      ? entry.docs?.readmeZhPath || entry.docs?.readmePath || 'README.md'
      : entry.docs?.readmePath || 'README.md';
  return githubRawUrl(entry.source.repository, entry.source.commit, path);
}

function resolveWithinCommitTree(filePath: string, relativeTarget: string): string | null {
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
  const parts = [...dir.split('/').filter(Boolean), ...relativeTarget.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

export function absolutizeMarkdownUrls(markdown: string, rawFileUrl: string): string {
  const match = rawFileUrl.match(
    /^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/)(.+)$/i,
  );
  if (!match) return markdown;
  const [, prefix, filePath] = match;

  return markdown.replace(
    /(!?\[[^\]]*]\()([^)]+)(\))/g,
    (full, linkPrefix: string, target: string, suffix: string) => {
      const trimmed = target.trim();
      if (!trimmed || /^(https?:|mailto:|data:|#)/i.test(trimmed) || trimmed.startsWith('//')) {
        return full;
      }
      const resolved = resolveWithinCommitTree(filePath, trimmed);
      if (!resolved) return full;
      return `${linkPrefix}${prefix}${resolved}${suffix}`;
    },
  );
}

function contentsApiUrl(rawUrl: string): string | null {
  const match = rawUrl.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
  );
  if (!match) return null;
  const [, owner, repo, commit, path] = match;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(commit)}`;
}

export async function fetchReadmeMarkdown(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!rawUrl || process.env.DSH_SKIP_README_FETCH === '1') return null;

  const cached = textCache.get(rawUrl);
  if (cached) return cached;

  const pending = withReadmeFetchSlot(async () => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const apiUrl = token ? contentsApiUrl(rawUrl) : null;
    const requestUrl = apiUrl ?? rawUrl;
    const headers: Record<string, string> = {
      'User-Agent': 'dsh-pub-static-build',
      Accept: apiUrl ? 'application/vnd.github.raw' : 'text/plain',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetchImpl(requestUrl, { headers });
      if (!response.ok) return null;
      const text = await response.text();
      return text.trim() ? text : null;
    } catch {
      return null;
    }
  });

  textCache.set(rawUrl, pending);
  return pending;
}

export function sanitizeReadmeHtml(html: string, entry: CatalogEntry): string {
  const provenance = provenanceStatus(entry);
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(
      provenance === 'community-automated' ? ['details', 'summary'] : ['img', 'details', 'summary'],
    ),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
    },
    allowedSchemes: ['https', 'http'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer' }, true),
    },
  });
}

export async function loadReadmeHtml(
  entry: CatalogEntry,
  locale: Locale,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const rawUrl = readmeContentUrl(entry, locale);
  if (!rawUrl) return '';

  const markdown = await fetchReadmeMarkdown(rawUrl, fetchImpl);
  if (!markdown) return '';

  const withAbsoluteUrls = absolutizeMarkdownUrls(markdown, rawUrl);
  const rawHtml = await marked.parse(withAbsoluteUrls, { gfm: true });
  return sanitizeReadmeHtml(rawHtml, entry);
}

/** Test helper: clear the in-memory fetch cache. */
export function clearReadmeFetchCache(): void {
  textCache.clear();
}
