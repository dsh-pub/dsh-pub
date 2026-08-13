# dsh-pub CLI artifact

`dsh-pub-0.1.1.tgz` is generated from `apps/cli` with:

```bash
cd apps/cli
npm run build
npm pack --pack-destination ../web/public/cli
```

SHA-256: `b61c142eb3e3cdfb9c0ff1266965546317b9984f6e4734a3b6d006307de2093d`

The website uses the versioned URL so an artifact update cannot silently change an existing install
command.

Version `0.1.0` was withdrawn before source publication because it passed a temporary filesystem
path to pnpm. Version `0.1.1` persists an exact Git commit spec instead.
