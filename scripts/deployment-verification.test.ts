import { describe, expect, it } from 'vitest';

import {
  cloudflareDeploymentState,
  submissionReportDecision,
  verifyPluginDeployment,
} from './lib/deployment-verification.mjs';

const cloudflareCheck = (overrides: Record<string, unknown> = {}) => ({
  app: { name: 'Cloudflare Workers and Pages' },
  conclusion: null,
  id: 42,
  name: 'Workers Builds: dsh-pub',
  status: 'in_progress',
  ...overrides,
});

describe('plugin deployment verification', () => {
  it('accepts only the exact Cloudflare app and Workers build check', () => {
    expect(
      cloudflareDeploymentState([
        cloudflareCheck({ app: { name: 'GitHub Actions' }, conclusion: 'success', id: 100 }),
        cloudflareCheck({ conclusion: 'success', id: 101, name: 'Quality', status: 'completed' }),
      ]),
    ).toEqual({ state: 'missing' });

    expect(
      cloudflareDeploymentState([
        cloudflareCheck({ conclusion: 'success', id: 102, status: 'completed' }),
      ]),
    ).toEqual({ checkId: 102, state: 'success' });
  });

  it('waits for the newest exact check and confirms the live catalog and badge', async () => {
    let clock = 0;
    let checks = 0;
    const result = await verifyPluginDeployment({
      badgeUrl: 'https://dsh.pub/api/badges/example/plugin.svg',
      catalogUrl: 'https://dsh.pub/en/plugins/example-plugin/',
      commitSha: 'a'.repeat(40),
      getCheckRuns: async () => {
        checks += 1;
        return checks === 1
          ? [cloudflareCheck()]
          : [cloudflareCheck({ conclusion: 'success', id: 43, status: 'completed' })];
      },
      now: () => clock,
      pageSlug: 'example-plugin',
      pollIntervalMs: 1_000,
      readBadge: async () => ({
        body: '<svg aria-label="dsh.pub registry status: listed"></svg>',
        contentType: 'image/svg+xml; charset=utf-8',
        status: 200,
      }),
      readCatalog: async () => ({
        body: '<link rel="canonical" href="https://dsh.pub/en/plugins/example-plugin/">',
        contentType: 'text/html; charset=utf-8',
        status: 200,
      }),
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      timeoutMs: 5_000,
    });

    expect(result).toEqual({ checkId: 43, live: true });
    expect(checks).toBe(2);
  });

  it('fails closed when the exact Cloudflare check fails', async () => {
    await expect(
      verifyPluginDeployment({
        badgeUrl: 'https://dsh.pub/api/badges/example/plugin.svg',
        catalogUrl: 'https://dsh.pub/en/plugins/example-plugin/',
        commitSha: 'a'.repeat(40),
        getCheckRuns: async () => [cloudflareCheck({ conclusion: 'failure', status: 'completed' })],
        pageSlug: 'example-plugin',
        readBadge: async () => ({ body: '', contentType: 'image/svg+xml', status: 200 }),
        readCatalog: async () => ({ body: '', contentType: 'text/html', status: 200 }),
      }),
    ).rejects.toMatchObject({ code: 'deployment_failed' });
  });

  it('distinguishes a missing deployment trigger from a pending deployment timeout', async () => {
    const verify = (getCheckRuns: () => Promise<unknown[]>) => {
      let clock = 0;
      return verifyPluginDeployment({
        badgeUrl: 'https://dsh.pub/api/badges/example/plugin.svg',
        catalogUrl: 'https://dsh.pub/en/plugins/example-plugin/',
        commitSha: 'a'.repeat(40),
        getCheckRuns,
        now: () => clock,
        pageSlug: 'example-plugin',
        pollIntervalMs: 1_000,
        readBadge: async () => ({ body: '', contentType: 'image/svg+xml', status: 200 }),
        readCatalog: async () => ({ body: '', contentType: 'text/html', status: 200 }),
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        timeoutMs: 1_000,
      });
    };

    await expect(verify(async () => [])).rejects.toMatchObject({
      code: 'deployment_not_triggered',
    });
    await expect(verify(async () => [cloudflareCheck()])).rejects.toMatchObject({
      code: 'deployment_timeout',
    });
  });

  it('fails closed when the build passed but the catalog and badge are not both live', async () => {
    let clock = 0;
    await expect(
      verifyPluginDeployment({
        badgeUrl: 'https://dsh.pub/api/badges/example/plugin.svg',
        catalogUrl: 'https://dsh.pub/en/plugins/example-plugin/',
        commitSha: 'a'.repeat(40),
        getCheckRuns: async () => [cloudflareCheck({ conclusion: 'success', status: 'completed' })],
        now: () => clock,
        pageSlug: 'example-plugin',
        pollIntervalMs: 1_000,
        readBadge: async () => ({
          body: '<svg aria-label="dsh.pub registry status: missing"></svg>',
          contentType: 'image/svg+xml',
          status: 200,
        }),
        readCatalog: async () => ({
          body: '<a href="/en/plugins/example-plugin/">Example</a>',
          contentType: 'text/html',
          status: 200,
        }),
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'live_verification_failed' });
  });

  it('closes an Issue only after the live deployment is verified', () => {
    expect(
      submissionReportDecision({
        deploymentResult: 'success',
        deploymentVerified: 'true',
        integrateResult: 'success',
        submissionStatus: 'ready',
        validateResult: 'success',
      }),
    ).toEqual({ state: 'closed', statusLabel: 'submission-integrated' });

    expect(
      submissionReportDecision({
        deploymentErrorCode: 'deployment_failed',
        deploymentResult: 'failure',
        deploymentVerified: 'false',
        integrateResult: 'success',
        submissionStatus: 'ready',
        validateResult: 'success',
      }),
    ).toEqual({
      code: 'deployment_failed',
      state: 'open',
      statusLabel: 'submission-failed',
    });
  });
});
