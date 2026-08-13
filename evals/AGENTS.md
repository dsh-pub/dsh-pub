# Model Evaluation Rules

This directory owns evaluations that call real models. Its stable command is:

```bash
npm run eval
```

## Activation

- The committed `*.example.*` files are a non-executing Promptfoo starter. Copy or rename them only after the product has selected its model provider and real product boundary.
- Until a real `*.test.ts` or `*.spec.ts` suite exists, `npm run eval` must continue to fail with `No test files found`. Do not add mocks or placeholder tests to make the command pass.
- If Promptfoo becomes the selected runner, install and pin it explicitly, activate `promptfooconfig.example.yaml`, and preserve the root `npm run eval` command.

## Evaluation Contract

Every active suite must declare:

- representative inputs and expected behavior
- a stable `metadata.caseId`
- dataset, rubric, provider, and assertion versions
- provider and model identifiers plus relevant generation settings
- explicit scoring rubrics and pass thresholds
- credentials supplied only through environment variables
- expected cost, concurrency, and rate-limit behavior

Model calls in this directory must cross the same real product boundary used in production. Do not replace them with mocks or evaluate a bare model when the product exposes an API, CLI, or application workflow. Mocked model behavior belongs in unit or integration tests.

Model evals run serially by default to reduce cost spikes and rate-limit failures. Keep generated reports and raw model output in the ignored `.cache/test-results/eval/` directory; never commit secrets or sensitive prompts.

## Layout

- `datasets/`: versioned cases and assertions
- `providers/`: adapters that invoke the real product boundary
- `assertions/`: deterministic domain checks
- `rubrics/`: human-readable model-graded criteria
