import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const DEFAULT_TIMEOUT_MS = 30_000;

export function runCommand(command, args = [], options = {}) {
  const startedAt = performance.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    input: options.input,
    shell: false,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  if (result.error && result.error.code !== 'ETIMEDOUT') {
    throw result.error;
  }

  return {
    durationMs: performance.now() - startedAt,
    signal: result.signal,
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}
