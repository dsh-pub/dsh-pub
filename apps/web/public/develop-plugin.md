# Develop a DeepSeek Harness plugin

> Agent-facing contract, version 1. Source-checked against DeepSeek Harness
> `0.1.0-rc.5` at commit
> [`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a).
> Updated 2026-08-14. This is a dsh.pub development and catalog-admission guide, not an official
> DeepSeek Harness specification.

Use this document when an Agent is asked to create a DeepSeek Harness plugin in an independent Git
repository.

## Instructions for the Agent

1. Read this document completely before changing files.
2. Read the target repository's `AGENTS.md`, `CLAUDE.md`, contribution guide, package manager, and
   quality commands. Repository-local instructions take precedence over this general guide.
3. Inspect the installed or target Harness version. Do not assume that a service, tool, UI slot, or
   package from the pinned snapshot exists in another version.
4. State which delivery track you are building: Host, Web UI, or Host + Web UI. In every case, an
   independently installable Git repository also needs the Bundle layer described below.
5. Keep implementation, installation, activation, runtime verification, and dsh.pub catalog
   admission as separate completion states.

Stop and ask the user when the intended Harness version, extension point, data owner, or required
authority would materially change the design and cannot be learned from the repository.

To make this contract explicit in a plugin repository, add this small bootstrap to its own
`AGENTS.md` (without replacing any existing local rules):

```markdown
## DeepSeek Harness plugin development

Before changing plugin code, read https://dsh.pub/develop-plugin.md completely. Follow the pinned
runtime contract and verification boundaries there; this repository's own security, testing, and
release rules remain authoritative.
```

## The model: module, bundle, profile

```text
Git repository package
  ├─ Host module                 exports apply(ctx, config?)
  ├─ optional Web client        exports ./client and declares dsh.client
  └─ bundle activation layer    declares dsh.bundle.patch
          ↓
     dsh plugin add
          ↓
     profile dependency + dsh.profile.bundles
          ↓
     composed Cordis rows
          ↓
     running Host + optional loaded Web client
```

These are different objects:

| Object             | What it does                                                          | Is it independently activated by `dsh plugin add`? |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| Host plugin module | Runs inside the Harness Host and registers capabilities through `ctx` | No                                                 |
| Web client module  | Contributes browser behavior or UI through the client runtime         | No                                                 |
| Bundle             | Ships `cordis.patch.yml`, which inserts or overrides plugin rows      | Yes                                                |
| Profile            | User-owned ordered composition under `$DSH_HOME/profiles/<name>`      | Not distributed by the plugin author               |

A package without `dsh.bundle.patch` can be installed, but DSH treats it as a plain dependency and
does not add it to the profile layer stack. Therefore an independent Git repository intended for
one-command installation must deliver a bundle, even when it contains only one Host module.

Do not copy a built-in `packages/*` directory from the Harness monorepo and call it an installable
plugin. Built-in atomic packages and the three built-in bundle packages rely on the monorepo's
`workspace:` graph. They are catalog records, not standalone Git distributions.

## Choose a delivery track

| Requirement                                                                          | Track         | Required runtime files           |
| ------------------------------------------------------------------------------------ | ------------- | -------------------------------- |
| Tool, service, event handler, storage adapter, policy, or other server-side behavior | Host          | `lib/index.js`                   |
| Browser-only surface using existing Host data and client services                    | Web UI        | `lib/index.js` + `lib/client.js` |
| UI that reads or mutates durable/domain data                                         | Host + Web UI | Host owner/bridge + client view  |

For UI work, determine the exact extension point from the target source before implementation. A
slot is a typed runtime contract, not a DOM selector. Confirm its name, props, cardinality, scope,
existing occupants, and required services. If no suitable slot exists, do not silently replace a
page or patch private DOM; propose an upstream slot or a clearly isolated new surface.

## Minimal independent Host bundle

Prefer committed JavaScript runtime artifacts for a Git-distributed plugin. This avoids asking the
installer to execute a `prepare` build script.

```text
dsh-hello/
├── package.json
├── cordis.patch.yml
├── src/
│   └── index.js
├── lib/
│   └── index.js
├── README.md
└── LICENSE
```

### `package.json`

Replace the example scope with one owned by the publisher. Do not publish community code under the
reserved `@deepseek-ai` scope.

```json
{
  "name": "@example/dsh-hello",
  "version": "0.1.0",
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "cordis.patch.yml", "README.md", "LICENSE"],
  "license": "MIT",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The package name is runtime identity. The row in `cordis.patch.yml` must use the same installed
package name.

### `cordis.patch.yml`

```yaml
- insert:
    - id: example-hello
      name: '@example/dsh-hello'
```

The file is a top-level YAML array of patch objects. Keep the path relative to the package root and
inside the package. Use stable, collision-resistant row IDs. When overriding an existing row, first
inspect the target composition: a later patch replaces that row's whole `config` value rather than
deep-merging individual keys.

### `src/index.js`

```js
export const name = 'example-hello';

export function apply(ctx) {
  ctx.effect(() => {
    console.log('[example-hello] mounted');
    return () => console.log('[example-hello] unmounted');
  });
}
```

Build or copy this source to the declared `lib/index.js` runtime entry. The committed `lib/`
artifact, not the example source path, is what an exact Git install loads.

Declare hard runtime services with the module's exported `inject` list:

```js
export const inject = ['tools'];

export function apply(ctx) {
  // Register through ctx only after declared services are available.
}
```

Registrations made through `ctx` participate in the plugin lifecycle. For resources created outside
those registrations—connections, file watchers, native handles, or long-lived timers—return a
disposer from `ctx.effect()`. Do not create process-wide side effects at module import time.

## Add a Web UI client

A UI plugin is a dual-face package. Its Host face remains a Cordis Loader row; its browser face is
served from `exports["./client"]` after the Host discovers the package's `dsh.client` declaration.

Add the client export and runtime artifact:

```json
{
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "lib/client.js", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime"]
    }
  }
}
```

`dsh.client` accepts `platform`, optional package-name array `inject`, and optional boolean
`immediately`. The manifest-level `inject` list describes informational client-package graph edges;
it does not provide `ctx.slots`, order activation, or replace the client module's exported
service-name `inject` list. The target Web composition must already mount client runtime and every
service the browser module injects.

The minimal Host face of a UI-only plugin can be empty:

```js
export function apply() {}
```

Write the browser face as source, for example `src/client/index.js`. After the Agent has verified a
real slot in the target Harness version, the registration shape is:

```js
// Pattern only: replace the slot metadata and define/import ExampleWidget from the inspected API.
export const inject = ['slots'];

export function apply(ctx) {
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'example-widget',
      },
      ExampleWidget,
    ),
  );
}
```

`ExampleWidget` is intentionally not defined here: its props and implementation must match the
inspected slot contract. Do not copy this example merely because the current pinned snapshot has a
slot named `conversation.input.dock`.

Do **not** copy this ESM source directly to `lib/client.js`. In the pinned Harness release, the Web
loader fetches `lib/client.js` as a classic script and requires it to register a lazy CommonJS
factory with `window.__ModuleLoader__.load({ id, factory })`. Use a Harness-compatible client bundle
configuration—built-in packages use the source snapshot's `clientBundle()` tsdown preset—or an
equivalent builder that emits that factory form. Treat this helper as versioned source tooling: if
it is not published for external use in the target release, vendor an audited equivalent or stop and
confirm the supported external build path. Verify the emitted artifact contains the exact package
name as its factory ID and calls `window.__ModuleLoader__.load`.

The Web client is meaningful only in a Web-capable profile containing the client module system. A
successful install into a headless profile does not prove any UI was loaded.

### UI data ownership

Use the narrowest existing data path:

1. If the slot already provides the required data and actions, consume those props.
2. If an existing client service owns the data, declare and use that service.
3. For durable or privileged state, keep the source of truth in a Host plugin and expose a typed
   Host-to-client bridge using the target Harness version's existing Remote pattern.
4. Keep only ephemeral presentation state in the browser component.

The UI must show pending, rejected, disconnected, and failed mutations explicitly. Never report a
local optimistic update as durable success before the Host confirms it. Test reconnect and teardown
so stale state, listeners, and slot entries do not survive plugin disposal.

## Dependencies and build output

- Use the target repository's package manager and build system.
- External packages must use published dependency versions. Never ship `workspace:` ranges from a
  standalone repository.
- Declare runtime packages as dependencies or peer dependencies according to how the target DSH
  resolves them. Verify the exact versions against the intended Harness installation; do not infer
  compatibility from this document's pinned snapshot.
- Ensure every path in `main`, `exports`, `files`, and `dsh.bundle.patch` exists after a clean build.
- Commit `lib/index.js` and, for UI plugins, `lib/client.js` for dsh.pub's first-version Git
  distribution path.
- For UI plugins, verify `lib/client.js` is a Harness-compatible factory bundle, not a plain ESM
  module.
- Keep source, source maps, and declarations according to the repository policy, but do not make
  runtime loading depend on a sibling monorepo checkout.

A Git dependency with a `prepare` script executes publisher code on the user's machine at install
time. pnpm 10 and later require the user to allow that build explicitly. Prefer prebuilt committed
artifacts; if an install-time build is unavoidable, document the exact command and permission, pin
the Git commit, and never pretend the build runs inside an Agent tool sandbox.

## Verify locally

Use a disposable or explicitly chosen development profile. From the plugin repository root:

```sh
dsh plugin --profile web add ./
dsh --profile web --dump-config
dsh --profile web
```

The local `add ./` is a development link. Keep the repository directory in place while the profile
uses it. For release verification, test the exact public commit instead:

```sh
dsh plugin --profile web add github:example/dsh-hello#<40-character-commit>
dsh --profile web --dump-config
dsh --profile web
```

Or exercise dsh.pub's validator and installer:

```sh
npx dshpub add example/dsh-hello \
  --ref <40-character-commit> \
  --profile web
```

The dsh.pub CLI resolves an exact Git commit, checks that the bundle manifest points to an in-package
regular patch file, and checks the patch's YAML/array shape before delegating installation to native
DSH. It does not prove row resolution, build output, runtime compatibility, license quality, or
security. Its telemetry is best-effort and can be disabled with `DO_NOT_TRACK=1` or
`DISABLE_TELEMETRY=1`.

For each changed surface, verify:

- package build and repository lint/type/unit commands;
- `package.json` entry paths and committed runtime artifacts;
- the bundle appears as a named layer in `--dump-config`;
- the inserted row resolves and the Host module mounts;
- UI contributions render in the intended Web page and actually handle their interaction path;
- mutations round-trip through the real owner and surface rejection/failure;
- unload/reload removes registrations and releases resources;
- reinstalling from the public commit works without the local checkout.

Do not claim runtime, UI, install, or compatibility checks that were not executed.

## Security and repository hygiene

- Pin third-party code and release tests to a full commit SHA.
- Treat every Host plugin as code running with the DSH process's authority. Do not assume the Agent's
  tool sandbox limits plugin code, network access, environment variables, or installation scripts.
- Never commit credentials, tokens, personal data, private endpoints, or machine-specific absolute
  paths.
- Use least authority for files, network, subprocesses, tools, and persistence. Fail closed when a
  required approval or capability is unavailable.
- Validate all data crossing Host/client, network, file, or model boundaries.
- Document the data owner, storage location, mutation protocol, permission boundary, and cleanup
  behavior.
- Include a README with capability, compatibility, install, activate, configure, verify, disable,
  and uninstall instructions.
- Include an explicit open-source license. A package manifest's `license` field does not replace the
  repository license file for dsh.pub admission.

## Make the repository discoverable

For dsh.pub's first-version community catalog:

1. Make the repository public.
2. Add the GitHub topic
   [`dsh-plugin`](https://github.com/topics/dsh-plugin).
3. Keep the independently installable package at the repository root, or document an exact package
   subdirectory.
4. Publish a commit containing `package.json`, the declared patch, all referenced runtime artifacts,
   README, and license.
5. Use repository and package names you control; do not imply official DeepSeek ownership.

The GitHub topic is discovery only. dsh.pub manually checks a pinned public commit, bundle manifest,
safe patch path, committed runtime output, source documentation, and license before marking an entry
`community-reviewed`. That label is not a security audit, compatibility certification, or official
DeepSeek endorsement.

## Definition of done

- [ ] Target repository instructions and target DSH version are recorded.
- [ ] Host, Web UI, or Host + Web UI ownership is explicit.
- [ ] The extension point was inspected in the target version; no service or slot name was guessed.
- [ ] The Git root package declares a safe, existing `dsh.bundle.patch` file.
- [ ] Patch rows resolve installed package names and use stable IDs.
- [ ] Host and optional client exports point to committed build artifacts.
- [ ] External dependencies contain no `workspace:` ranges.
- [ ] Durable data has a named Host owner and confirmed mutation path.
- [ ] Every registration, subscription, timer, connection, and slot contribution unloads cleanly.
- [ ] Build, lint, types, unit tests, and relevant interaction tests passed, or omissions are stated.
- [ ] `dsh --profile <name> --dump-config` shows the bundle and intended rows.
- [ ] The exact public commit installs and boots in the intended profile.
- [ ] README, license, compatibility, configuration, disable, and uninstall instructions exist.
- [ ] GitHub topic and dsh.pub review state are described truthfully.

## Source anchors

- [Official first-plugin tutorial at the pinned source](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/index.md)
- [Official package-and-install tutorial at the pinned source](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.md)
- [Native `dsh plugin` reconciliation](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/src/plugin.ts)
- [Profile and bundle composition](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/profile.ts)
- [Web client manifest and bundle loading](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/modules/src/index.ts)
- [Web client factory-bundle contract](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/modules/README.md)
- [Source-backed plugin catalog](https://dsh.pub/en/plugins/)
