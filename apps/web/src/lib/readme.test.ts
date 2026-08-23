import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogEntry } from './catalog-types.js';
import {
  absolutizeMarkdownUrls,
  clearReadmeFetchCache,
  fetchReadmeMarkdown,
  githubRawUrl,
  isReadmeContentUrl,
  loadReadmeHtml,
  readmeContentUrl,
} from './readme.js';

const baseEntry = {
  id: 'demo',
  slug: 'demo',
  name: 'demo',
  version: '1.0.0',
  license: 'MIT',
  type: 'bundle',
  category: 'bundles',
  builtIn: false,
  description: { en: 'Demo', zh: '演示' },
  docs: {
    readmePath: 'README.md',
    readmeZhPath: 'docs/README.zh.md',
    readme: {
      en: 'https://raw.githubusercontent.com/acme/demo/abc123/README.md',
      zh: 'https://raw.githubusercontent.com/acme/demo/abc123/docs/README.zh.md',
    },
  },
  source: {
    repository: 'https://github.com/acme/demo',
    directory: '',
    commit: 'abc123',
  },
  runtime: { hostLoadable: true, configurable: null, client: null },
  capabilities: { tools: null, uiContributions: null, uiSlotsDeclared: null },
  availability: { profiles: null, defaultWeb: null },
  distribution: { installable: true, mode: 'git-bundle' },
} satisfies CatalogEntry;

afterEach(() => {
  clearReadmeFetchCache();
  delete process.env.DSH_SKIP_README_FETCH;
  delete process.env.GITHUB_TOKEN;
});

describe('readme helpers', () => {
  it('builds pinned raw GitHub URLs', () => {
    expect(githubRawUrl('https://github.com/acme/demo.git', 'abc123', 'README.md')).toBe(
      'https://raw.githubusercontent.com/acme/demo/abc123/README.md',
    );
    expect(isReadmeContentUrl('https://raw.githubusercontent.com/acme/demo/abc/README.md')).toBe(
      true,
    );
    expect(isReadmeContentUrl('# Heading')).toBe(false);
  });

  it('prefers stored README URLs and falls back to source paths', () => {
    expect(readmeContentUrl(baseEntry, 'en')).toBe(
      'https://raw.githubusercontent.com/acme/demo/abc123/README.md',
    );
    expect(
      readmeContentUrl(
        {
          ...baseEntry,
          docs: {
            readmePath: 'README.md',
            readmeZhPath: 'README.zh.md',
            readme: { en: '', zh: '' },
          },
        },
        'zh',
      ),
    ).toBe('https://raw.githubusercontent.com/acme/demo/abc123/README.zh.md');
  });

  it('rewrites relative markdown media to absolute raw URLs', () => {
    const rewritten = absolutizeMarkdownUrls(
      'See ![shot](./media/a.png) and [docs](GUIDE.md)',
      'https://raw.githubusercontent.com/acme/demo/abc123/README.md',
    );
    expect(rewritten).toContain('https://raw.githubusercontent.com/acme/demo/abc123/media/a.png');
    expect(rewritten).toContain('https://raw.githubusercontent.com/acme/demo/abc123/GUIDE.md');
  });

  it('fetches README markdown once per URL and renders sanitized HTML', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('# Hello\n\n<script>x</script>', { status: 200 }),
    );
    const html = await loadReadmeHtml(baseEntry, 'en', fetchImpl as unknown as typeof fetch);
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
    expect(html).not.toContain('<script');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await loadReadmeHtml(baseEntry, 'en', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('skips network fetch when DSH_SKIP_README_FETCH=1', async () => {
    process.env.DSH_SKIP_README_FETCH = '1';
    const fetchImpl = vi.fn();
    expect(
      await fetchReadmeMarkdown(baseEntry.docs!.readme!.en!, fetchImpl as unknown as typeof fetch),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
