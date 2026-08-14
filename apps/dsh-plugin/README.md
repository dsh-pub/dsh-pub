# dsh.pub Plugin Directory

`@dsh-pub/plugin-directory` adds the bilingual dsh.pub Registry to DeepSeek Harness Settings. It
ships a compact, source-pinned snapshot of every public plugin and bundle shown on dsh.pub, then
provides local search, capability topics, source/runtime/distribution filters, deterministic sorts,
and links back to the full source-backed detail pages.

The page is a read-only catalog surface. Opening it does not fetch, install, import, or execute code
from any catalog entry.

## Install from this repository

```bash
npx dshpub add dsh-pub/dsh-pub \
  --path apps/dsh-plugin \
  --profile web
```

Restart the DSH Web profile, open **Settings**, then choose **dsh.pub Registry**.

## Update and verify

```bash
npm run catalog:generate --workspace @dsh-pub/plugin-directory
npm run test --workspace @dsh-pub/plugin-directory
npm run build --workspace @dsh-pub/plugin-directory
```

The generated client bundle is checked in so a Git install does not need to compile the plugin on
the user's machine.
