# DSH Pub

[dsh.pub](https://dsh.pub) is the bilingual, source-backed registry for the DeepSeek Harness plugin
ecosystem. It catalogs the current built-in modules, explains runtime and UI capabilities, and
separates atomic modules, built-in profile layers, and community bundles pinned to public source.

```text
DeepSeek Harness source
        │ pinned catalog sync
        ▼
219 source packages ──► 170 loadable plugins ──► Astro pages in English + Chinese
        │
        └── 3 manifest-declared bundles ──► built-in profile activation layers

Public plugin Issue ──► static contract checks ──► main ──► Cloudflare Workers
        │
        └── community Git bundle ──► dshpub CLI ──► native dsh plugin add
                                                                └─► D1 completed-install count
```

## Workspace

```text
apps/
├── web/       Astro static registry
├── server/    Cloudflare Worker install API and locale routing
└── cli/       GitHub bundle installer (`dshpub`)
packages/
└── catalog/   generated Harness snapshot and typed access
migrations/    D1 event and aggregate schema
```

## Local development

```bash
npm install
npm run build:og
npm run build
npm run dev --workspace @dsh-pub/web
```

To enable Google Analytics in a production build, provide the public GA4 Measurement ID:

```bash
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build
```

The build emits a bilingual sitemap index at `/sitemap-index.xml`, crawler policy at
`/robots.txt`, and canonical, hreflang, Open Graph, Twitter Card, and JSON-LD metadata on every
indexable page.

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
npx dshpub add owner/repo \
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

## Submit a plugin

Use the bilingual submission page at [dsh.pub/submit](https://dsh.pub/en/submit/) or open the
[GitHub Issue Form](https://github.com/dsh-pub/dsh-pub/issues/new?template=plugin-submission.yml)
directly. Both create the same public queue. The submission workflow resolves the current public
default-branch commit, reads the manifest-declared bundle contract and committed files without
executing third-party code, runs the complete dsh.pub quality gates, and fast-forwards `main` only
when all checks pass. The existing Cloudflare Workers Git integration deploys `main` automatically.
Anyone may nominate a public repository; the Issue author is not treated as a verified publisher,
and an existing repository/package-path coordinate cannot be overwritten through this flow.

The web submission page also generates Markdown and HTML badge snippets. The live badge reports
`not listed` until the registry commit is deployed, then changes to `listed` (with a short cache).
The successful Issue comment returns the same snippets for authors who submit directly on GitHub.

The `dsh-plugin` GitHub topic remains useful for ecosystem discovery, but it is not an automatic
submission queue. Listing proves only that a pinned public bundle contract and required committed
files passed automated checks; it is not a human review, security audit, runtime smoke test, quality
score, or official endorsement. Older records labeled `community-reviewed` retain their historical
provenance.

The public metric means **CLI-reported completed installs**. It is not unique users, GitHub clone
traffic, active usage, or installs performed directly through Git or the native DSH command.

The public installer is the `dshpub` package on npm. Run it with `npx dshpub`.

## Quality gates

```bash
npm run lint
npm run test
npx playwright install chromium
npm run e2e
npm run build
```

The one-time Playwright install makes the catalog filter E2E independent of a machine's system
browser. CI installs the same Chromium revision with its required OS dependencies.

`npm run eval` remains separate because it may call real models and consume credentials.

## Cloudflare deployment

The Worker serves `apps/web/dist` as static assets and runs first only for `/` and `/api/*`. Plugin
source and documentation stay in GitHub; D1 stores only install event state and aggregate counts.
Production Workers Builds watches every path on `dsh-pub/dsh-pub` `main`, runs `npm run build`, and
deploys with `npx wrangler deploy`.

```bash
npx wrangler d1 create dsh-pub
# Replace the placeholder database_id in wrangler.jsonc.
npx wrangler d1 migrations apply dsh-pub --remote
npm run build
npx wrangler deploy
```

See [product decisions](docs/product.md), [architecture](docs/architecture.md), and
[research evidence](docs/research.md).

## License

DSH Pub is available under the [MIT License](LICENSE). Generated catalog documentation derived from
DeepSeek Harness retains its upstream notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
