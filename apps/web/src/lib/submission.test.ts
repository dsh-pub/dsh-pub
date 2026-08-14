import { describe, expect, it } from 'vitest';

import {
  buildSubmissionArtifacts,
  normalizeGitHubRepository,
  normalizePackagePath,
} from './submission.js';

describe('plugin submission artifacts', () => {
  it('normalizes a public GitHub repository and a safe package path', () => {
    expect(normalizeGitHubRepository('https://github.com/Example/dsh-clock.git/')).toEqual({
      coordinate: 'Example/dsh-clock',
      owner: 'Example',
      repository: 'https://github.com/Example/dsh-clock',
      repo: 'dsh-clock',
    });
    expect(normalizeGitHubRepository('Example/dsh-clock').coordinate).toBe('Example/dsh-clock');
    expect(normalizePackagePath(' packages/dsh-clock/ ')).toBe('packages/dsh-clock');
  });

  it('rejects non-GitHub repositories and escaping package paths', () => {
    expect(() => normalizeGitHubRepository('https://gitlab.com/example/plugin')).toThrow('GitHub');
    expect(() => normalizeGitHubRepository('https://github.com/example/plugin/issues')).toThrow(
      'repository',
    );
    expect(() => normalizePackagePath('../plugin')).toThrow('relative');
    expect(() => normalizePackagePath('/plugin')).toThrow('relative');
  });

  it('builds one deterministic Issue handoff and live badge snippets', () => {
    const artifacts = buildSubmissionArtifacts({
      category: 'tool',
      descriptionEn: 'Adds a clock tool to DeepSeek Harness.',
      descriptionZh: '为 DeepSeek Harness 增加时钟工具。',
      packagePath: 'packages/dsh-clock',
      repository: 'https://github.com/Example/dsh-clock',
    });

    const issue = new URL(artifacts.issueUrl);
    expect(`${issue.origin}${issue.pathname}`).toBe(
      'https://github.com/dsh-pub/dsh-pub/issues/new',
    );
    expect(issue.searchParams.get('template')).toBe('plugin-submission.yml');
    expect(issue.searchParams.get('title')).toBe('[Plugin submission] Example/dsh-clock');
    expect(issue.searchParams.get('repository')).toBe('https://github.com/Example/dsh-clock');
    expect(issue.searchParams.get('path')).toBe('packages/dsh-clock');
    expect(issue.searchParams.get('summary-en')).toBe('Adds a clock tool to DeepSeek Harness.');
    expect(issue.searchParams.get('category')).toBe('tool');
    expect(issue.searchParams.has('labels')).toBe(false);
    expect(issue.searchParams.has('body')).toBe(false);
    expect(artifacts.badgeUrl).toBe(
      'https://dsh.pub/api/badges/Example/dsh-clock.svg?path=packages%2Fdsh-clock',
    );
    expect(artifacts.markdown).toContain('[![dsh.pub registry status](');
    expect(artifacts.markdown).toContain('https://dsh.pub/en/plugins/?q=Example%2Fdsh-clock');
    expect(artifacts.html).toContain('<img src="https://dsh.pub/api/badges/Example/dsh-clock.svg');
  });
});
