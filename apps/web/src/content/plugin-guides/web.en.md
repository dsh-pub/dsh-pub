---
title: 'dsh-web: Web Search and Fetch for DeepSeek Harness'
description: 'Understand dsh-web, the built-in web access service for DeepSeek Harness. Start the Web UI, configure search, and troubleshoot providers and URL fetching.'
overviewHeading: 'Web search and URL fetching for Harness'
summary: 'dsh-web gives DeepSeek Harness a shared service for searching the web and retrieving URLs. Search and fetch providers connect to this service; dsh-tool-web exposes them to the agent as web_search and web_fetch. It is included with Harness, so there is no separate dsh-web installation.'
---

## Who is dsh-web for?

Use this capability when your agent needs current information or source pages beyond its local workspace. For plugin developers, `ctx.web.search()` and `ctx.web.fetch()` provide a common interface across backends, so changing providers does not require changing the tool interface.

The pieces have different jobs:

- **dsh-web** owns the shared service and provider selection.
- **[Search providers](/en/plugins/web-search-deepseek/)** supply search results. The catalog also includes [Exa](/en/plugins/web-search-exa/) and [Perplexity](/en/plugins/web-search-perplexity/).
- **[dsh-web-fetch-http](/en/plugins/web-fetch-http/)** retrieves a URL's text or HTML when explicitly enabled.
- **[dsh-tool-web](/en/plugins/tool-web/)** makes the `web_search` and `web_fetch` tools available to the model.

Looking for the browser application? **`dsh web` starts the Web UI**; this `dsh-web` module handles the agent's web access. See the [Web UI profile](/en/plugins/web-app/) for the application layer.

## Start Harness and use web search

1. Install Node.js, then run the command documented in the [official Harness README][run] from the project directory you want to work with:

   ```sh
   npx @deepseek-ai/dsh web
   ```

2. Open the URL printed by the command. The documented default is `http://127.0.0.1:3080`.
3. In **Settings → Models**, save your DeepSeek API key. Use **Choose workspace** to add and select your project directory, then start a session. These steps follow the [official Web UI guide][ui-guide].
4. Ask the agent to search for a current topic and cite its sources. Check the session for a `web_search` call and returned source URLs; launching the UI alone does not verify that a provider request succeeded.

In the [catalog's source snapshot][defaults], the base configuration loads `dsh-web`, selects `deepseek-official`, and enables `web_search` through `dsh-tool-web`. This search provider uses the same `DEEPSEEK_API_KEY` credential managed by the Models page. **URL fetching is disabled by default**, and no fetch provider is mounted in that configuration.

You do not need a `dsh plugin add` command for this built-in module. The [included-module guide](/en/guide/#included) explains the distinction from installable community bundles.

## Common questions

### Why does search fail after the UI starts?

The UI and search provider have separate requirements. For the default DeepSeek provider, `WEB_PROVIDER_CREDENTIAL_MISSING` means the configured credential could not be found. Check the key in Settings → Models. Its [official provider documentation][deepseek] also distinguishes the search endpoint from the chat endpoint: `DEEPSEEK_SEARCH_BASE_URL` configures search, while `DEEPSEEK_BASE_URL` belongs to chat. A custom chat endpoint does not automatically configure search.

### How do I choose another search provider?

Load the provider you want to use and set `searchProvider` on the `dsh-web` entry to its registered provider ID. The shipped configuration explicitly selects `deepseek-official`, so loading another provider alone does not switch it. See the [service implementation][selection] and each provider's documentation for its ID and credential settings.

With no explicit selection, exactly one usable provider is selected automatically. `WEB_PROVIDER_AMBIGUOUS` means several are usable; select one explicitly. `WEB_PROVIDER_CONFIGURED_MISSING` means the selected ID is not registered, while `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` means it is registered but unavailable. `WEB_PROVIDER_UNAVAILABLE` means there is no usable provider and no explicit selection.

### Is web_fetch enabled, and can it read PDFs or private pages?

**The catalog snapshot and newer upstream code differ.** In the [catalog snapshot][defaults], `dsh-tool-web` has `fetch: false`. That snapshot's [HTTP provider][http] lacks private-network/SSRF protection and must not be enabled where it can reach sensitive internal services.

In newer upstream source [`5badb15009`][new-defaults], the shared base mounts the HTTP provider and enables fetching; the Web app composes the tools per agent preset. Its [HTTP implementation][new-http] checks for public destinations and pins connections to validated addresses. Check your installed release and active profile before changing settings: the older snapshot's fetch behavior is not a rule for every Harness version.

Both reviewed HTTP implementations retrieve anonymous HTTP(S) text and HTML, including supported JSON/XML content types. Neither provides an authenticated browser session or PDF decoding. Missing or unsupported content types produce `WEB_UNSUPPORTED_CONTENT_TYPE`. Custom compositions need both a fetch provider and the consumer's fetch tool enabled.

### Does dsh-web register tools by itself?

No. It registers `ctx.web`; the [tool consumer][tools] owns the model-facing names, schemas, and guidance. Developers using the service directly still need a registered provider for the requested operation. See the [full service API][service] for request/result types and error semantics.

## Sources and scope

The catalog metadata and the snapshot instructions above were checked against official Harness commit [`47f943859b`][snapshot]. The fetch FAQ also compares newer upstream commit [`5badb15009`][new-defaults], inspected on 4 October 2026. The linked source documents provide the full API, configuration, and limitations; match them to the release you run.

[run]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/README.md#run
[ui-guide]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/guide/index.md
[defaults]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/base/cordis.patch.yml#L396-L418
[deepseek]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/web-search-deepseek/README.md
[selection]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/web/src/index.ts
[http]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/web-fetch-http/README.md
[tools]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/tool-web/README.md
[service]: https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/web/README.md
[snapshot]: https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a
[new-defaults]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/bundle/base/cordis.patch.yml#L461-L490
[new-http]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/web/web-fetch-http/README.md
