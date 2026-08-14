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

Browser submission ──► Turnstile ──► Worker + D1 ──► Cloudflare Workflow
                                                        │
                                                        └─► GitHub App ──► submission PR
                                                                                  │
                                      Cloudflare Workers ◄── main deploy ◄── automatic merge
        │
        └── community Git bundle ──► dshpub CLI ──► native dsh plugin add
                                                                └─► D1 completed-install count
```

## Workspace

```text
apps/
├── web/       Astro static registry
├── server/    Cloudflare Worker install API and locale routing
├── cli/       GitHub bundle installer (`dshpub`)
└── dsh-plugin/ In-DSH bilingual visual directory
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

## DSH plugin directory

The repository also ships `@dsh-pub/plugin-directory`, a read-only visual catalog inside DSH
Settings. It bundles the same public plugin and bundle surface as the site, supports bilingual
search, eight capability topics, provenance/runtime/distribution/type filters, and deterministic
sorting without loading third-party code.

```bash
npx dshpub add dsh-pub/dsh-pub --path apps/dsh-plugin --profile web
```

See [`apps/dsh-plugin/README.md`](apps/dsh-plugin/README.md) for its update and verification flow.

## Submit a plugin

Use the bilingual submission page at [dsh.pub/submit](https://dsh.pub/en/submit/). The browser sends
one public GitHub repository URL and a Turnstile token to the Worker. After verification, the Worker
stores a submission job in D1, starts a Cloudflare Workflow, and immediately returns a status URL.
The page polls that URL while the Workflow uses the repository-scoped dsh.pub GitHub App to create
or find the corresponding `submissions/*.json` branch and Pull Request. The user does not need to
fork the repository or click GitHub's **Propose changes** action.

The trusted GitHub Actions submission workflow reads the submitted file from the exact Pull Request
commit without checking out or executing untrusted plugin code. It resolves the plugin repository's
current public default-branch commit, validates its committed bundle contract, and runs the complete
dsh.pub quality gates. A passing Pull Request is merged with a merge commit, then a trusted `main`
workflow regenerates and commits the catalog. The existing Cloudflare Workers Git integration
deploys `main` automatically. Anyone may nominate a public repository; the submitter is not treated
as a verified publisher, and an existing repository/package-path coordinate cannot be overwritten
through this flow.

The web submission page also generates Markdown and HTML badge snippets. The live badge reports
`not listed` until the registry commit is deployed, then changes to `listed` (with a short cache).
The Pull Request and the checked-in submission file provide the public audit trail.

Repository automation uses the same GitHub App through two narrowly scoped tokens. Pull Request
base-drift recovery requests only `pull_requests: write`; trusted catalog integration requests only
`contents: write`, and only after lint, tests, E2E, and build have passed. Configure the repository
variable `GITHUB_APP_CLIENT_ID` and repository secret `GITHUB_APP_PRIVATE_KEY_PKCS8` for those
workflows. The App must be installed only on `dsh-pub/dsh-pub` with Contents and Pull requests read
and write access. Pull Request validation never receives the App secret or token.

Protect `main` with two active repository rulesets. `main-pr-gate` requires a Pull Request and lists
only the dsh.pub GitHub App Integration as an `always` bypass actor, allowing trusted catalog jobs
to make audited fast-forward commits. `main-ref-integrity` has no bypass actors and blocks deletion
and non-fast-forward updates. Keeping these controls separate prevents the App, repository
administrators, and GitHub Actions from bypassing deletion or force-push protection; do not add an
administrator role or the GitHub Actions Integration to either bypass list.

The `dsh-plugin` GitHub topic is synchronized every day at 01:00 Asia/Shanghai. The workflow takes a
cutoff snapshot, pins each public default-branch commit, validates root bundle contracts without
executing third-party code, updates the catalog and installable registry, and records accepted and
rejected results in `packages/catalog/src/topic-analysis.generated.json`. Repositories added or
updated after the cutoff are deferred to the next run. If the Topic connection still drifts after
three complete pagination attempts, the analysis records unresolved coverage and retains unseen
records from the prior snapshot instead of treating them as removed. Listing proves only that a
pinned public bundle contract and required committed files passed automated checks; it is not a
human review, security audit, runtime smoke test, quality score, publisher identity check, or
official endorsement. Older records labeled `community-reviewed` retain their historical
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
source and documentation stay in GitHub. D1 stores install event counters and submission job state;
it never stores the GitHub App private key, installation tokens, or Workflow step credentials.
Production Workers Builds watches every path on `dsh-pub/dsh-pub` `main`, runs `npm run build`, and
deploys the static assets, HTTP API, D1 binding, and `PluginSubmissionWorkflow` in one Worker.

Runtime bindings required by plugin submission are:

| Binding                        | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `TURNSTILE_SITE_KEY`           | Public site key returned to the submission page                 |
| `TURNSTILE_SECRET_KEY`         | Server-side Turnstile verification secret                       |
| `GITHUB_APP_CLIENT_ID`         | GitHub App client ID used to sign an App JWT                    |
| `GITHUB_APP_INSTALLATION_ID`   | Installation restricted to the dsh.pub repository               |
| `GITHUB_APP_PRIVATE_KEY_PKCS8` | PKCS#8 PEM private key used only inside the Worker              |
| `GITHUB_TARGET_REPOSITORY_ID`  | Numeric repository ID allowed when creating installation tokens |
| `PLUGIN_SUBMISSION_WORKFLOW`   | Wrangler Workflow binding; configured in `wrangler.jsonc`       |
| `DB`                           | Existing D1 binding; configured in `wrangler.jsonc`             |

Keep deployment values out of source control. Configure the six string bindings above through
Cloudflare secrets (the site key and numeric identifiers are not confidential, but treating the
complete runtime set uniformly avoids environment drift):

```bash
npm run build
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_INSTALLATION_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY_PKCS8
npx wrangler secret put GITHUB_TARGET_REPOSITORY_ID
npx wrangler deploy
```

This order is intentional: build first, migrate the production D1 database, configure runtime
secrets, then deploy the Worker version that depends on the new schema and bindings. For local
development, put non-production values in an ignored `.dev.vars` file. Never place a GitHub App
private key or installation token in D1, a Workflow event payload, or a persisted Workflow step
result.

See [product decisions](docs/product.md), [architecture](docs/architecture.md), and
[research evidence](docs/research.md).

## License

DSH Pub is available under the [MIT License](LICENSE). Generated catalog documentation derived from
DeepSeek Harness retains its upstream notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
