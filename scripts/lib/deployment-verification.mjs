import { setTimeout as delay } from 'node:timers/promises';

const CLOUDFLARE_APP_NAME = 'Cloudflare Workers and Pages';
const CLOUDFLARE_CHECK_NAME = 'Workers Builds: dsh-pub';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class DeploymentVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const verificationError = (code, message) => {
  throw new DeploymentVerificationError(code, message);
};

export function cloudflareDeploymentState(checkRuns) {
  if (!Array.isArray(checkRuns)) return { state: 'missing' };
  const matching = checkRuns
    .filter(
      (check) => check?.app?.name === CLOUDFLARE_APP_NAME && check?.name === CLOUDFLARE_CHECK_NAME,
    )
    .sort((left, right) => Number(right?.id ?? 0) - Number(left?.id ?? 0));
  const check = matching[0];
  if (!check) return { state: 'missing' };
  const checkId = Number.isSafeInteger(check.id) ? check.id : undefined;
  if (check.status !== 'completed') return { ...(checkId ? { checkId } : {}), state: 'pending' };
  if (check.conclusion === 'success') {
    return { ...(checkId ? { checkId } : {}), state: 'success' };
  }
  return {
    ...(checkId ? { checkId } : {}),
    conclusion: typeof check.conclusion === 'string' ? check.conclusion : 'unknown',
    state: 'failure',
  };
}

const catalogIsLive = (response, pageSlug) =>
  response?.status === 200 &&
  typeof response.contentType === 'string' &&
  response.contentType.toLocaleLowerCase().startsWith('text/html') &&
  typeof response.body === 'string' &&
  response.body.includes(`/en/plugins/${pageSlug}/`);

const badgeIsLive = (response) =>
  response?.status === 200 &&
  typeof response.contentType === 'string' &&
  response.contentType.toLocaleLowerCase().startsWith('image/svg+xml') &&
  typeof response.body === 'string' &&
  response.body.includes('registry status: listed');

export function submissionReportDecision({
  deploymentErrorCode,
  deploymentResult,
  deploymentVerified,
  integrateResult,
  submissionErrorCode,
  submissionStatus,
  validateResult,
}) {
  const deploymentPassed = deploymentResult === 'success' && deploymentVerified === 'true';
  const integrationPassed =
    submissionStatus === 'already-listed' ||
    (submissionStatus === 'ready' && integrateResult === 'success');
  if (validateResult === 'success' && integrationPassed && deploymentPassed) {
    return { state: 'closed', statusLabel: 'submission-integrated' };
  }
  const safeCode = (value) =>
    typeof value === 'string' && /^[a-z_]+$/.test(value) ? value : undefined;
  const code =
    safeCode(submissionErrorCode) ??
    safeCode(deploymentErrorCode) ??
    (validateResult === 'failure'
      ? 'quality_gate_failed'
      : integrateResult === 'failure'
        ? 'integration_failed'
        : 'deployment_verification_failed');
  return { code, state: 'open', statusLabel: 'submission-failed' };
}

const defaultSleep = (milliseconds) => delay(milliseconds);

export async function verifyPluginDeployment({
  badgeUrl,
  catalogUrl,
  commitSha,
  getCheckRuns,
  now = Date.now,
  pageSlug,
  pollIntervalMs = 10_000,
  readBadge,
  readCatalog,
  requireCheck = true,
  sleep = defaultSleep,
  timeoutMs = 15 * 60_000,
}) {
  if (requireCheck && (!SHA_PATTERN.test(commitSha) || typeof getCheckRuns !== 'function')) {
    verificationError('invalid_deployment_input', 'A pinned deployment commit is required.');
  }
  if (!PAGE_SLUG_PATTERN.test(pageSlug) || !badgeUrl || !catalogUrl) {
    verificationError('invalid_deployment_input', 'Live plugin coordinates are invalid.');
  }
  if (typeof readBadge !== 'function' || typeof readCatalog !== 'function') {
    verificationError('invalid_deployment_input', 'Live deployment readers are required.');
  }

  const deadline = now() + timeoutMs;
  let lastCheckState = requireCheck ? 'missing' : 'success';
  let checkId;
  let deploymentReady = !requireCheck;

  while (true) {
    if (requireCheck && !deploymentReady) {
      let checkRuns;
      try {
        checkRuns = await getCheckRuns(commitSha);
      } catch {
        verificationError('deployment_api_failed', 'Cloudflare check runs could not be read.');
      }
      const check = cloudflareDeploymentState(checkRuns);
      lastCheckState = check.state;
      checkId = check.checkId;
      if (check.state === 'failure') {
        verificationError(
          'deployment_failed',
          `Cloudflare Workers build failed with conclusion ${check.conclusion}.`,
        );
      }
      deploymentReady = check.state === 'success';
    }

    if (deploymentReady) {
      try {
        const [catalog, badge] = await Promise.all([readCatalog(catalogUrl), readBadge(badgeUrl)]);
        if (catalogIsLive(catalog, pageSlug) && badgeIsLive(badge)) {
          return { ...(checkId ? { checkId } : {}), live: true };
        }
      } catch {
        // A successful build can take a short time to become visible at the public edge.
      }
    }

    if (now() >= deadline) {
      if (deploymentReady) {
        verificationError(
          'live_verification_failed',
          'The Cloudflare build passed, but the live catalog and badge did not become consistent.',
        );
      }
      verificationError(
        lastCheckState === 'missing' ? 'deployment_not_triggered' : 'deployment_timeout',
        'The expected Cloudflare Workers build did not complete before the deadline.',
      );
    }
    await sleep(pollIntervalMs);
  }
}
