# DSH Pub

[dsh.pub](https://dsh.pub) is the bilingual, source-backed registry for the DeepSeek Harness plugin
ecosystem. It catalogs the current built-in modules, explains runtime and UI capabilities, and
separates atomic modules, built-in profile layers, and future independently installable bundles.

```text
DeepSeek Harness source
        │ pinned catalog sync
        ▼
219 source packages ──► 170 loadable plugins ──► Astro pages in English + Chinese
        │
        └── 3 manifest-declared bundles ──► built-in profile activation layers

Future external Git bundle ──► dsh-pub CLI ──► native dsh plugin add
                                            └─► D1 completed-install count
```

## Workspace

```text
apps/
├── web/       Astro static registry
├── server/    Cloudflare Worker install API and locale routing
└── cli/       GitHub bundle installer (`dsh-pub`)
packages/
└── catalog/   generated Harness snapshot and typed access
migrations/    D1 event and aggregate schema
```

## Local development

```bash
npm install
npm run build
npm run dev --workspace @dsh-pub/web
```

The Web app runs at `http://127.0.0.1:4321`. To run the complete Worker boundary locally:

```bash
npx wrangler d1 migrations apply dsh-pub --local
npx wrangler dev --local --port 8787
```

## Catalog sync

The generated catalog is pinned to a known DeepSeek Harness commit and refuses a dirty source
checkout.

```bash
node scripts/sync-harness-catalog.mjs
```

Override the default neighboring checkout only when intentionally verifying another local path:

```bash
node scripts/sync-harness-catalog.mjs --source /path/to/deepseek-harness
```

## CLI

```bash
npx --yes https://dsh.pub/cli/dsh-pub-0.1.1.tgz add owner/repo \
  --path packages/my-bundle \
  --profile web
```

The command resolves a public GitHub ref to an exact commit, validates that the selected package
declares `dsh.bundle.patch`, removes the validation checkout, and passes a persistent commit-pinned
Git spec to `dsh plugin --profile … add …`. Only a successful native install reports completion.
Telemetry is best-effort and can be disabled with `DO_NOT_TRACK=1` or `DISABLE_TELEMETRY=1`.

The current three Harness bundles are built-in monorepo profile layers, not standalone Git
packages: their `workspace:` dependencies require the Harness workspace. The catalog therefore
shows them as **built-in profile layers** without an install command or install count.

The public metric means **CLI-reported completed installs**. It is not unique users, GitHub clone
traffic, active usage, or installs performed directly through Git or the native DSH command.

The MVP serves the versioned npm tarball from dsh.pub. The `dsh-pub` npm package name is available,
but publishing the shorter `npx dsh-pub` alias requires an authenticated npm session.

## Quality gates

```bash
npm run lint
npm run test
npm run e2e
npm run build
```

`npm run eval` remains separate because it may call real models and consume credentials.

## Cloudflare deployment

The Worker serves `apps/web/dist` as static assets and runs first only for `/` and `/api/*`. Plugin
source and documentation stay in GitHub; D1 stores only install event state and aggregate counts.

```bash
npx wrangler d1 create dsh-pub
# Replace the placeholder database_id in wrangler.jsonc.
npx wrangler d1 migrations apply dsh-pub --remote
npm run build
npx wrangler deploy
```

See [product decisions](docs/product.md), [architecture](docs/architecture.md), and
[research evidence](docs/research.md).
