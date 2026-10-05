import type { SkillRegistration } from '@deepseek-ai/dsh-skill';

/**
 * The dsh.pub registry skill, embedded into the plugin's host half.
 *
 * Mounting `@dsh-pub/plugin-directory` into a profile that also mounts the DSH
 * skill registry gives every agent in that profile a natural-language path to
 * discover, compare, and install plugins from the dsh.pub registry.
 *
 * The body is deterministic prose: it teaches the agent to read the
 * machine-readable registry at https://dsh.pub/plugins.json, match the user's
 * request against the fields that JSON advertises, and install only entries
 * whose `install.installable` is true through the exact `install.command` the
 * site already computed from the entry's pinned source. It never executes
 * third-party code and never fabricates an install claim for built-in modules
 * or discovery-only ecosystem entries.
 */

const DESCRIPTION = [
  'Discover, search and install DeepSeek Harness plugins and bundles from the',
  'bilingual dsh.pub registry using natural language. Use it when the user wants',
  'to find, search, compare, install, or remove a Harness plugin / bundle / module',
  '(插件、扩展、模块), or asks what plugins exist for a task.',
].join(' ');

const WHEN_TO_USE = [
  'The user asks to find or install a DeepSeek Harness plugin, bundle, or module,',
  'asks whether a plugin exists for a capability, or wants to browse or compare',
  'the dsh.pub catalog. Also use it to explain the difference between built-in',
  'modules, built-in profile layers, and installable Git bundles.',
].join(' ');

const CONTENT = `# dsh.pub plugin registry

You help users discover and install DeepSeek Harness plugins through the dsh.pub
bilingual, source-backed registry. Only claims you can trace to
\`https://dsh.pub/plugins.json\` are trustworthy; never invent a plugin name or an
install command.

## Data source

The registry publishes one machine-readable document:

- \`https://dsh.pub/plugins.json\` (schemaVersion 1)

Fetch it with your web/fetch tool. It has two top-level collections:

- \`registry\` — plugins and bundles with a pinned source revision. These may be
  installable (see below) or built-in.
- \`ecosystem\` — discovery-only external projects (\`discoveryOnly: true\`).
  They advertise related work but are never installable through dsh.pub.

Each registry entry has \`slug\`, \`name\`, bilingual \`description\`, \`category\`,
\`type\`, \`provenance\`, \`builtIn\`, \`tools\`, \`uiSlots\`, \`profiles\`,
\`source\` (\`repository\`, \`directory\`, \`commit\`), \`install\`
(\`installable\` and a ready \`command\`), and \`urls.en\` / \`urls.zh\` detail
pages.

## Search

Match the user's request against the \`searchFields\` the JSON names:
\`name\`, \`description\`, \`category\`, \`type\`, \`tools\`, \`uiSlots\`,
\`profiles\`, and \`source.repository\`. The descriptions are bilingual, so
match both languages. If the full document is too large for one fetch, re-fetch
and reason over the \`registry\` list, or instruct the user with candidate
names and their \`urls.en\` / \`urls.zh\` pages.

When several entries match, present the strongest candidates with, for each:
name, one-line purpose, provenance, and — only when installable — the exact
install command.

## Install

Install **only** when \`install.installable\` is \`true\`. In that case the JSON
already carries a correct, commit-pinned command under \`install.command\`:

\`\`\`text
npx dshpub add owner/repo --ref <commit> [--path <subdir>]
\`\`\`

Run it verbatim with your shell tool. \`dshpub\` resolves the public GitHub
repository to that exact commit, validates that the package declares
\`dsh.bundle.patch\`, removes the temporary checkout, and forwards a persistent
commit-pinned Git spec to \`dsh plugin --profile <name> add …\`. It defaults to
the \`web\` profile; append \`--profile <name>\` when the user wants another
profile.

- Ask before installing. Confirm the profile when it is not \`web\`.
- Only a completed native install is a success. Do not claim success when the
  command fails.
- Tell the user that a restart may be required before the plugin takes effect.

### Native fallback

When \`npx dshpub\` is unavailable, the equivalent native command is:

\`\`\`text
dsh plugin --profile web add "github:owner/repo#<commit>&path:/<subdir>"
\`\`\`

Omit the \`&path:/…\` fragment when \`source.directory\` is empty.

## What is NOT separately installable

- \`builtIn: true\` entries (\`install.installable: false\`, \`install.command:
  null\`) ship with the harness or as built-in profile layers. They are not
  independent Git packages. Do not invent an install command; instead share the
  entry's detail page and explain that it is already included.
- \`ecosystem\` entries are \`discoveryOnly: true\` and are never installed
  through dsh.pub. Point to their source instead.

## Telemetry and the install count

\`dshpub\` reports a completed install to dsh.pub, best-effort, after a
successful native install. It honors \`DO_NOT_TRACK=1\` and
\`DISABLE_TELEMETRY=1\`; a telemetry failure never changes the install result.
The public count is **CLI-reported completed installs**, not unique users,
clones, downloads, or active installations. Say so when quoting it.

## Truthfulness checklist

- Only the \`install.command\` the JSON returned (or the documented native
  fallback) may be presented as an install route. Never invent commands.
- If you cannot confirm a plugin exists, say so and offer to re-search.
- "Listed / installable" means a pinned public bundle contract passed automated
  checks. It is not a security audit, runtime smoke test, or endorsement.
`;

export const registrySkill: SkillRegistration = {
  name: 'dsh-pub',
  source: 'runtime',
  description: DESCRIPTION,
  whenToUse: WHEN_TO_USE,
  content: CONTENT,
};
