const registrySkill = {
	name: "dsh-pub",
	source: "runtime",
	description: [
		"Discover, search and install DeepSeek Harness plugins and bundles from the",
		"bilingual dsh.pub registry using natural language. Use it when the user wants",
		"to find, search, compare, install, or remove a Harness plugin / bundle / module",
		"(插件、扩展、模块), or asks what plugins exist for a task."
	].join(" "),
	whenToUse: [
		"The user asks to find or install a DeepSeek Harness plugin, bundle, or module,",
		"asks whether a plugin exists for a capability, or wants to browse or compare",
		"the dsh.pub catalog. Also use it to explain the difference between built-in",
		"modules, built-in profile layers, and installable Git bundles."
	].join(" "),
	content: `# dsh.pub plugin registry

You help users discover and install DeepSeek Harness plugins through the dsh.pub
bilingual, source-backed registry. Only claims you can trace to a dsh.pub
response are trustworthy; never invent a plugin name or an install command.

## Data source

The registry publishes two machine-readable documents:

- \`https://dsh.pub/api/plugins\` — the **search endpoint**. Use this one.
- \`https://dsh.pub/plugins.json\` (schemaVersion 1) — the complete dump of every
  entry. It is several megabytes and will not fit in a single web fetch, so treat
  it as a last resort and never try to load it whole.

## Search

Query the search endpoint in natural language:

\`\`\`text
https://dsh.pub/api/plugins?q=<terms>&limit=20
\`\`\`

| Parameter     | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| \`q\`           | Free text in either language. Every whitespace-separated term must match.  |
| \`category\`    | Exact, case-insensitive category filter.                                  |
| \`type\`        | Exact, case-insensitive type filter (\`plugin\`, \`bundle\`, …).                |
| \`installable\` | \`true\` keeps only entries with a commit-pinned install command.             |
| \`builtIn\`     | \`true\` keeps only built-in modules.                                        |
| \`limit\`       | Page size, 1–50 (default 20).                                              |
| \`offset\`      | Skip that many ranked matches (default 0).                                 |

Matching is case-insensitive and covers the \`searchFields\` the registry
advertises: \`name\`, \`description\` (both languages), \`category\`, \`type\`,
\`tools\`, \`uiSlots\`, \`profiles\`, and \`source.repository\`. A term that
matches the name outranks one that matches only the description, and the
ordering is stable, so the same query always returns the same page. The response
reports \`total\`, \`returned\`, \`hasMore\`, and \`entries\`; page with \`offset\`
rather than raising \`limit\` above 50.

If your fetch tool cannot carry the response, query it from the shell instead of
downloading the dump:

\`\`\`bash
curl -s 'https://dsh.pub/api/plugins?q=web+search&limit=10'
\`\`\`

Each entry has \`slug\`, \`name\`, bilingual \`description\`, \`category\`,
\`type\`, \`provenance\`, \`builtIn\`, \`tools\`, \`uiSlots\`, \`profiles\`,
\`source\` (\`repository\`, \`directory\`, \`commit\`), \`install\`
(\`installable\` and a ready \`command\`), and \`urls.en\` / \`urls.zh\` detail
pages.

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
  through dsh.pub. Search results do not include them; point the user at the
  catalog pages (\`https://dsh.pub/en/plugins/\` or \`/zh/plugins/\`) and at the
  project's own source instead.

## Telemetry and the install count

\`dshpub\` reports a completed install to dsh.pub, best-effort, after a
successful native install. It honors \`DO_NOT_TRACK=1\` and
\`DISABLE_TELEMETRY=1\`; a telemetry failure never changes the install result.
The public count is **CLI-reported completed installs**, not unique users,
clones, downloads, or active installations. Say so when quoting it.

## Truthfulness checklist

- Only the \`install.command\` the response returned (or the documented native
  fallback) may be presented as an install route. Never invent commands.
- If a query returns nothing, broaden the terms or drop a filter and re-query;
  do not guess a plugin name.
- Never present a truncated page as the whole result set — read \`total\` and
  \`hasMore\`, and page with \`offset\`.
- "Listed / installable" means a pinned public bundle contract passed automated
  checks. It is not a security audit, runtime smoke test, or endorsement.
`
};
//#endregion
//#region src/index.ts
/**
* dsh.pub directory plugin, node half.
*
* The host half contributes one embedded skill to any profile that mounts the
* DSH skill registry, so agents can use natural language to search the dsh.pub
* registry and install genuinely installable Git bundles. The browser half
* (`client`) remains the read-only bilingual directory in Settings.
*/
/** Service names this host plugin requires at startup. The skill registry is optional. */
const inject = [];
/**
* Host plugin body. Register the dsh.pub registry skill the moment the `skills`
* service is available; when the profile has no skill registry, the plugin
* loads as a harmless read-only directory.
*/
function apply(ctx) {
	ctx.inject(["skills"], (skillCtx) => {
		skillCtx.effect(() => skillCtx.skills.register(registrySkill), "dsh-pub: register registry skill");
	});
}
//#endregion
export { apply, inject };
