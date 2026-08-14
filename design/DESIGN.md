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

Browser inspection of DSH.Tools on 2026-08-14 establishes three structural anchors:

1. A two-column, search-first landing surface: task copy on the left, a catalog/trust snapshot on
   the right, followed by use-case and activity-led discovery sections.
2. A catalog with one bordered control deck, explicit scope tabs, quick use-case filters, sortable
   cards, and enough repository signals to decide what to inspect next.
3. A detail page with a calm package masthead, content cards in the main column, and stable health
   and provenance cards in the side rail.

DSH Pub adopts those task and information patterns, not DSH.Tools' green palette, Inter typography,
rounded consumer-market tone, or visual assets. The implementation keeps the navy/blue blueprint
identity, IBM Plex typography, precise source coordinates, and the DSH-specific capability bus. Its
signature difference is an evidence split: 504 public ecosystem candidates remain visibly separate
from 177 structured Registry records and never inherit installability or review claims.

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

- Landing: compact utility header, circuit/seam field, left-aligned registry thesis and search, plus
  a right-side trust snapshot; use cases, popular signals, recent activity, and reviewed records sit
  below it.
- Catalog: one control deck with Registry/Ecosystem/All scopes, use-case chips, type/source filters,
  sorting, and a responsive technical card grid.
- Detail: light package masthead, source action and capability bus, tab strip, card-based
  documentation column, and right metadata rail.
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

No gradients, decorative glass, or multiple competing accent colors. Cards use restrained borders
and one small lift interaction; the trust hierarchy must come from labels and evidence, not depth.

## Layout sketches

```text
LANDING
┌─────────────────────────────────────────────────────────────┐
│ dsh.pub         Plugins   Docs        中文 / theme / GitHub │
├──────────────── search / circuit field ─────────────────────┤
│ Registry thesis + search      │ Registry trust snapshot     │
│ Source-backed · bilingual     │ records / source / install  │
├─────────────────────────────────────────────────────────────┤
│ Browse by use case       eight public ecosystem categories  │
│ Popular / recently active     ecosystem discovery cards     │
│ Source reviewed          installable Registry cards         │
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

- Do not make Registry records and ecosystem candidates visually indistinguishable. Cards may share
  geometry, but their evidence label, action, and available facts must remain different.
- Do not use a giant slogan hero that pushes search below the fold. The two-column masthead must keep
  search and the trust snapshot visible together on a normal desktop viewport.
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
