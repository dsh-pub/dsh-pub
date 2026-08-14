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

  it('builds a single-file pull request handoff and live badge snippets', () => {
    const artifacts = buildSubmissionArtifacts({
      repository: 'https://github.com/Example/dsh-clock',
    });

    const submission = new URL(artifacts.submissionUrl);
    expect(`${submission.origin}${submission.pathname}`).toBe(
      'https://github.com/dsh-pub/dsh-pub/new/main',
    );
    expect(submission.searchParams.get('filename')).toBe('submissions/example--dsh-clock.json');
    expect(JSON.parse(submission.searchParams.get('value') ?? '')).toEqual({
      repository: 'https://github.com/Example/dsh-clock',
      schemaVersion: 1,
    });
    expect(submission.searchParams.get('message')).toBe('submit: Example/dsh-clock');
    expect([...submission.searchParams.keys()]).toEqual(['filename', 'value', 'message']);
    expect(artifacts.submissionPath).toBe('submissions/example--dsh-clock.json');
    expect(artifacts.badgeUrl).toBe('https://dsh.pub/api/badges/Example/dsh-clock.svg');
    expect(artifacts.markdown).toContain('[![dsh.pub registry status](');
    expect(artifacts.markdown).toContain('https://dsh.pub/en/plugins/?q=Example%2Fdsh-clock');
    expect(artifacts.html).toContain('<img src="https://dsh.pub/api/badges/Example/dsh-clock.svg');
  });
});
