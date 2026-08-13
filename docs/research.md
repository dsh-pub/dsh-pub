# Research Notes

> Evidence observed on 2026-08-13. Facts here inform but do not override product decisions.

## Interface references

### pub.dev

Browser inspection covered the landing page, a populated search result, and the
`connectivity_plus` detail page.

- Landing is dominated by one large package search field and then curated sections such as
  favorites, trending, and top package groups.
- Search results use a left filter rail, dense border-separated result rows, visible version and
  publisher metadata, compact tags, and comparable likes/points/download columns.
- Detail pages place package/version/publisher/platform facts in a masthead, provide Readme,
  Changelog, Example, Installing, Versions, and Scores tabs, and keep downloads and metadata in a
  right rail.
- DSH Pub can reuse that task hierarchy while substituting truthful DSH-specific facts: runtime
  face, UI slot, model tool, profile membership, source revision, bundle status, and CLI installs.

Source: <https://pub.dev/>, <https://pub.dev/packages>, and
<https://pub.dev/packages/connectivity_plus>.

### skillsmp

The requested URL <https://skillsmp.com/zh/skills> returned a Cloudflare security-verification
interstitial in the in-app browser. Exact visual details are therefore not recorded as evidence.
The MVP may still use common marketplace discovery primitives requested by the product owner—clear
categories, capability chips, and direct install actions—but should revisit this reference after a
successful human verification pass.

## Harness source audit

Source snapshot: `deepseek-ai/deepseek-harness` at commit `47f943859bef`.

| Source population               | Count | Product interpretation              |
| ------------------------------- | ----: | ----------------------------------- |
| `@deepseek-ai/dsh-*` packages   |   219 | Complete source package index       |
| Cordis-loadable plugins         |   170 | Primary built-in catalog            |
| Loadable with config            |   105 | `Configurable` badge                |
| Loadable without config         |    65 | Built-in plugin                     |
| Seams                           |    15 | SDK/architecture, hidden by default |
| Libraries                       |    34 | SDK/internal, not a plugin claim    |
| Packages declaring `dsh.client` |    39 | Client/Web UI capability            |
| Packages declaring `dsh.bundle` |     3 | Built-in profile activation layer   |

Harness already owns the classification logic in `scripts/gen-config-catalog.ts`; catalog sync must
follow the Loader model rather than infer type from a package name. Every current package has a
version, license, repository directory, English README, Chinese README, and i18n metadata.

The native command `dsh plugin --profile <name> add <package-or-git-spec>` delegates installation to
the package manager. Only a package manifest with `dsh.bundle.patch` becomes a profile layer;
installing an atomic package alone does not activate it. Crucially, `dsh.bundle.patch` proves an
activation role, not independent distribution. All three current bundle packages contain
`workspace:` dependencies and require the Harness monorepo, so the MVP labels them as built-in
profile layers and reserves install commands/statistics for future standalone Git bundles.

## skills.sh CLI pattern

The open-source `skills` CLI accepts GitHub shorthand, shallow-clones public repositories, discovers
valid skill manifests, and sends best-effort install telemetry. Its public backend defines install
counts as deduplicated totals, but its server-side deduplication key and storage implementation are
not published.

Reusable lessons for DSH Pub:

- Count only a successfully installed logical plugin once per command, not once per target agent.
- Do not report local/private sources or collect a user/device identifier.
- Honor `DO_NOT_TRACK` and `DISABLE_TELEMETRY`.
- Telemetry failure must never reverse a successful local install.
- DSH Pub should improve on the observed client by sending completion only for a successful native
  install, not merely a selected target.

Sources: <https://www.skills.sh/docs/cli>, <https://www.skills.sh/docs/api>, and
<https://github.com/vercel-labs/skills>.

## Cloudflare deployment decision

Cloudflare recommends Workers Static Assets for new full-stack projects. Static asset requests can
bypass the Worker while `/api/*` routes run first. D1 is the smallest reliable store for persistent,
transactional aggregate counts; KV's eventual consistency makes it a poor shared counter, and
Analytics Engine is better suited to sampled event analysis than a permanent public total.

Sources: <https://developers.cloudflare.com/workers/static-assets/> and
<https://developers.cloudflare.com/d1/worker-api/>.
