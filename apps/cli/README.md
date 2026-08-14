# dshpub CLI

Install an independently distributed, manifest-declared DeepSeek Harness bundle from GitHub.

```bash
npx dshpub add owner/repository \
  --path packages/my-bundle \
  --profile web
```

`dshpub` is published on npm and runs as `npx dshpub`.

The CLI resolves the requested ref to an exact commit in a temporary checkout and verifies that the
selected package declares `dsh.bundle.patch`. It then removes the checkout and runs
`dsh plugin --profile … add …` with a commit-pinned pnpm Git spec, so the installed dependency does
not point at a deleted temporary directory. Completion is reported only after native DSH succeeds.
Set `DO_NOT_TRACK=1` or `DISABLE_TELEMETRY=1` to disable that event.

The three current bundles inside `deepseek-ai/deepseek-harness` depend on that repository's
`workspace:` graph and are already built into DSH profiles. They are catalog records, not valid
standalone targets for this CLI. The command is the distribution path for future external bundle
repositories that are independently installable.

The public total means **CLI-reported completed installs**. It is not a unique-user, download, or
active-usage count.
