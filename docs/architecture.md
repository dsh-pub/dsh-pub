# Architecture

## Repository Layers

```text
apps/*       = deployable or runnable applications
packages/*   = reusable libraries and stable internal boundaries
e2e/*        = integration tests across assembled system boundaries
evals/*      = evaluations that call real models
docs/*       = durable project knowledge
scripts/*    = local automation
.github/*    = CI/CD and collaboration automation
```

The template reserves stack-neutral application slots under `apps/android`, `apps/ios`, and `apps/web`. Select native or cross-platform frameworks only when a concrete product requires them. `apps/server` is the optional backend runtime.

## Default Application Layout

When a web stack is selected for `apps/web`, prefer this internal shape:

```text
apps/web/
├── src/
│   ├── app/          # framework router or app shell
│   ├── routes/       # thin route segments
│   ├── features/     # business feature modules
│   ├── services/     # client-side API wrappers
│   ├── store/        # client state
│   └── styles/       # app-level styles
└── package.json
```

Keep route files thin. Move business logic into `features`, shared logic into `packages/domain`, and cross-app utilities into `packages/utils`.
