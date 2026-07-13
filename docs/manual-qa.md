# Manual QA checklist — Vault Keeper on live DIM

Use this after `npm run build` and loading the temporary add-on in Firefox.

## Setup

1. Firefox 121+ → `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → select `dist/manifest.json`.
2. Open [DIM](https://app.destinyitemmanager.com/) and log in until inventory is warm.
3. Confirm **VK** Light chip bottom-right on the page (status only).
4. Open **Workbench** via toolbar button or sidebar (`_execute_sidebar_action`), **not** via the Light chip.

## Happy path

| # | Step | Expected |
|---|------|----------|
| 1 | Workbench layout | Sections top→bottom: **Intention**, **Filter / results**, **Trash** (dark Destiny-adjacent chrome). |
| 2 | Connection | “Background connected”; optional round-trip OK when Light is on a DIM tab. |
| 3 | Refresh vault | With warm DIM cache: vault count + list. Missing cache: “Open DIM logged in…”. |
| 4 | Large vault | 1000+ rows: scroll stays interactive (virtualized window; only ~dozens of DOM rows). |
| 5 | Filter Apply | Type `is:weapon`, **Apply** → DIM search box updates; non-matches dim. |
| 6 | Filter Clear | **Clear** → DIM search empty. |
| 7 | Stage | Select non-exotic non-favorite vault rows → **Stage selected** (no confirm dialog). Appear in Trash. Copy says **not deleted from Destiny**. |
| 8 | Exclusions | Exotic / favorite cannot Stage by default. |
| 9 | Mirror status | Trash rows show `mirror:ok\|pending\|failed\|none`. Failure still leaves Trash. |
| 10 | Repair Mirror | **Repair Mirror** re-attempts desynced rows. |
| 11 | Unstage | Unstage selected; junk tag cleared only if VK applied it. |
| 12 | Agent | Save OpenRouter-compatible API key; Intention → **Run agent** → filters + explanation; recs listed but **no auto-Stage**. |
| 13 | Agent opt-in | Without vault opt-in checkbox, no full vault payload is sent. |
| 14 | Cancel agent | **Cancel** aborts in-flight request. |
| 15 | Idle | Close Workbench sidebar; confirm no extension-driven polling (background is event-page only). DIM remains snappy. |

## Out of scope (do not fail QA)

- In-extension dismantle / game delete
- Bungie OAuth / DIM Sync Mirror
- Chrome packaging

## Evidence for agents

Live Firefox+DIM may be unavailable in CI. Automated bar: `npm test` + `npm run build` + this checklist for humans.
