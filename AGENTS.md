# Agent Engineering Rules

## Project Shape

- Use `apps/*` for deployable or runnable applications.
- Use `packages/*` for reusable libraries and infrastructure.
- Keep the repository root for workspace config, CI, scripts, docs, and agent instructions only.
- Do not put product application source directly under root `src/`.

## Web App Slot

- `apps/web` is intentionally stack-neutral.
- Do not add Next.js, Vite, React, Astro, or any other web framework until the project chooses one explicitly.
- After a stack is chosen, keep framework-specific files inside `apps/web`.

## Project Bootstrap

- From `onee-workspace`, create new products with `make create-product name=<project-name>`.
- For direct GitHub template usage, clone into the intended lowercase kebab-case directory and run `npm install`.
- `npm install` derives the project name from the clone directory and initializes package names, workspace scope, lockfile, README, dependencies, and Git hooks.
- After the first `npm install`, complete every field in **Project Context** before starting implementation. Project setup is incomplete while any field remains `TBD`.
- Do not manually search and replace `onee-product-template` or `@template/*`; keep identity changes in the install lifecycle scripts.
- Initialization is idempotent and must not overwrite custom workspace package names.

## Project Context

This is the shared Project/Mission context for every agent working in the repository. Keep it concise and current.
It is distinct from the project's domain glossary: resolved, project-specific terminology belongs in
the root `CONTEXT.md` described under **Domain docs**.

- **Background / Problem:** TBD — explain why the project exists and the problem it addresses.
- **Goal:** TBD — state the project's long-term goal.
- **Current Goal:** TBD — state the outcome that matters in the current stage.
- **Key Results:**
  - TBD — add observable results that show progress toward the current goal.

## Quality Gates

Before considering work complete, run the narrowest relevant check. For broad changes, run:

```bash
npm run lint
npm run test
npm run e2e
```

The deterministic quality chain is:

```text
lint -> test -> e2e
```

- `npm run lint`: deterministic static checks, including formatting, ESLint, and TypeScript.
- `npm run test`: isolated unit tests; do not call real external services or models.
- `npm run e2e`: integration tests across assembled application boundaries.
- `npm run eval`: evaluations that call real models with explicit datasets, rubrics, and pass thresholds. Do not replace those model calls with mocks.
- Run `npm run eval` explicitly or through the protected Model Eval workflow because it can consume credentials and incur model cost.
- Keep these command names stable when adopting framework-specific runners.
- `npm run build` is a separate packaging/deployment check.

## Docs

Project documentation lives in `docs/` as a set of focused files. Each file must stay under **1000 lines**; when a document grows past that threshold, split it into a folder with sub-documents.

| File                    | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `docs/architecture.md`  | Repository layers, module boundaries, and structural decisions                      |
| `docs/product.md`       | Product positioning, target user, MVP scope, non-goals, and success signals         |
| `docs/quality-gates.md` | Command contracts, CI gate, Model Eval workflow, and coverage baselines             |
| `docs/research.md`      | External evidence, comparable products, primary-source findings, and open questions |

Keep evidence and decisions separate: research informs product decisions but is not a commitment until reflected in `docs/product.md`. Agent-facing quality rules live in this file; `docs/quality-gates.md` holds the detailed contracts, CI workflows, and baseline schema.

## Agent skills

### Domain docs

Single-context: project-specific domain language lives in one root `CONTEXT.md`, with `docs/adr/`
reserved for architectural decisions. Both are created lazily when real terms or decisions are
resolved. See `docs/agents/domain.md`.

## Design Artifacts

- `design/` is an explicit root-level exception for design-system source files and review-only static prototypes.
- Keep `design/DESIGN.md` as the design-intent contract, `design/tokens.css` as the current exact-value token source, and all prototype HTML/CSS under `design/prototype/`.
- Design prototypes may be opened locally for review, but they are not deployable product applications; production UI and business behavior remain under `apps/*`.
- Keep `design/prototype/mobile-screen-model.js` as the canonical screen content and action-target source shared by `mobile.html` and `mobile-flow.html`; do not duplicate bound copy in either page or its Adapter.
- Files under `design/prototype/runtime/` are product-agnostic template infrastructure and may be auto-synced. Product models, state machines, Adapters, screen markup, coordinates, and brand styles stay project-owned.
- The template may include a clearly labeled generic design scaffold before **Project Context** is complete. After initialization, replace its default product thesis with decisions grounded in `docs/product.md`; research alone does not create a product commitment.

## Directory Boundaries

- `apps/android`: Android product slot; keep stack-neutral until the project selects native Android or a cross-platform framework.
- `apps/ios`: iOS product slot; keep stack-neutral until the project selects native iOS or a cross-platform framework.
- `apps/web`: user-facing web product.
- `apps/server`: backend service or API runtime.
- `apps/cli`: command-line program.
- `apps/skill`: agent skill that calls the product's capabilities.

Keep features close to the app that owns them. Extract into `packages/*` only when code is reused or represents a stable boundary.

## Pull Request Merge Policy

- Pull requests targeting `main` may use merge commits or rebase merges.
- Do not squash merge pull requests.
- With GitHub CLI, use `gh pr merge <number> --merge` or `gh pr merge <number> --rebase`; never use `--squash`.
