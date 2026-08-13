# Template E2E Rules

Tests in this directory verify behavior owned by the template itself, not by a generated product's UI or domain.

- Exercise public lifecycle boundaries such as `npm install`, bootstrap scripts, generated files, and committed quality baselines.
- Use `node:test` so these checks remain independent of an application stack.
- Build fixtures in disposable workspaces and register cleanup before running the behavior under test.
- Keep expected values explicit and verify filesystem state only when filesystem output is part of the public contract.
- Do not move application journeys here; place those beside their owning app.
- Keep stable case IDs in test names and preserve the JUnit evidence emitted by `run.mjs`.
