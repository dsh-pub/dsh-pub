# dsh.pub Plugin Directory

`@dsh-pub/plugin-directory` makes the dsh.pub Registry usable from inside DeepSeek Harness in two
complementary ways:

- **A read-only Settings directory.** It ships a compact, source-pinned snapshot of every public
  plugin and bundle shown on dsh.pub, then provides local search, capability topics,
  source/runtime/distribution filters, deterministic sorts, and links back to the full source-backed
  detail pages. Opening it does not fetch, install, import, or execute code from any catalog entry.
- **A natural-language search + install skill.** The host half registers an embedded skill named
  `dsh-pub`. When the profile also mounts the DSH skill registry and the `skill` tool, agents learn
  to read the machine-readable registry at `https://dsh.pub/plugins.json`, match a user's request
  against its documented search fields, and install only entries whose `install.installable` is true
  through the exact commit-pinned `install.command` the site computed. Built-in modules, built-in
  profile layers, and discovery-only ecosystem entries are never presented as installable, and
  install counts stay labeled as CLI-reported completions.

To enable natural-language search + install, mount this plugin in a profile that also mounts
`@deepseek-ai/dsh-skill` and `@deepseek-ai/dsh-tool-skill` (the shipped Web and headless profiles do).
If the skill registry is absent, the plugin silently degrades to the read-only Settings directory.

## Install from this repository

```bash
npx dshpub add dsh-pub/dsh-pub \
  --path apps/dsh-plugin \
  --profile web
```

Restart the DSH Web profile, open **Settings**, then choose **dsh.pub Registry**. To search and
install plugins with natural language, ask the agent — for example _"find me a plugin that …"_ or
_"install a plugin for …"_ — and confirm any install command it proposes.

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
