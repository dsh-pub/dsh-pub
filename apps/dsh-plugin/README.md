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

## Official desktop app

The official DeepSeek Harness desktop app for macOS and Windows installs plugins into its `desktop`
profile. Download it from <https://www.deepseek.com/harness/>. In **添加插件**, paste this GitHub
address:

```text
github:dsh-pub/dsh-pub#main&path:/apps/dsh-plugin
```

The same address works from a terminal:

```bash
dsh plugin --profile desktop add "github:dsh-pub/dsh-pub#main&path:/apps/dsh-plugin"
```

Restart the desktop app and open **Settings → dsh.pub Registry**. The package is distributed from
this Git repository. The add-plugin field resolves npm package names against the selected registry
mirror; this directory is installed from the GitHub address above. Its DSH client peer ranges accept
the desktop runtime `0.2.0-rc.2`.

## Update and verify

```bash
npm run catalog:generate --workspace @dsh-pub/plugin-directory
npm run test --workspace @dsh-pub/plugin-directory
npm run build --workspace @dsh-pub/plugin-directory
```

The generated client bundle is checked in so a Git install does not need to compile the plugin on
the user's machine.
