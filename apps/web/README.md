# DSH Pub Web

Astro static site for the bilingual DSH plugin registry.

```bash
npm run dev --workspace @dsh-pub/web
npm run build --workspace @dsh-pub/web
```

Canonical pages live under `/en` and `/zh`. Catalog content is generated from a pinned
DeepSeek Harness source revision by `packages/catalog`.

The English `/en/plugins/web/` pilot has a hand-written guide and page metadata in
`src/content/plugin-guides/web.en.md`. The detail route selects it only for that locale and slug.
Edit this file rather than `packages/catalog/src/catalog.generated.json`, which is overwritten by
`scripts/sync-harness-catalog.mjs`. Keep the guide's source links pinned to the revision actually
reviewed, and recheck its instructions and defaults before updating that revision.
