import { describe, expect, it } from 'vitest';

import { buildSubmissionArtifacts, normalizeGitHubRepository } from './submission.js';

describe('plugin submission artifacts', () => {
  it('normalizes a public GitHub repository', () => {
    expect(normalizeGitHubRepository('https://github.com/Example/dsh-clock.git/')).toEqual({
      coordinate: 'Example/dsh-clock',
      owner: 'Example',
      repository: 'https://github.com/Example/dsh-clock',
      repo: 'dsh-clock',
    });
    expect(normalizeGitHubRepository('Example/dsh-clock').coordinate).toBe('Example/dsh-clock');
  });

  it('rejects non-GitHub repositories', () => {
    expect(() => normalizeGitHubRepository('https://gitlab.com/example/plugin')).toThrow('GitHub');
    expect(() => normalizeGitHubRepository('https://github.com/example/plugin/issues')).toThrow(
      'repository',
    );
  });

  it('builds a single-field Issue handoff and live badge snippets', () => {
    const artifacts = buildSubmissionArtifacts({
      repository: 'https://github.com/Example/dsh-clock',
    });

    const issue = new URL(artifacts.issueUrl);
    expect(`${issue.origin}${issue.pathname}`).toBe(
      'https://github.com/dsh-pub/dsh-pub/issues/new',
    );
    expect(issue.searchParams.get('template')).toBe('plugin-submission.yml');
    expect(issue.searchParams.get('title')).toBe('[Plugin submission] Example/dsh-clock');
    expect(issue.searchParams.get('repository')).toBe('https://github.com/Example/dsh-clock');
    expect([...issue.searchParams.keys()]).toEqual(['template', 'title', 'repository']);
    expect(issue.searchParams.has('labels')).toBe(false);
    expect(issue.searchParams.has('body')).toBe(false);
    expect(artifacts.badgeUrl).toBe('https://dsh.pub/api/badges/Example/dsh-clock.svg');
    expect(artifacts.markdown).toContain('[![dsh.pub registry status](');
    expect(artifacts.markdown).toContain('https://dsh.pub/en/plugins/?q=Example%2Fdsh-clock');
    expect(artifacts.html).toContain('<img src="https://dsh.pub/api/badges/Example/dsh-clock.svg');
  });
});
