# DSH Pub Design Contract

> Status: MVP direction, 2026-08-13. Production Web is the current scope.

## Product, audience, and task

- **Subject:** A trusted technical registry for the DeepSeek Harness plugin system.
- **First audience:** Developers choosing, inspecting, and installing Harness capabilities.
- **Primary job:** Search by capability, compare runtime and distribution facts, then copy the
  correct source or install action.
- **Desired feeling:** Dense, precise, inspectable, and fast. Discovery should feel inviting without
  making the registry look like a consumer app store.

## Reference translation

Browser inspection of pub.dev establishes three structural anchors:

1. A branded, search-first landing surface followed by curated discovery sections.
2. A catalog with a persistent filter rail, dense result rows, visible facts, and ranking controls.
3. A detail page with package identity and tabs above a README column, plus a stable metrics and
   metadata rail.

DSH Pub reuses those information patterns, not pub.dev's Dart identity or exact artwork. From an AI
plugin-market pattern it adds capability categories, visible “what this contributes” tags, and an
install action close to each independently installable result. SkillsMP contributed its breadcrumb,
metric-band, curated-list, and repository-source cues; the resulting page keeps DSH-specific
capability anatomy and does not reproduce SkillsMP branding.

## Two-pass plan

### Pass 1 — content, tokens, and hierarchy

- Establish one catalog model and one localized string table before page styling.
- Use one 4 px spacing scale and a desktop content width around 1180 px.
- Use DeepSeek blue for links, selection, focus, and the single strongest action; use navy/graphite
  surfaces and cool neutral rules for hierarchy.
- Use IBM Plex Sans for Latin UI, PingFang/Noto Sans SC fallbacks for Chinese, and IBM Plex Mono for
  commands, versions, counts, and capability coordinates.
- Treat source revision, runtime type, distribution mode, and install-count semantics as primary
  content, never footer caveats.

### Pass 2 — composition and signature

- Landing: compact utility header, circuit/seam field, centered registry mark, large search input,
  and curated rows below it.
- Catalog: filter rail on desktop, collapsible filters on mobile, and border-separated rows rather
  than a generic card grid.
- Detail: package masthead, tab strip, main documentation column, and right metadata rail.
- Signature element: a **capability bus** that renders Host, Client/UI, Tool, Storage, and Workflow as
  addressable cells connected by a thin rule. It expresses the Harness “everything is a plugin”
  model and is reused in rows and detail pages.
- Motion is limited to search/filter feedback, copy confirmation, and subtle bus-cell activation;
  it is removed under `prefers-reduced-motion`.

## Palette and roles

Exact production values live in the Web stylesheet.

- **Registry navy:** header, search field framing, dark mode canvas.
- **DeepSeek blue:** links, selected tabs, focus rings, and install action.
- **Ice blue:** low-emphasis capability and verified/included states.
- **Graphite:** page surfaces, code blocks, and dividers.
- **Signal amber:** limitations and conditional availability only.

No gradients, decorative glass, soft floating cards, or multiple competing accent colors.

## Layout sketches

```text
LANDING
┌─────────────────────────────────────────────────────────────┐
│ dsh.pub         Plugins   Docs        中文 / theme / GitHub │
├──────────────── search / circuit field ─────────────────────┤
│                 [ Search 170 plugins... ]                   │
│              Source-backed · bilingual · inspectable        │
├─────────────────────────────────────────────────────────────┤
│ Official bundles         three built-in profile-layer rows  │
│ Explore capabilities     UI / Tools / Models / Storage ...  │
│ Built into DSH           dense plugin rows                  │
└─────────────────────────────────────────────────────────────┘

DETAIL
┌─────────────────────────────────────────────────────────────┐
│ package / version / status      capability bus              │
│ Overview  Capabilities  Installing  Source                  │
├──────────────────────────────────────┬──────────────────────┤
│ localized docs / capability tables  │ CLI installs         │
│ model experience / limitations      │ profiles / source    │
│                                      │ license / version     │
└──────────────────────────────────────┴──────────────────────┘
```

## Generic-pattern critique

- Do not turn 170 modules into a wall of rounded cards. Registry comparison requires aligned rows
  and stable metadata positions.
- Do not use a giant slogan hero that pushes search below the fold. Search is the landing task.
- Do not show invented ratings, likes, quality scores, publisher verification, or download history.
- Do not put an install button on built-in atomic modules. Use “Included in DSH” and source/profile
  actions instead.
- Do not hide the distinction between host plugin, client UI, model tool, seam, library, and bundle
  behind one generic “plugin” badge.

## Localization and accessibility

- Canonical locale routes are `/en/...` and `/zh/...`; root redirects by `Accept-Language` with an
  English fallback.
- Language switching preserves the current catalog entry where possible.
- Search result count uses a live region; filters are real form controls; copy buttons announce
  success; all interactive states have `:focus-visible` styling.
- At desktop, filter and metadata rails are complementary landmarks. At narrow widths they move
  before/after the main content in reading order without horizontal scrolling.
- Empty results explain which filters are active and provide a reset action.
