# Manual QA checklist — Vault Keeper on live DIM

Use this after `npm run build` and loading the temporary extension in Firefox **or** Chromium (Chrome / Edge).

Composer-first Workbench shell (spec [#33](https://github.com/naifen/d2vault-keeper/issues/33), ADR [`docs/adr/0001-workbench-shell-ia.md`](./adr/0001-workbench-shell-ia.md)): Intention + **Suggest** → DIM filter (**Copy** / **Apply**) → **Results** (Matches | Recs, **Stage selected**) → **Trash** peek → **Settings** for API key (not Connection-first).

## Setup

### Firefox

1. Firefox 121+ → `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → select `dist/firefox/manifest.json`.

### Chrome / Edge

1. Chromium 116+ → `chrome://extensions` or `edge://extensions` → **Developer mode** → **Load unpacked** → select `dist/chromium/`.

### Common

2. Open [DIM](https://app.destinyitemmanager.com/) and log in until inventory is warm.
3. Confirm **VK** Light chip bottom-right on the page (status only — does **not** open Workbench).
4. Open **Workbench** via toolbar action (Firefox: sidebar / `_execute_sidebar_action`; Chromium: side panel via action click). **Not** via the Light chip.

## Happy path

| # | Step | Expected |
|---|------|----------|
| 1 | Workbench layout | Top→bottom: **Intention** + **Suggest**, **DIM filter** (Copy/Apply), **Results** (Matches \| Recs, Stage selected), **Trash** peek bar. Gear opens **Settings**. No main-column **Connection** form; round-trip only under Settings → Advanced. Dark navy/charcoal + brass chrome (not blue/pink wireframe). |
| 2 | Settings / key | Open Settings → save OpenRouter-compatible API key → Suggest enables. Without key, Suggest disabled with path to Settings. |
| 3 | Refresh vault | Gear-adjacent or filter-card **Refresh vault**. With warm DIM cache: vault count + Matches list. Missing cache: “Open DIM logged in…”. |
| 4 | Large vault | 1000+ rows: scroll stays interactive (virtualized window). |
| 5 | Intention → Suggest | Type Intention → **Suggest** (or Enter; Shift+Enter newline). Fills DIM filter card + explanation; opens Results on **Recs** if any else **Matches**. Does **not** auto-Apply to DIM; does **not** auto-Stage. |
| 6 | Filter Apply | Edit mono filter → **Apply** → DIM search box updates; non-matches dim. |
| 7 | Filter Copy / Clear | **Copy** puts filter on clipboard; **Clear** clears DIM search (and local card when Clear succeeds). |
| 8 | Stage selected | Multi-select Matches or Recs → **Stage selected** (no confirm). Items appear in Trash. Safe copy: **not deleted from Destiny**. |
| 9 | Selection filter | After Stage with a non-empty selection, filter card rewrites to **Selection filter** (`id:… or id:…` for instance ids). Does **not** auto-Apply — click Apply to push to DIM. Synthetic/stack rows do not invent broken `id:` terms. |
| 10 | Exclusions | Exotic / favorite cannot Stage by default (denied status). |
| 11 | Perk hover | Hover **or Tab-focus** a Results row: perk popover + aria show perk names when enrichment has socket+def data; otherwise honest “Perks unknown” — never fake perks. |
| 12 | Trash peek | Bottom bar shows **Trash · N**; Expand → staged list, mirror status, **Unstage selected**, **Repair Mirror**. Safe copy unchanged. |
| 13 | Mirror status | Trash rows show `mirror:ok\|pending\|failed\|none`. Failure still leaves Trash. |
| 14 | Repair Mirror | **Repair Mirror** re-attempts desynced rows. |
| 15 | Unstage | Unstage selected; junk tag cleared only if VK applied it. |
| 16 | Agent opt-in | Settings vault opt-in checkbox: without it, no full vault payload is sent. |
| 17 | Cancel agent | While Suggest runs, **Cancel** appears near Suggest and aborts in-flight request. |
| 18 | Idle | Close Workbench side surface; confirm no extension-driven polling (background is event-page / SW only). DIM remains snappy. |

## Out of scope (do not fail QA)

- In-extension dismantle / game delete (no Workbench **Dismantle** control)
- Bungie OAuth / DIM Sync Mirror
- Store listing / signed distribution (CWS / AMO / Edge Add-ons)
- Guaranteed perk completeness for every vault row (best-effort only)

## Evidence for agents

Live browser+DIM may be unavailable in CI. Automated bar: `npm test` + `npm run build` + dual-manifest contract tests + this checklist for humans.
