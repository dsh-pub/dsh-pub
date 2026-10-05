import { describe, expect, it } from 'vitest';

import { excludeCatalogRepositories, parseDshToolsIndex } from './sync-dsh-tools-index.mjs';

const fixture = `
<article class="card">
  <div><img src="https://avatars.githubusercontent.com/u/1?v=4"><div>
    <a href="/plugins/acme-memory">Memory Kit</a>
    <p class="truncate text-xs text-zinc-500">Acme</p>
  </div></div>
  <a href="https://github.com/Acme/memory-kit">Source</a>
  <p class="mt-4 line-clamp-3 text-sm">A &amp; B memory plugin, stars in every workflow.</p>
  <div class="mt-4 flex flex-wrap gap-1.5">
    <span>Native Plugin</span><span>Memory &amp; Context</span><span>Active</span>
  </div>
  <div>1,234 stars</div><div>56 forks</div><div>Updated 2d ago</div>
</article>`;

describe('DSH.Tools public index parser', () => {
  it('keeps discovery metadata separate from canonical repository identity', () => {
    expect(parseDshToolsIndex(fixture)).toEqual([
      {
        id: 'github:acme/memory-kit',
        slug: 'acme-memory',
        name: 'Memory Kit',
        owner: 'Acme',
        description: 'A & B memory plugin, stars in every workflow.',
        sourceRepository: 'https://github.com/Acme/memory-kit',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
        resourceType: 'Native Plugin',
        category: 'Memory & Context',
        activity: 'Active',
        stars: 1234,
        forks: 56,
        updatedLabel: '2d ago',
        detailUrl: 'https://dsh.tools/plugins/acme-memory',
      },
    ]);
  });

  it('removes publisher-delisted repositories from the ecosystem snapshot', () => {
    const entries = parseDshToolsIndex(
      `${fixture}
<article class="card">
  <div><img src="https://avatars.githubusercontent.com/u/2?v=4"><div>
    <a href="/plugins/dsh-fal-image-gen">FAL Image Gen</a>
    <p class="truncate text-xs text-zinc-500">GooDAnDReaDY</p>
  </div></div>
  <a href="https://github.com/GooDAnDReaDY/dsh-fal-image-gen">Source</a>
  <p class="mt-4 line-clamp-3 text-sm">Archived FAL plugin.</p>
  <div class="mt-4 flex flex-wrap gap-1.5">
    <span>Native Plugin</span><span>Other</span><span>Archived</span>
  </div>
  <div>1 stars</div><div>0 forks</div><div>Updated 2d ago</div>
</article>`,
    );

    expect(entries).toHaveLength(2);
    expect(
      excludeCatalogRepositories(
        entries,
        new Set(['https://github.com/goodandready/dsh-fal-image-gen']),
      ).map((entry) => entry.sourceRepository),
    ).toEqual(['https://github.com/Acme/memory-kit']);
  });
});
