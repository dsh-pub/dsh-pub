# Shared E2E Support Rules

This directory contains runner-neutral helpers shared by template, CLI, server, or other E2E callers.

- Add a helper only after at least two callers need the same boundary behavior.
- Keep the interface small and independent of Playwright, XCTest, Android, Promptfoo, or another runner.
- Start subprocesses without a shell unless shell behavior is explicitly under test.
- Treat timeouts, cleanup, stdout, stderr, exit status, and signals as public behavior.
- Keep generated output beneath `.cache/test-results/` and never write credentials into transcripts or paths.
- Cover every exported behavior through `support.test.mjs`.
