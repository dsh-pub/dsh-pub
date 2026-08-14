import { readFile } from 'node:fs/promises';

import { submissionReportDecision } from './lib/deployment-verification.mjs';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const issueNumber = Number(process.env.SUBMISSION_ISSUE_NUMBER);
const token = process.env.GITHUB_TOKEN;
const resultPath = process.env.SUBMISSION_RESULT_PATH;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error('GITHUB_REPOSITORY is invalid.');
}
if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || !token || !resultPath) {
  throw new Error('Submission report environment is incomplete.');
}

const result = JSON.parse(await readFile(resultPath, 'utf8'));
const validateResult = process.env.VALIDATE_RESULT;
const integrateResult = process.env.INTEGRATE_RESULT;
const deploymentResult = process.env.DEPLOYMENT_RESULT;
const deploymentVerified = process.env.DEPLOYMENT_VERIFIED;
const deploymentErrorCode = process.env.DEPLOYMENT_ERROR_CODE;
const commitSha = process.env.INTEGRATED_COMMIT_SHA ?? '';
const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const github = async (path, init = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) throw new Error(`GitHub report request failed with status ${response.status}.`);
  return response.status === 204 ? undefined : response.json();
};

const labels = [
  { name: 'plugin-submission', color: '0969da', description: 'Plugin submitted to dsh.pub' },
  { name: 'submission-failed', color: 'b42318', description: 'Automated catalog checks failed' },
  {
    name: 'submission-integrated',
    color: '25804f',
    description: 'Automatically listed on dsh.pub',
  },
];
for (const label of labels) {
  const response = await fetch(`${apiBase}/labels`, {
    body: JSON.stringify(label),
    headers,
    method: 'POST',
  });
  if (!response.ok && response.status !== 422) {
    throw new Error(`GitHub label request failed with status ${response.status}.`);
  }
}

const existingIssue = await github(`/issues/${issueNumber}`);
const existingLabels = Array.isArray(existingIssue.labels)
  ? existingIssue.labels
      .map((label) => (typeof label === 'string' ? label : label?.name))
      .filter((name) => typeof name === 'string')
      .filter((name) => !name.startsWith('submission-'))
  : [];

const integrationResultForReport =
  integrateResult === 'success' &&
  (!/^[a-f0-9]{40}$/.test(commitSha) ||
    typeof result.pageSlug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.pageSlug))
    ? 'failure'
    : integrateResult;
const decision = submissionReportDecision({
  deploymentErrorCode,
  deploymentResult,
  deploymentVerified,
  integrateResult: integrationResultForReport,
  submissionErrorCode: result.code,
  submissionStatus: result.status,
  validateResult,
});
const { state, statusLabel } = decision;
let comment;
if (state === 'closed' && result.status === 'already-listed') {
  comment = `This plugin is already listed on dsh.pub.\n\nWorkflow: ${runUrl}`;
} else if (
  state === 'closed' &&
  /^[a-f0-9]{40}$/.test(commitSha) &&
  typeof result.pageSlug === 'string' &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.pageSlug)
) {
  const badgeUrl = new URL(result.badgeUrl);
  const catalogUrl = new URL(result.catalogUrl);
  if (badgeUrl.origin !== 'https://dsh.pub' || catalogUrl.origin !== 'https://dsh.pub') {
    throw new Error('Generated badge coordinates are invalid.');
  }
  comment = `Automatically listed on dsh.pub.\n\nCatalog: ${catalogUrl}\nCommit: \`${commitSha}\`\nWorkflow: ${runUrl}\n\nREADME badge (Markdown):\n\n\`\`\`markdown\n${result.markdownBadge}\n\`\`\`\n\nREADME badge (HTML):\n\n\`\`\`html\n${result.htmlBadge}\n\`\`\``;
} else {
  comment = `Submission was not integrated or did not become live.\n\nCode: \`${decision.code}\`\nWorkflow: ${runUrl}\n\nThis Issue remains open.`;
}

await github(`/issues/${issueNumber}`, {
  body: JSON.stringify({ labels: [...new Set([...existingLabels, statusLabel])], state }),
  method: 'PATCH',
});
await github(`/issues/${issueNumber}/comments`, {
  body: JSON.stringify({ body: comment }),
  method: 'POST',
});

console.log(JSON.stringify({ issue: issueNumber, state, status: statusLabel }));
