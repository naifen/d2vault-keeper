# Vault Keeper

MV3 browser extension companion for [Destiny Item Manager](https://www.destinyitemmanager.com/). Helps Guardians stage vault gear for **in-game** dismantle — never claims API/game delete.

Supports **Firefox** and **Chromium** (Chrome, Microsoft Edge) via dual-target packaging.

Domain glossary: [`CONTEXT.md`](./CONTEXT.md).

## Requirements

- Node.js 24+ (LTS floor; see `engines` in package.json)
- Firefox 121+ **or** Chromium 116+ (Chrome / Edge) for temporary extension load

## Develop

```bash
npm install
npm test
npm run typecheck
npm run build
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:

`npm ci` → typecheck → test → build → package smoke.

Spec: [`spec/spec-process-cicd-ci.md`](./spec/spec-process-cicd-ci.md).

### Load temporary extension

See [`docs/packaging.md`](./docs/packaging.md). Short paths:

**Firefox**

1. `npm run build`
2. `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select `dist/firefox/manifest.json`

**Chrome / Edge**

1. `npm run build`
2. `chrome://extensions` or `edge://extensions` → **Developer mode** → **Load unpacked**
3. Select the `dist/chromium/` directory

Then:

4. Open DIM (`app.destinyitemmanager.com`), log in
5. Confirm the **VK** Light chip on the page (status only — does not open Workbench)
6. Open Workbench via the toolbar action (Firefox sidebar / Chromium side panel)

Optional package zips: `npm run package` → `artifacts/vault-keeper-firefox.zip` and `artifacts/vault-keeper-chromium.zip`.

### Manual QA (live DIM)

Full happy-path checklist: [`docs/manual-qa.md`](./docs/manual-qa.md).

### Perf notes

- Vault list is **virtualized** (windowed rows) for 1000+ items.
- Background is an **event page / service worker** — no inventory/agent pollers when Workbench is closed.
- Agent requests are **cancelable**.

## Architecture (MVP seams)

| Module | Role |
|--------|------|
| `background` | Event page (Firefox) / service worker (Chromium); message hub; no long polling |
| `content` (Light) | On-page chip + dim-bridge host |
| `workbench` | Side panel UI |
| `messaging` | Typed envelopes Workbench ↔ background ↔ Light |
| `inventory` | Vault read from DIM IDB (+ defs/tags enrichment) |
| `trash` | Local Stage SoT |
| `mirror` | Best-effort junk via DIM local `dim-api-profile` IDB |
| `agent` | BYO Intention → filters |
| `dim-bridge` | Search apply + tag hooks |

## Permissions

- `storage` — Trash + agent settings
- `sidePanel` — Chromium Workbench surface only
- Host: `destinyitemmanager.com` (Light, IDB, dim-bridge)
- Host: `https://openrouter.ai/*` (default BYO agent)
- Optional: `https://*/*` / localhost for custom OpenRouter-compatible base URLs

No Bungie OAuth / identity permission. No auto-Stage. No in-extension dismantle.
