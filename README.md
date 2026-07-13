# Vault Keeper

Firefox MV3 extension companion for [Destiny Item Manager](https://www.destinyitemmanager.com/). Helps Guardians stage vault gear for **in-game** dismantle — never claims API/game delete.

Domain glossary: [`CONTEXT.md`](./CONTEXT.md).

## Requirements

- Node.js 24+ (LTS floor; see `engines` in package.json)
- Firefox 121+ (for temporary add-on load)

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

### Load temporary add-on

See [`docs/packaging.md`](./docs/packaging.md). Short path:

1. `npm run build`
2. Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select `dist/manifest.json`
4. Open DIM (`app.destinyitemmanager.com`), log in
5. Confirm the **VK** Light chip on the page (status only — does not open Workbench)
6. Open Workbench via toolbar button or sidebar (`_execute_sidebar_action`)

Optional package zip: `npm run package` → `artifacts/vault-keeper.zip`.

### Manual QA (live DIM)

Full happy-path checklist: [`docs/manual-qa.md`](./docs/manual-qa.md).

### Perf notes

- Vault list is **virtualized** (windowed rows) for 1000+ items.
- Background is an **event page** — no inventory/agent pollers when Workbench is closed.
- Agent requests are **cancelable**.

## Architecture (MVP seams)

| Module | Role |
|--------|------|
| `background` | Event page; message hub; no long polling |
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
- Host: `destinyitemmanager.com` (Light, IDB, dim-bridge)
- Host: `https://openrouter.ai/*` (default BYO agent)
- Optional: `https://*/*` / localhost for custom OpenRouter-compatible base URLs

No Bungie OAuth / identity permission. No auto-Stage. No in-extension dismantle.
